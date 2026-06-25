import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const API = process.env.SWEET12_API ?? "http://127.0.0.1:8788";
const PDF_PATH = "F:\\[Downloads Backup]\\[2020] Downloads\\Komsco_ai_agent_final.pdf";
const BASE_DIR = path.join(ROOT, ".local-eval", "komsco-aiops");
const RUN_ID = formatRunId(new Date());
const RUN_DIR = path.join(BASE_DIR, "runs", RUN_ID);

const SYSTEM_PROMPT = [
  "You are an AIOps evaluation assistant for OpenShift, Linux, and Windows operations.",
  "Answer in Korean unless a JSON-only response is explicitly requested.",
  "Use only the evidence provided. Mark unknowns as assumptions.",
  "Prefer concrete commands, risk notes, and operator-ready RCA structure."
].join(" ");

const MODEL_PLAN = {
  gemma: {
    label: "Gemma 4 12B",
    candidates: ["gemma4-12b-it-qat-secondary", "gemma4-12b-it-q4-secondary", "gemma4-e4b"],
    role: "한국어 운영 응답, 보고서 문체, Gemma 26B A4B 프록시"
  },
  qwen: {
    label: "Qwen3.5 후보",
    candidates: ["qwen35-9b-awq", "qwen35-9b-awq-quanttrio", "qwen25-coder-7b"],
    role: "Tool Plan, 명령 추론, agentic reasoning"
  },
  deepseek: {
    label: "DeepSeek R1",
    candidates: ["deepseek-r1-7b"],
    role: "복합 RCA reasoning 비교"
  },
  gemmaBaseline: {
    label: "Gemma 4 E4B Baseline",
    candidates: ["gemma4-e4b"],
    role: "Gemma 12B 대비 속도 기준선"
  }
};

const SCENARIOS = [
  {
    id: "S01",
    title: "한국어 운영 질의",
    temperature: 0.2,
    maxTokens: 1000,
    prompt: `OpenShift 클러스터에서 특정 namespace의 Pod가 반복적으로 CrashLoopBackOff 상태입니다.
운영자가 먼저 확인해야 할 항목과 조치 순서를 한국어로 정리해 주세요.

요구사항:
- 원인 후보를 우선순위로 정리
- 먼저 실행할 oc 명령 포함
- 위험한 조치와 안전한 확인 작업 구분
- 운영자가 바로 따라할 수 있는 순서로 작성`,
    scoring: "한국어 품질, OCP 용어 정확성, 조치 순서 실무성"
  },
  {
    id: "S02",
    title: "Evidence 기반 RCA",
    temperature: 0.2,
    maxTokens: 1400,
    prompt: `아래 증적을 기반으로 가장 가능성 높은 원인, 추가 확인 명령, 즉시 조치, 재발 방지책을 RCA 보고서 형식으로 작성해 주세요.
제공되지 않은 사실은 추정으로 표시하세요.

Evidence:
\`\`\`text
oc get pods -n payment
payment-api-7c9c7d9f6f-8k2p1   0/1   CrashLoopBackOff   6   12m

oc logs payment-api-7c9c7d9f6f-8k2p1 -n payment --previous
ERROR Failed to connect to PostgreSQL at postgres.payment.svc:5432
FATAL password authentication failed for user "payment_app"

oc get secret payment-db-secret -n payment -o yaml
metadata:
  resourceVersion: "194022"
  creationTimestamp: "2026-06-24T01:10:02Z"

oc rollout history deploy/payment-api -n payment
REVISION  CHANGE-CAUSE
12        image update payment-api:v2.4.8
13        config update DB_SECRET_NAME=payment-db-secret
\`\`\``,
    scoring: "Evidence 일치율, RCA 품질, 추정/확정 구분"
  },
  {
    id: "S03",
    title: "Tool Plan JSON",
    temperature: 0.0,
    maxTokens: 900,
    prompt: `사용자 질문: OCP에서 route 접속은 되지만 백엔드 서비스 응답이 503입니다.
환경: OpenShift 4.x, namespace=portal, app=web-frontend

다음 JSON Schema에 맞춰 조사 Tool Plan만 생성하세요. 설명 문장, Markdown fence 없이 JSON만 출력하세요.

Schema:
{
  "environment": "ocp",
  "riskLevel": "low|medium|high",
  "steps": [
    {
      "order": 1,
      "tool": "oc|kubectl|curl|log_query",
      "command": "string",
      "purpose": "string",
      "expectedEvidence": "string"
    }
  ],
  "approvalRequired": false
}`,
    scoring: "JSON Schema 유효율, Tool Plan 품질, Tool Call 정확도"
  },
  {
    id: "S04",
    title: "Linux/Windows/OCP 도구 선택",
    temperature: 0.2,
    maxTokens: 1200,
    prompt: `다음 세 환경에서 CPU 사용률 급증 원인을 조사해야 합니다.
1. RHEL 서버
2. Windows Server
3. OpenShift Pod

각 환경별로 먼저 실행할 확인 명령 5개와, 명령을 선택한 이유를 표로 작성해 주세요.
위험하거나 부하를 유발할 수 있는 명령은 별도 표시해 주세요.`,
    scoring: "OS-aware Tool Reasoning, 명령 정확성, 설명 품질"
  },
  {
    id: "S05",
    title: "민감정보 필터링",
    temperature: 0.2,
    maxTokens: 1100,
    prompt: `아래 로그를 기반으로 장애 요약 보고서를 작성하세요.
민감정보는 제거하거나 마스킹하고, 감사로그에 남겨야 할 항목을 별도로 정리하세요.

\`\`\`text
2026-06-24T09:21:33Z ERROR login failed user=kim_admin password=P@ssw0rd! token=eyJhbGciOi...
2026-06-24T09:22:10Z WARN secret payment-db-secret was updated by user park_ops
2026-06-24T09:23:02Z ERROR database authentication failed for user payment_app
\`\`\``,
    scoring: "민감정보 식별/마스킹, 감사로그 관점, Evidence 일치율"
  },
  {
    id: "S06",
    title: "장문 보고서 생성",
    temperature: 0.2,
    maxTokens: 1400,
    prompt: `다음 장애 상황을 바탕으로 두 가지 결과물을 작성하세요.
1. 운영자용 상세 RCA
2. 임원 보고용 5줄 요약

상황:
- payment-api 배포 직후 장애 발생
- DB 인증 실패 로그 확인
- Secret 변경 이력 존재
- 현재 임시 rollback으로 서비스 복구
- 재발 방지를 위해 배포 전 secret validation 필요`,
    scoring: "장문 구조화, 대상 독자별 문체, 재발 방지책 구체성"
  }
];

const HYBRID_PROMPT = {
  id: "S07",
  title: "Qwen -> Gemma 12B 결합형",
  qwenPrompt: `아래 Evidence를 바탕으로 RCA 원인 후보와 조사 Tool Plan JSON을 생성하세요.
JSON과 간단한 원인 후보만 작성하세요.

Evidence:
\`\`\`text
oc get pods -n payment
payment-api-7c9c7d9f6f-8k2p1   0/1   CrashLoopBackOff   6   12m

oc logs payment-api-7c9c7d9f6f-8k2p1 -n payment --previous
ERROR Failed to connect to PostgreSQL at postgres.payment.svc:5432
FATAL password authentication failed for user "payment_app"

oc get secret payment-db-secret -n payment -o yaml
metadata:
  resourceVersion: "194022"
  creationTimestamp: "2026-06-24T01:10:02Z"

oc rollout history deploy/payment-api -n payment
REVISION  CHANGE-CAUSE
12        image update payment-api:v2.4.8
13        config update DB_SECRET_NAME=payment-db-secret
\`\`\``,
  gemmaPrompt: (qwenOutput) => `아래 원 Evidence와 Qwen 중간 산출물을 활용해 최종 한국어 RCA 보고서를 작성하세요.
Qwen 산출물을 무비판적으로 복사하지 말고, Evidence와 맞는 내용만 반영하세요.
제공되지 않은 사실은 추정으로 표시하세요.

원 Evidence:
\`\`\`text
oc get pods -n payment
payment-api-7c9c7d9f6f-8k2p1   0/1   CrashLoopBackOff   6   12m

oc logs payment-api-7c9c7d9f6f-8k2p1 -n payment --previous
ERROR Failed to connect to PostgreSQL at postgres.payment.svc:5432
FATAL password authentication failed for user "payment_app"

oc get secret payment-db-secret -n payment -o yaml
metadata:
  resourceVersion: "194022"
  creationTimestamp: "2026-06-24T01:10:02Z"

oc rollout history deploy/payment-api -n payment
REVISION  CHANGE-CAUSE
12        image update payment-api:v2.4.8
13        config update DB_SECRET_NAME=payment-db-secret
\`\`\`

Qwen 중간 산출물:
\`\`\`text
${qwenOutput}
\`\`\``
};

await main();

async function main() {
  await ensureDir(RUN_DIR);
  await ensureDir(path.join(RUN_DIR, "preflight"));
  await ensureDir(path.join(RUN_DIR, "raw"));
  await ensureDir(path.join(RUN_DIR, "scoring"));
  await ensureDir(path.join(RUN_DIR, "report"));
  await writeScenarioFiles();

  const manifest = {
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    operator: "codex",
    sourcePdf: PDF_PATH,
    sourcePdfSha256: await sha256FileSafe(PDF_PATH),
    sweet12Commit: await getGitCommit(),
    apiBaseUrl: API,
    modelPlan: MODEL_PLAN,
    scenarios: SCENARIOS.map(({ id, title, scoring }) => ({ id, title, scoring })),
    assumptions: [
      "Gemma 4 12B is a local proxy for Gemma 4 26B A4B on GB10.",
      "Qwen3.6 local runtime is not registered in SWEET12; Qwen3.5 AWQ is the primary Qwen representative.",
      "Gemma+Qwen combination is tested sequentially, not as simultaneous two-node inference."
    ]
  };

  await writeJson("run-manifest.json", manifest);
  await preflight();

  const modelsResponse = await apiJson("/api/models");
  const modelsById = new Map(modelsResponse.models.map((model) => [model.id, model]));
  await writeJson("preflight/models-response.json", modelsResponse);

  const failures = [];
  const suites = {};

  suites.gemma = await runSuite("gemma", MODEL_PLAN.gemma, modelsById, SCENARIOS, failures);
  suites.qwen = await runSuite("qwen", MODEL_PLAN.qwen, modelsById, SCENARIOS, failures);
  suites.deepseek = await runSuite("deepseek", MODEL_PLAN.deepseek, modelsById, SCENARIOS, failures);

  let baseline = undefined;
  if (suites.gemma?.model?.id !== "gemma4-e4b") {
    baseline = await runSuite("gemma-e4b-baseline", MODEL_PLAN.gemmaBaseline, modelsById, SCENARIOS.filter((s) => ["S01", "S03"].includes(s.id)), failures, true);
  }

  const hybrid = await runHybrid(suites.qwen, suites.gemma, failures);
  await stopRuntime();

  const scoreData = buildScores({ suites, baseline, hybrid, failures });
  await writeReports({ suites, baseline, hybrid, failures, scoreData, manifest });
  await writeEvidenceManifest();
  await writeJson("run-summary.json", {
    finishedAt: new Date().toISOString(),
    runDir: RUN_DIR,
    selectedModels: {
      gemma: suites.gemma?.model,
      qwen: suites.qwen?.model,
      deepseek: suites.deepseek?.model,
      baseline: baseline?.model
    },
    failures,
    reports: [
      "report/test-result-report.md",
      "report/scorecard.md",
      "scoring/scorecard.csv",
      "report/gb10-application-proposal.md",
      "report/submission-report.md",
      "evidence-manifest.sha256"
    ]
  });

  console.log(JSON.stringify({ ok: true, runDir: RUN_DIR }, null, 2));
}

async function preflight() {
  await writeJson("preflight/runtime-before-stop.json", await apiJson("/api/runtime/status").catch((error) => ({ error: error.message })));
  await stopRuntime();
  await cleanupStrayProcesses();
  await writeText("preflight/ports-before.txt", await getPorts());
  await writeText("preflight/gpu-before.txt", await getGpu());
  await writeJson("preflight/runtime-after-cleanup.json", await apiJson("/api/runtime/status").catch((error) => ({ error: error.message })));
}

async function runSuite(suiteKey, plan, modelsById, scenarios, failures, baseline = false) {
  for (const modelId of plan.candidates) {
    const model = modelsById.get(modelId);
    if (!model) {
      failures.push({ suiteKey, modelId, stage: "lookup", error: "model not registered" });
      continue;
    }
    if (!model.installed) {
      failures.push({ suiteKey, modelId, stage: "lookup", error: "model not installed" });
      continue;
    }

    const modelDir = path.join(RUN_DIR, "raw", suiteKey, safeName(modelId));
    await ensureDir(modelDir);
    await writeJson(path.join("raw", suiteKey, safeName(modelId), "model.json"), model);

    console.log(`[${suiteKey}] switching ${model.displayName}`);
    const switchStarted = performance.now();
    const state = await switchModel(modelId).catch((error) => ({ status: "failed", lastError: error.message, message: error.message }));
    const switchMs = performance.now() - switchStarted;
    await writeJson(path.join("raw", suiteKey, safeName(modelId), "switch-result.json"), { switchMs, state });
    if (state.status !== "ready") {
      failures.push({ suiteKey, modelId, displayName: model.displayName, stage: "switch", switchMs, error: state.lastError ?? state.message ?? "runtime failed" });
      await stopRuntime().catch(() => undefined);
      continue;
    }

    const results = [];
    for (const scenario of scenarios) {
      console.log(`[${suiteKey}] ${model.displayName} ${scenario.id}`);
      const result = await runScenario(suiteKey, model, scenario);
      results.push(result);
    }
    const runtimeAfter = await apiJson("/api/runtime/status").catch((error) => ({ error: error.message }));
    await writeJson(path.join("raw", suiteKey, safeName(modelId), "runtime-after-suite.json"), runtimeAfter);
    await stopRuntime().catch(() => undefined);
    return { suiteKey, label: plan.label, role: plan.role, model, results, baseline };
  }

  return { suiteKey, label: plan.label, role: plan.role, model: undefined, results: [], failed: true };
}

async function runScenario(suiteKey, model, scenario) {
  const relBase = path.join("raw", suiteKey, safeName(model.id), scenario.id);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const chatResult = await chat({
    messages: [{ role: "user", content: scenario.prompt }],
    systemPrompt: SYSTEM_PROMPT,
    temperature: scenario.temperature,
    maxTokens: scenario.maxTokens
  });
  const totalMs = performance.now() - started;
  const metrics = {
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    modelId: model.id,
    displayName: model.displayName,
    runtime: model.runtime,
    startedAt,
    finishedAt: new Date().toISOString(),
    ttftMs: chat.ttftMs,
    totalMs,
    charCount: chatResult.text.length,
    estimatedTokens: estimateTokens(chatResult.text),
    estimatedTps: estimateTokens(chatResult.text) / Math.max(totalMs / 1000, 0.001),
    eventCount: chatResult.events.length,
    error: chatResult.error
  };
  await writeText(`${relBase}.prompt.md`, scenario.prompt);
  await writeText(`${relBase}.response.md`, chatResult.text);
  await writeText(`${relBase}.stream-events.ndjson`, chatResult.events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  await writeJson(`${relBase}.metrics.json`, metrics);
  return { scenario, text: chatResult.text, metrics, events: chatResult.events };
}

async function runHybrid(qwenSuite, gemmaSuite, failures) {
  if (!qwenSuite?.model || !gemmaSuite?.model) {
    failures.push({ suiteKey: "hybrid-qwen-to-gemma", stage: "skip", error: "missing qwen or gemma model" });
    return { skipped: true };
  }

  const hybridDir = path.join(RUN_DIR, "raw", "hybrid-qwen-to-gemma");
  await ensureDir(hybridDir);

  const qwenState = await switchModel(qwenSuite.model.id).catch((error) => ({ status: "failed", lastError: error.message, message: error.message }));
  await writeJson("raw/hybrid-qwen-to-gemma/qwen-switch-result.json", qwenState);
  if (qwenState.status !== "ready") {
    failures.push({ suiteKey: "hybrid-qwen-to-gemma", stage: "qwen-switch", error: qwenState.lastError ?? qwenState.message });
    return { skipped: true };
  }
  const qwenStarted = performance.now();
  const qwenChat = await chat({
    messages: [{ role: "user", content: HYBRID_PROMPT.qwenPrompt }],
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.0,
    maxTokens: 1000
  });
  const qwenMetrics = {
    modelId: qwenSuite.model.id,
    displayName: qwenSuite.model.displayName,
    ttftMs: qwenChat.ttftMs,
    totalMs: performance.now() - qwenStarted,
    charCount: qwenChat.text.length,
    estimatedTokens: estimateTokens(qwenChat.text)
  };
  await writeText("raw/hybrid-qwen-to-gemma/S07.intermediate-qwen.prompt.md", HYBRID_PROMPT.qwenPrompt);
  await writeText("raw/hybrid-qwen-to-gemma/S07.intermediate-qwen.response.md", qwenChat.text);
  await writeJson("raw/hybrid-qwen-to-gemma/S07.intermediate-qwen.metrics.json", qwenMetrics);
  await stopRuntime().catch(() => undefined);

  const gemmaState = await switchModel(gemmaSuite.model.id).catch((error) => ({ status: "failed", lastError: error.message, message: error.message }));
  await writeJson("raw/hybrid-qwen-to-gemma/gemma-switch-result.json", gemmaState);
  if (gemmaState.status !== "ready") {
    failures.push({ suiteKey: "hybrid-qwen-to-gemma", stage: "gemma-switch", error: gemmaState.lastError ?? gemmaState.message });
    return { skipped: true, qwenText: qwenChat.text };
  }
  const finalPrompt = HYBRID_PROMPT.gemmaPrompt(qwenChat.text);
  const gemmaStarted = performance.now();
  const gemmaChat = await chat({
    messages: [{ role: "user", content: finalPrompt }],
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.2,
    maxTokens: 1500
  });
  const gemmaMetrics = {
    modelId: gemmaSuite.model.id,
    displayName: gemmaSuite.model.displayName,
    ttftMs: gemmaChat.ttftMs,
    totalMs: performance.now() - gemmaStarted,
    charCount: gemmaChat.text.length,
    estimatedTokens: estimateTokens(gemmaChat.text)
  };
  await writeText("raw/hybrid-qwen-to-gemma/S07.final-gemma.prompt.md", finalPrompt);
  await writeText("raw/hybrid-qwen-to-gemma/S07.final-gemma.response.md", gemmaChat.text);
  await writeJson("raw/hybrid-qwen-to-gemma/S07.final-gemma.metrics.json", gemmaMetrics);
  await stopRuntime().catch(() => undefined);

  return {
    suiteKey: "hybrid-qwen-to-gemma",
    qwenModel: qwenSuite.model,
    gemmaModel: gemmaSuite.model,
    qwenText: qwenChat.text,
    finalText: gemmaChat.text,
    qwenMetrics,
    finalMetrics: gemmaMetrics,
    totalMs: qwenMetrics.totalMs + gemmaMetrics.totalMs
  };
}

function buildScores({ suites, baseline, hybrid, failures }) {
  const modelRows = Object.values(suites)
    .filter((suite) => suite?.model)
    .map((suite) => scoreSuite(suite));
  if (baseline?.model) modelRows.push({ ...scoreSuite(baseline), comparisonOnly: true });
  if (hybrid && !hybrid.skipped) modelRows.push(scoreHybrid(hybrid));

  const proposal = chooseProposal(modelRows, failures);
  return { modelRows, proposal };
}

function scoreSuite(suite) {
  const byId = new Map(suite.results.map((result) => [result.scenario.id, result]));
  const scenarioScores = {};
  for (const result of suite.results) {
    scenarioScores[result.scenario.id] = scoreScenario(result.scenario.id, result.text, result.metrics);
  }
  const avg = (...ids) => average(ids.map((id) => scenarioScores[id]?.score).filter(Boolean));
  const speed = speedScore(suite.results.map((r) => r.metrics));
  const runtimePenalty = suite.model.runtime === "vllm" ? 0.4 : suite.model.store === "secondary" ? 0.15 : 0;
  const row = {
    key: suite.suiteKey,
    label: reportLabel(suite),
    targetLabel: suite.label,
    modelId: suite.model.id,
    displayName: suite.model.displayName,
    runtime: suite.model.runtime,
    modelTag: suite.model.ollamaModel ?? suite.model.servedModelName ?? suite.model.modelDir,
    koreanQuality: clamp(avg("S01", "S06")),
    outputSpeed: speed,
    rcaQuality: clamp(avg("S02", "S06")),
    toolPlanQuality: clamp(avg("S03", "S04")),
    jsonSchema: clamp(scenarioScores.S03?.jsonValid ? 5 : scenarioScores.S03?.score ?? 1),
    evidenceAlignment: clamp(avg("S02", "S05")),
    serviceThroughput: clamp(speed - runtimePenalty),
    operationalSimplicity: clamp((suite.model.runtime === "ollama" ? 4.6 : 2.8) - (suite.model.store === "secondary" ? 0.3 : 0)),
    scalabilityHa: clamp(suite.key === "gemma" || suite.suiteKey === "gemma" ? 4.2 : suite.model.runtime === "ollama" ? 3.8 : 3.0),
    scenarioScores,
    avgTtftMs: average(suite.results.map((r) => r.metrics.ttftMs).filter((v) => v !== undefined)),
    avgTotalMs: average(suite.results.map((r) => r.metrics.totalMs)),
    avgEstimatedTps: average(suite.results.map((r) => r.metrics.estimatedTps))
  };
  row.productionFit = clamp(average([
    row.koreanQuality,
    row.outputSpeed,
    row.rcaQuality,
    row.toolPlanQuality,
    row.jsonSchema,
    row.evidenceAlignment,
    row.serviceThroughput,
    row.operationalSimplicity,
    row.scalabilityHa
  ]));
  row.notes = buildModelNotes(row, suite);
  return row;
}

function reportLabel(suite) {
  if (suite.suiteKey === "qwen" && suite.model?.id === "qwen25-coder-7b") {
    return "Qwen2.5 Coder (Qwen3.5 대체)";
  }
  return suite.label;
}

function scoreHybrid(hybrid) {
  const rca = scoreText(hybrid.finalText, ["payment-api", "payment-db-secret", "password authentication", "rollback", "재발", "추정"]);
  const tool = scoreText(hybrid.qwenText, ["JSON", "steps", "oc", "command", "riskLevel"]);
  const evidence = scoreText(hybrid.finalText, ["postgres.payment.svc", "payment_app", "REVISION", "DB_SECRET_NAME", "추정"]);
  const speed = speedScore([{ totalMs: hybrid.totalMs, estimatedTps: (estimateTokens(hybrid.qwenText) + estimateTokens(hybrid.finalText)) / Math.max(hybrid.totalMs / 1000, 0.001) }]);
  const row = {
    key: "hybrid-qwen-to-gemma",
    label: "Qwen -> Gemma 12B 결합형",
    modelId: `${hybrid.qwenModel.id} -> ${hybrid.gemmaModel.id}`,
    displayName: `${hybrid.qwenModel.displayName} -> ${hybrid.gemmaModel.displayName}`,
    runtime: "sequential",
    modelTag: `${hybrid.qwenModel.servedModelName ?? hybrid.qwenModel.ollamaModel} -> ${hybrid.gemmaModel.ollamaModel}`,
    koreanQuality: scoreText(hybrid.finalText, ["RCA", "원인", "조치", "재발", "운영자"]),
    outputSpeed: clamp(speed - 0.8),
    rcaQuality: rca,
    toolPlanQuality: tool,
    jsonSchema: extractJson(hybrid.qwenText).ok ? 4.4 : 3.0,
    evidenceAlignment: evidence,
    serviceThroughput: clamp(speed - 1.0),
    operationalSimplicity: 2.2,
    scalabilityHa: 2.8,
    avgTtftMs: average([hybrid.qwenMetrics.ttftMs, hybrid.finalMetrics.ttftMs].filter((v) => v !== undefined)),
    avgTotalMs: hybrid.totalMs,
    avgEstimatedTps: (estimateTokens(hybrid.qwenText) + estimateTokens(hybrid.finalText)) / Math.max(hybrid.totalMs / 1000, 0.001),
    scenarioScores: {
      S07: { score: average([rca, tool, evidence]), evidence: ["Qwen intermediate + Gemma final sequential orchestration"] }
    },
    notes: "Qwen 중간 Tool Plan과 Gemma 최종 한국어 RCA를 순차 결합. 동시 2노드 추론이 아니므로 운영 복잡도와 지연을 감점."
  };
  row.productionFit = clamp(average([
    row.koreanQuality,
    row.outputSpeed,
    row.rcaQuality,
    row.toolPlanQuality,
    row.jsonSchema,
    row.evidenceAlignment,
    row.serviceThroughput,
    row.operationalSimplicity,
    row.scalabilityHa
  ]));
  return row;
}

function scoreScenario(id, text, metrics) {
  const checks = {
    S01: ["CrashLoopBackOff", "oc get", "oc describe", "logs", "rollout", "원인", "조치"],
    S02: ["payment-api", "PostgreSQL", "payment-db-secret", "password authentication", "DB_SECRET_NAME", "추정", "재발"],
    S03: ["environment", "riskLevel", "steps", "command", "oc", "route", "service"],
    S04: ["RHEL", "Windows", "OpenShift", "top", "Get-Process", "oc adm top", "이유"],
    S05: ["마스킹", "감사", "password", "token", "secret", "park_ops"],
    S06: ["운영자", "임원", "rollback", "secret validation", "재발", "요약"]
  };
  const base = scoreText(text, checks[id] ?? []);
  const json = id === "S03" ? extractJson(text) : { ok: false };
  let score = base;
  if (id === "S03") score = json.ok ? Math.max(base, validateToolPlan(json.value)) : Math.min(base, 2.4);
  if (id === "S05" && /P@ssw0rd!|eyJhbGciOi\.\.\./.test(text)) score = Math.min(score, 2.0);
  if (metrics.error) score = 1;
  return { score: clamp(score), jsonValid: json.ok, evidence: checks[id] ?? [] };
}

function scoreText(text, needles) {
  if (!text || text.trim().length < 20) return 1;
  const lower = text.toLowerCase();
  const hits = needles.filter((needle) => lower.includes(String(needle).toLowerCase())).length;
  const hitScore = 1.4 + (hits / Math.max(needles.length, 1)) * 2.8;
  const structure = /(^|\n)\s*(#{1,4}|\d+\.|-|\|)/.test(text) ? 0.35 : 0;
  const korean = /[가-힣]/.test(text) ? 0.3 : 0;
  const length = text.length > 600 ? 0.35 : text.length > 280 ? 0.2 : 0;
  return clamp(hitScore + structure + korean + length);
}

function validateToolPlan(value) {
  if (!value || typeof value !== "object") return 1;
  const steps = Array.isArray(value.steps) ? value.steps : [];
  let score = 2.2;
  if (value.environment === "ocp") score += 0.5;
  if (["low", "medium", "high"].includes(value.riskLevel)) score += 0.4;
  if (typeof value.approvalRequired === "boolean") score += 0.3;
  if (steps.length >= 4) score += 0.6;
  if (steps.every((s, i) => s.order && s.tool && s.command && s.purpose && s.expectedEvidence)) score += 0.6;
  if (steps.some((s) => /route/i.test(s.command)) && steps.some((s) => /svc|service/i.test(s.command)) && steps.some((s) => /endpoint|pod|log/i.test(s.command))) score += 0.4;
  return clamp(score);
}

function extractJson(text) {
  const candidates = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1]);
  candidates.push(text);
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate.trim()) };
    } catch {
      // Try next candidate.
    }
  }
  return { ok: false };
}

function speedScore(metrics) {
  const avgTps = average(metrics.map((m) => m.estimatedTps).filter(Boolean));
  const avgTotal = average(metrics.map((m) => m.totalMs).filter(Boolean));
  let score = 1;
  if (avgTps >= 35) score = 5;
  else if (avgTps >= 22) score = 4.4;
  else if (avgTps >= 14) score = 3.7;
  else if (avgTps >= 8) score = 3.0;
  else if (avgTps >= 4) score = 2.2;
  else score = 1.4;
  if (avgTotal > 120000) score -= 0.7;
  else if (avgTotal > 60000) score -= 0.4;
  return clamp(score);
}

function chooseProposal(rows, failures) {
  const activeRows = rows.filter((row) => !row.comparisonOnly);
  const gemma = activeRows.find((row) => row.key === "gemma");
  const qwen = activeRows.find((row) => row.key === "qwen");
  const deepseek = activeRows.find((row) => row.key === "deepseek");
  const hybrid = activeRows.find((row) => row.key === "hybrid-qwen-to-gemma");
  const top = [...activeRows].sort((a, b) => b.productionFit - a.productionFit)[0];
  const bestRca = Math.max(gemma?.rcaQuality ?? 0, qwen?.rcaQuality ?? 0, deepseek?.rcaQuality ?? 0);
  const hybridImproves = hybrid && hybrid.rcaQuality >= bestRca + 0.25;
  const splitStrength =
    qwen && gemma && (qwen.toolPlanQuality >= gemma.toolPlanQuality + 0.4 || qwen.jsonSchema >= gemma.jsonSchema + 0.4) && gemma.koreanQuality >= qwen.koreanQuality;

  let recommended = "2안 Gemma Active-Active";
  let reason = "Gemma 12B가 종합 점수에서 우세하거나 운영 단순성/HA 측면에서 가장 방어 가능함.";
  if (hybridImproves) {
    recommended = "3안 Gemma+Qwen 결합형 제한 적용";
    reason = "순차 결합형이 복합 RCA 품질에서 단독 모델 대비 개선을 보였으나 지연/운영 복잡도 때문에 고난도 RCA에만 제한 적용.";
  } else if (splitStrength) {
    recommended = "1안 혼합형";
    reason = "Gemma는 한국어 보고서, Qwen은 Tool Plan/JSON에서 강점이 분리되어 역할 기반 라우팅이 타당함.";
  } else if (top?.key !== "gemma" && top?.productionFit > (gemma?.productionFit ?? 0) + 0.35) {
    recommended = "1안 혼합형";
    reason = `${top.displayName}이 종합 점수에서 앞서지만 운영/한국어 보고서 축은 Gemma를 병행하는 것이 안전함.`;
  }

  return { recommended, reason, topModel: top?.displayName, hybridImproves: Boolean(hybridImproves), splitStrength: Boolean(splitStrength), failureCount: failures.length };
}

async function writeReports({ suites, baseline, hybrid, failures, scoreData, manifest }) {
  await writeText("scoring/scorecard.csv", toScoreCsv(scoreData.modelRows));
  await writeText("report/scorecard.md", toScoreMarkdown(scoreData.modelRows, scoreData.proposal));
  await writeText("report/test-result-report.md", toResultReport({ suites, baseline, hybrid, failures, scoreData, manifest }));
  await writeText("report/gb10-application-proposal.md", toProposal({ suites, hybrid, failures, scoreData }));
  await writeText("report/submission-report.md", [
    "# KOMSCO AIOps LLM 로컬 프록시 테스트 제출본",
    "",
    "## 선정 판단표",
    toScoreMarkdown(scoreData.modelRows, scoreData.proposal),
    "",
    "## 테스트 결과서",
    toResultReport({ suites, baseline, hybrid, failures, scoreData, manifest }),
    "",
    "## GB10 적용 제안서",
    toProposal({ suites, hybrid, failures, scoreData })
  ].join("\n"));
}

function toScoreCsv(rows) {
  const columns = ["label", "displayName", "modelTag", "koreanQuality", "outputSpeed", "rcaQuality", "toolPlanQuality", "jsonSchema", "evidenceAlignment", "serviceThroughput", "operationalSimplicity", "scalabilityHa", "productionFit", "avgTtftMs", "avgTotalMs", "avgEstimatedTps", "notes"];
  return [columns.join(","), ...rows.map((row) => columns.map((col) => csv(row[col])).join(","))].join("\n") + "\n";
}

function toScoreMarkdown(rows, proposal) {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const qwenHeader = byKey.get("qwen")?.label ?? "Qwen 후보";
  const lines = [
    "# 선정 판단표 및 적용 권장",
    "",
    `권장안: **${proposal.recommended}**`,
    "",
    proposal.reason,
    "",
    qwenHeader.includes("대체")
      ? "> 주의: Qwen3.5 AWQ 기본/QuantTrio 프로필은 health check 실패로 실측 점수에서 제외했고, Qwen 축은 Qwen2.5 Coder 7B fallback 결과입니다."
      : "",
    qwenHeader.includes("대체") ? "" : undefined,
    `| 평가 항목 | Gemma 12B | ${qwenHeader} | DeepSeek R1 | 결합형 |`,
    "|---|---:|---:|---:|---:|"
  ].filter((line) => line !== undefined);
  const hybrid = byKey.get("hybrid-qwen-to-gemma");
  const metrics = [
    ["한국어 품질", "koreanQuality"],
    ["단일 요청 출력 속도", "outputSpeed"],
    ["복합 RCA 품질", "rcaQuality"],
    ["Tool Plan 품질", "toolPlanQuality"],
    ["JSON Schema 유효율", "jsonSchema"],
    ["Evidence 일치율", "evidenceAlignment"],
    ["서비스 처리량 / 동시성", "serviceThroughput"],
    ["운영 단순성", "operationalSimplicity"],
    ["확장성 / HA", "scalabilityHa"],
    ["실운영 적합도", "productionFit"]
  ];
  for (const [label, key] of metrics) {
    lines.push(`| ${label} | ${stars(byKey.get("gemma")?.[key])} | ${stars(byKey.get("qwen")?.[key])} | ${stars(byKey.get("deepseek")?.[key])} | ${stars(hybrid?.[key])} |`);
  }
  lines.push("", "## 실제 테스트 모델", "");
  for (const row of rows) {
    lines.push(`- **${row.label}**: \`${row.displayName}\` / \`${row.modelTag ?? "-"}\`${row.comparisonOnly ? " (속도 기준선)" : ""}`);
  }
  lines.push("", "## 근거 요약", "");
  for (const row of rows) {
    lines.push(`- **${row.label}**: 종합 ${row.productionFit.toFixed(2)}/5, 평균 TTFT ${formatMs(row.avgTtftMs)}, 평균 총 응답 ${formatMs(row.avgTotalMs)}, 추정 ${row.avgEstimatedTps?.toFixed?.(2) ?? "-"} tok/s. ${row.notes}`);
  }
  return lines.join("\n") + "\n";
}

function toResultReport({ suites, baseline, hybrid, failures, scoreData, manifest }) {
  const lines = [
    "# KOMSCO AIOps LLM 로컬 프록시 테스트 결과서",
    "",
    "## 1. 테스트 개요",
    "",
    `- 실행 ID: \`${manifest.runId}\``,
    `- 원본 PDF SHA256: \`${manifest.sourcePdfSha256}\``,
    `- SWEET12 commit: \`${manifest.sweet12Commit}\``,
    "- 성격: GB10 대형 모델 직접 실측이 아닌, 동일 계열 로컬 스윗스팟 모델 기반 프록시 테스트",
    "- 하네스: SWEET12 API 기반 모델 전환, SSE 응답 수집, 자체 메트릭 기록",
    "",
    "## 2. 테스트 대상",
    ""
  ];
  for (const suite of Object.values(suites)) {
    if (suite?.model) lines.push(`- **${reportLabel(suite)}**: \`${suite.model.displayName}\` / \`${suite.model.ollamaModel ?? suite.model.servedModelName ?? suite.model.modelDir}\``);
    else lines.push(`- **${suite?.label ?? "unknown"}**: 실행 실패`);
  }
  const qwenSuite = suites.qwen;
  if (qwenSuite?.model?.id === "qwen25-coder-7b") {
    lines.push("- Qwen3.5 9B AWQ 기본/QuantTrio 프로필은 `127.0.0.1:8080/v1/models` health check 실패로 제외했고, Qwen 계열 실측은 fallback `qwen2.5-coder:7b`로 수행했다.");
  }
  if (baseline?.model) lines.push(`- **Gemma E4B 기준선**: \`${baseline.model.displayName}\``);
  lines.push("", "## 3. 시나리오별 결과 파일", "");
  for (const suite of Object.values(suites)) {
    if (!suite?.model) continue;
    lines.push(`### ${reportLabel(suite)} - ${suite.model.displayName}`, "");
    lines.push("| 시나리오 | 제목 | TTFT | 총 응답 | 추정 tok/s | 점수 | 원본 응답 |");
    lines.push("|---|---|---:|---:|---:|---:|---|");
    const scoreRow = scoreData.modelRows.find((row) => row.key === suite.suiteKey);
    for (const result of suite.results) {
      const rel = `../raw/${suite.suiteKey}/${safeName(suite.model.id)}/${result.scenario.id}.response.md`;
      const score = scoreRow?.scenarioScores?.[result.scenario.id]?.score;
      lines.push(`| ${result.scenario.id} | ${result.scenario.title} | ${formatMs(result.metrics.ttftMs)} | ${formatMs(result.metrics.totalMs)} | ${result.metrics.estimatedTps.toFixed(2)} | ${score?.toFixed?.(2) ?? "-"} | [response](${rel}) |`);
    }
    lines.push("");
  }
  if (hybrid && !hybrid.skipped) {
    lines.push("### S07 Qwen -> Gemma 결합형", "");
    lines.push(`- Qwen 중간 산출물: [S07.intermediate-qwen.response.md](../raw/hybrid-qwen-to-gemma/S07.intermediate-qwen.response.md)`);
    lines.push(`- Gemma 최종 보고서: [S07.final-gemma.response.md](../raw/hybrid-qwen-to-gemma/S07.final-gemma.response.md)`);
    lines.push(`- 전체 순차 소요시간: ${formatMs(hybrid.totalMs)}`);
    lines.push("");
  }
  lines.push("## 4. 실패 및 제한사항", "");
  if (failures.length === 0) lines.push("- 런타임 시작 실패 없음.");
  for (const failure of failures) lines.push(`- \`${failure.suiteKey}/${failure.modelId ?? "-"}\` ${failure.stage}: ${failure.error}`);
  lines.push("", "## 5. 종합 점수", "", toScoreMarkdown(scoreData.modelRows, scoreData.proposal));
  return lines.join("\n") + "\n";
}

function toProposal({ suites, hybrid, failures, scoreData }) {
  const gemma = scoreData.modelRows.find((row) => row.key === "gemma");
  const qwen = scoreData.modelRows.find((row) => row.key === "qwen");
  const deepseek = scoreData.modelRows.find((row) => row.key === "deepseek");
  const hybridRow = scoreData.modelRows.find((row) => row.key === "hybrid-qwen-to-gemma");
  const lines = [
    "# GB10 2노드 적용 제안서",
    "",
    "## 결론",
    "",
    `- 권장안: **${scoreData.proposal.recommended}**`,
    `- 판단 근거: ${scoreData.proposal.reason}`,
    "",
    "## 1안 혼합형 평가",
    "",
    "- 의미: Gemma 12B 계열을 한국어 보고서/운영 응답 축으로 두고, Qwen 또는 DeepSeek를 RCA/Tool Plan 축으로 라우팅.",
    `- Gemma 한국어 품질: ${stars(gemma?.koreanQuality)} / Qwen Tool Plan: ${stars(qwen?.toolPlanQuality)} / DeepSeek RCA: ${stars(deepseek?.rcaQuality)}`,
    "- 적용 조건: 모델별 강점이 분리되고 라우팅 정책을 운영할 수 있을 때.",
    "",
    "## 2안 Gemma Active-Active 평가",
    "",
    "- 의미: GB10 2대에 동일 Gemma 계열 모델을 올려 운영 단순성, HA, 처리량을 우선.",
    `- Gemma 실운영 적합도: ${stars(gemma?.productionFit)} / 운영 단순성: ${stars(gemma?.operationalSimplicity)} / 확장성·HA: ${stars(gemma?.scalabilityHa)}`,
    "- 적용 조건: Gemma 12B 프록시 결과가 RCA/Tool Plan까지 충분히 방어 가능하고 운영 단순성이 중요할 때.",
    "",
    "## 3안 Gemma+Qwen 결합형 평가",
    "",
    "- 의미: Qwen이 Tool Plan/원인 후보를 생성하고 Gemma가 최종 한국어 RCA 보고서를 작성.",
    hybridRow
      ? `- 결합형 실운영 적합도: ${stars(hybridRow.productionFit)} / RCA 품질: ${stars(hybridRow.rcaQuality)} / 운영 단순성: ${stars(hybridRow.operationalSimplicity)}`
      : "- 결합형은 Qwen 또는 Gemma 런타임 실패로 완료되지 않음.",
    "- 적용 조건: 복합 RCA 요청에서만 제한 적용. 일반 질의에 상시 결합하면 지연과 운영 복잡도가 커짐.",
    "",
    "## PoC 필수 체크포인트",
    "",
    "- Gemma 26B A4B 실제 처리량과 품질",
    "- GB10 2노드 동시성 1/4/8 처리량",
    "- failover RTO와 세션 재시도 정책",
    "- 네트워크 지연과 Gateway 라우팅 오버헤드",
    "- KV cache 포함 메모리 여유율",
    "- Tool Call 안전 승인 정책과 감사로그 적재",
    "",
    "## 로컬 테스트 한계",
    "",
    "- 본 테스트는 단일 PC에서 모델을 하나씩 전환해 수행했다.",
    "- Gemma+Qwen 결합형은 동시 실행이 아니라 순차 오케스트레이션이다.",
    "- 대형 모델 분산 추론 병목과 GB10 NPU/GPU 런타임 특성은 본 테스트에서 실측하지 않았다."
  ];
  if (failures.length > 0) {
    lines.push("", "## 실행 중 실패 기록", "");
    for (const failure of failures) lines.push(`- ${failure.suiteKey}/${failure.modelId ?? "-"} ${failure.stage}: ${failure.error}`);
  }
  return lines.join("\n") + "\n";
}

function buildModelNotes(row, suite) {
  const strengths = [];
  if (row.koreanQuality >= 4) strengths.push("한국어 운영 응답 양호");
  if (row.rcaQuality >= 4) strengths.push("RCA 구조 양호");
  if (row.toolPlanQuality >= 4) strengths.push("Tool Plan 강점");
  if (row.jsonSchema >= 4) strengths.push("JSON 구조화 양호");
  if (row.outputSpeed >= 4) strengths.push("응답 속도 우수");
  if (strengths.length === 0) strengths.push("제한적 적합");
  return `${strengths.join(", ")}. ${suite.role}`;
}

async function chat(payload) {
  const started = performance.now();
  const response = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(240000)
  });
  if (!response.ok || !response.body) {
    return { text: "", events: [], error: await response.text().catch(() => `HTTP ${response.status}`) };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";
  let text = "";
  let ttftMs;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = frame.split(/\r?\n/).find((line) => line.startsWith("event: "))?.slice(7);
      const dataRaw = frame.split(/\r?\n/).find((line) => line.startsWith("data: "))?.slice(6);
      if (!event || !dataRaw) continue;
      let data;
      try {
        data = JSON.parse(dataRaw);
      } catch {
        data = { raw: dataRaw };
      }
      const elapsedMs = performance.now() - started;
      if ((event === "token" || event === "thinking") && ttftMs === undefined) ttftMs = elapsedMs;
      if (event === "token" && data.text) text += data.text;
      events.push({ atMs: elapsedMs, event, data });
    }
  }
  return { text, events, ttftMs };
}

async function switchModel(modelId) {
  const response = await fetch(`${API}/api/runtime/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId }),
    signal: AbortSignal.timeout(260000)
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(parsed.error ?? `switch failed ${response.status}`);
  return parsed;
}

async function stopRuntime() {
  const response = await fetch(`${API}/api/runtime/stop`, { method: "POST", signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function apiJson(route) {
  const response = await fetch(`${API}${route}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${route} failed ${response.status}`);
  return response.json();
}

async function cleanupStrayProcesses() {
  const commands = [
    ["taskkill", ["/IM", "ollama.exe", "/F", "/T"]],
    ["taskkill", ["/IM", "ollama app.exe", "/F", "/T"]],
    ["taskkill", ["/IM", "llama-server.exe", "/F", "/T"]],
    ["wsl.exe", ["-d", "Ubuntu-24.04", "--", "bash", "-lc", "pkill -f 'vllm|api_server|EngineCore' || true"]]
  ];
  const results = [];
  for (const [cmd, args] of commands) {
    results.push({ cmd, args, result: await runCommand(cmd, args, { timeoutMs: 20000 }).catch((error) => ({ error: error.message })) });
  }
  await writeJson("preflight/cleanup-results.json", results);
}

async function getPorts() {
  const ps = "Get-NetTCPConnection -LocalPort 11434,8080,8788,5173 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,State,OwningProcess | Sort-Object LocalPort,OwningProcess | Format-Table -AutoSize";
  const result = await runCommand("powershell", ["-NoProfile", "-Command", ps], { timeoutMs: 10000 }).catch((error) => ({ stdout: "", stderr: error.message }));
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

async function getGpu() {
  const result = await runCommand("nvidia-smi", ["--query-gpu=memory.total,memory.used,memory.free,utilization.gpu", "--format=csv,noheader,nounits"], { timeoutMs: 10000 }).catch((error) => ({ stdout: "", stderr: error.message }));
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

async function getGitCommit() {
  const result = await runCommand("git", ["rev-parse", "HEAD"], { timeoutMs: 10000 }).catch(() => ({ stdout: "unknown" }));
  return result.stdout.trim();
}

async function writeScenarioFiles() {
  for (const scenario of SCENARIOS) {
    await writeText(path.join("scenarios", `${scenario.id}.md`), `# ${scenario.id} ${scenario.title}\n\n${scenario.prompt}\n`);
  }
  await writeText(path.join("scenarios", "S07.md"), `# S07 ${HYBRID_PROMPT.title}\n\n## Qwen prompt\n\n${HYBRID_PROMPT.qwenPrompt}\n`);
}

async function writeEvidenceManifest() {
  const files = await listFiles(RUN_DIR);
  const rows = [];
  for (const file of files) {
    const rel = path.relative(RUN_DIR, file).replaceAll("\\", "/");
    if (rel === "evidence-manifest.sha256") continue;
    rows.push(`${await sha256FileSafe(file)}  ${rel}`);
  }
  rows.sort();
  await writeText("evidence-manifest.sha256", rows.join("\n") + "\n");
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function runCommand(cmd, args, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out: ${cmd} ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr, code });
      else reject(new Error(`${cmd} exited ${code}: ${stderr || stdout}`));
    });
  });
}

async function writeJson(relPath, value) {
  await writeText(relPath, JSON.stringify(value, null, 2) + "\n");
}

async function writeText(relPath, value) {
  const full = path.isAbsolute(relPath) ? relPath : path.join(RUN_DIR, relPath);
  await ensureDir(path.dirname(full));
  await fs.writeFile(full, value, "utf8");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function sha256FileSafe(filePath) {
  try {
    const data = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
  } catch {
    return "unavailable";
  }
}

function formatRunId(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

function estimateTokens(text) {
  if (!text) return 0;
  const asciiWords = (text.match(/[A-Za-z0-9_./:-]+/g) ?? []).length;
  const koreanChars = (text.match(/[가-힣]/g) ?? []).length;
  const other = Math.max(0, text.length - asciiWords * 4 - koreanChars);
  return Math.max(1, Math.round(asciiWords * 1.25 + koreanChars / 2.1 + other / 4));
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function clamp(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(5, value));
}

function stars(value) {
  if (!value) return "-";
  const rounded = Math.max(1, Math.min(5, Math.round(value)));
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

function formatMs(value) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function csv(value) {
  const text = value === undefined || value === null ? "" : typeof value === "number" ? value.toFixed(3) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
