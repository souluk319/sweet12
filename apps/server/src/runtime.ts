import fs from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Response } from "express";
import { getModel, getStorePath, isInstalled, saveBenchResult } from "./registry.js";
import { ollamaExe, qwenLogsPath, windowsPathToWsl } from "./paths.js";
import { delay, runCommand } from "./shell.js";
import type { BenchRun, ChatMessage, ChatRequest, InstallJob, ModelProfile, RuntimeState } from "./types.js";

const OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const VLLM_ENDPOINT = "http://127.0.0.1:8080";

let ollamaProcess: ChildProcessWithoutNullStreams | undefined;
let state: RuntimeState = {
  status: "idle",
  message: "No model loaded",
  logs: []
};
const installJobs = new Map<string, InstallJob>();

function pushLog(message: string): void {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  state.logs = [...state.logs.slice(-160), line];
}

function setState(next: Partial<RuntimeState>): void {
  state = {
    ...state,
    ...next,
    logs: next.logs ?? state.logs
  };
}

export function getRuntimeState(): RuntimeState {
  return state;
}

export function getInstallJobs(): InstallJob[] {
  return [...installJobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function ollamaEnv(storePath: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OLLAMA_HOST: "127.0.0.1:11434",
    OLLAMA_MODELS: storePath,
    OLLAMA_KEEP_ALIVE: "5m",
    OLLAMA_VULKAN: "false"
  };
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(750);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function stopOllama(): Promise<void> {
  pushLog("Stopping Ollama processes");
  if (ollamaProcess && !ollamaProcess.killed) {
    ollamaProcess.kill();
  }
  ollamaProcess = undefined;
  try {
    await runCommand("taskkill", ["/IM", "ollama.exe", "/F", "/T"], { timeoutMs: 10000 });
  } catch {
    // No Ollama process is fine.
  }
  try {
    await runCommand("taskkill", ["/IM", "ollama app.exe", "/F", "/T"], { timeoutMs: 10000 });
  } catch {
    // The tray app is optional, but it can auto-restart ollama serve.
  }
  try {
    await runCommand("taskkill", ["/IM", "llama-server.exe", "/F", "/T"], { timeoutMs: 10000 });
  } catch {
    // Newer Ollama releases spawn llama-server children that can outlive failed loads.
  }
  try {
    await runCommand(
      "powershell",
      ["-NoProfile", "-Command", "Get-Process ollama,'ollama app',llama-server -ErrorAction SilentlyContinue | Stop-Process -Force"],
      { timeoutMs: 10000 }
    );
  } catch {
    // Final best-effort process cleanup.
  }
}

async function stopVllm(): Promise<void> {
  pushLog("Stopping vLLM processes in Ubuntu-24.04");
  try {
    await runCommand(
      "wsl.exe",
      [
        "-d",
        "Ubuntu-24.04",
        "--",
        "bash",
        "-lc",
        "pkill -f 'vllm|api_server|EngineCore' || true; rm -f /mnt/f/AI_Models/Qwen/logs/vllm.pid"
      ],
      { timeoutMs: 15000 }
    );
  } catch (error) {
    pushLog(`vLLM stop warning: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function stopRuntime(): Promise<void> {
  setState({ status: "stopping", message: "Unloading local LLM runtimes for GPU release" });
  await Promise.all([stopOllama(), stopVllm()]);
  setState({
    status: "idle",
    activeModelId: undefined,
    activeModelName: undefined,
    runtime: undefined,
    endpoint: undefined,
    message: "No model loaded - local LLM runtimes unloaded",
    startedAt: undefined,
    lastError: undefined
  });
}

async function startOllamaServer(model: ModelProfile, warm = true): Promise<void> {
  const storePath = getStorePath(model);
  if (!storePath) throw new Error(`Missing Ollama store path for ${model.id}`);
  if (!model.ollamaModel) throw new Error(`Missing Ollama model name for ${model.id}`);

  pushLog(`Starting Ollama store=${storePath}`);
  ollamaProcess = spawn(ollamaExe, ["serve"], {
    env: ollamaEnv(storePath),
    windowsHide: true
  });
  ollamaProcess.stdout.on("data", (chunk) => pushLog(chunk.toString().trim()));
  ollamaProcess.stderr.on("data", (chunk) => pushLog(chunk.toString().trim()));
  ollamaProcess.on("exit", (code) => pushLog(`Ollama exited with code ${code}`));

  await waitForUrl(`${OLLAMA_ENDPOINT}/api/tags`, 30000);
  if (!warm) return;

  if (model.role === "embedding") {
    setState({ status: "warming", message: `Preparing ${model.displayName} embedding endpoint` });
    const warmResponse = await fetch(`${OLLAMA_ENDPOINT}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.ollamaModel,
        input: "health check"
      })
    });
    if (!warmResponse.ok) {
      const text = await warmResponse.text();
      throw new Error(`Ollama embedding warmup failed: ${warmResponse.status} ${text}`);
    }
    return;
  }

  setState({ status: "warming", message: `Loading ${model.displayName} into VRAM` });
  const warmResponse = await fetch(`${OLLAMA_ENDPOINT}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.ollamaModel,
      prompt: "Reply with OK.",
      stream: false,
      think: false,
      options: { num_predict: 2 }
    })
  });
  if (!warmResponse.ok) {
    const text = await warmResponse.text();
    throw new Error(`Ollama warmup failed: ${warmResponse.status} ${text}`);
  }
}

async function ensureWslReady(): Promise<void> {
  async function probe(): Promise<boolean> {
    try {
      const result = await runCommand("wsl.exe", ["-d", "Ubuntu-24.04", "--", "bash", "-lc", "echo ready"], {
        timeoutMs: 30000
      });
      return result.stdout.includes("ready");
    } catch {
      return false;
    }
  }

  if (await probe()) return;
  pushLog("Ubuntu-24.04 did not start cleanly; terminating distro and retrying");
  await runCommand("wsl.exe", ["--terminate", "Ubuntu-24.04"], { timeoutMs: 15000 }).catch(() => undefined);
  if (await probe()) return;

  pushLog("Restarting WslService");
  await runCommand("powershell", ["-NoProfile", "-Command", "Restart-Service WslService -Force"], {
    timeoutMs: 30000
  }).catch((error) => pushLog(`WslService restart warning: ${error instanceof Error ? error.message : String(error)}`));
  if (await probe()) return;

  pushLog("Running wsl --shutdown as final WSL recovery step");
  await runCommand("wsl.exe", ["--shutdown"], { timeoutMs: 30000 }).catch(() => undefined);
  if (!(await probe())) throw new Error("WSL Ubuntu-24.04 is still unavailable after recovery attempts");
}

async function startVllm(model: ModelProfile): Promise<void> {
  if (!model.modelDir || !model.servedModelName) throw new Error(`Missing vLLM config for ${model.id}`);
  if (!isInstalled(model)) throw new Error(`vLLM model directory is missing or incomplete: ${model.modelDir}`);

  await ensureWslReady();
  const modelDir = windowsPathToWsl(model.modelDir);
  const servedName = model.servedModelName;
  const command = [
    "cd /mnt/f/AI_Models/Qwen",
    "mkdir -p logs cache/huggingface cache/transformers cache/xdg cache/vllm cache/triton",
    "export HF_HOME=/mnt/f/AI_Models/Qwen/cache/huggingface",
    "export HUGGINGFACE_HUB_CACHE=$HF_HOME/hub",
    "export TRANSFORMERS_CACHE=/mnt/f/AI_Models/Qwen/cache/transformers",
    "export XDG_CACHE_HOME=/mnt/f/AI_Models/Qwen/cache/xdg",
    "export VLLM_CACHE_ROOT=/mnt/f/AI_Models/Qwen/cache/vllm",
    "export TRITON_CACHE_DIR=/mnt/f/AI_Models/Qwen/cache/triton",
    "export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True",
    "export VLLM_USE_V1=0",
    "source /mnt/f/AI_Models/Qwen/venv/bin/activate",
    "nohup vllm serve " +
      `${modelDir} --host 0.0.0.0 --port 8080 --served-model-name ${servedName} ` +
      "--tensor-parallel-size 1 --quantization awq --dtype half --gpu-memory-utilization 0.98 " +
      "--cpu-offload-gb 8 --swap-space 16 --kv-cache-dtype fp8 --block-size 8 --max-model-len 1024 " +
      "--max-num-seqs 1 --enforce-eager --disable-log-stats --language-model-only " +
      "> /mnt/f/AI_Models/Qwen/logs/sweet12-vllm.log 2>&1 & echo $! > /mnt/f/AI_Models/Qwen/logs/vllm.pid"
  ].join(" && ");

  pushLog(`Starting vLLM model=${modelDir}`);
  await runCommand("wsl.exe", ["-d", "Ubuntu-24.04", "--", "bash", "-lc", command], { timeoutMs: 30000 });
  await waitForUrl(`${VLLM_ENDPOINT}/v1/models`, 180000);
}

export async function switchRuntime(modelId: string): Promise<RuntimeState> {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  if (!isInstalled(model)) throw new Error(`${model.displayName} is not installed`);
  const previousRuntime = state.runtime;

  setState({
    status: "stopping",
    activeModelId: state.activeModelId,
    activeModelName: state.activeModelName,
    runtime: previousRuntime,
    message: "Stopping previous runtime",
    lastError: undefined
  });
  if (model.runtime === "vllm" || previousRuntime === "vllm") {
    await Promise.all([stopOllama(), stopVllm()]);
  } else {
    await stopOllama();
  }

  try {
    setState({
      status: "starting",
      activeModelId: model.id,
      activeModelName: model.displayName,
      runtime: model.runtime,
      endpoint: model.runtime === "ollama" ? OLLAMA_ENDPOINT : VLLM_ENDPOINT,
      message: `Starting ${model.displayName}`,
      startedAt: new Date().toISOString(),
      lastError: undefined
    });
    if (model.runtime === "ollama") await startOllamaServer(model);
    else await startVllm(model);

    setState({
      status: "ready",
      message: `${model.displayName} is ready`,
      endpoint: model.runtime === "ollama" ? OLLAMA_ENDPOINT : VLLM_ENDPOINT
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushLog(message);
    if (model.runtime === "vllm" && fs.existsSync(qwenLogsPath)) {
      pushLog(fs.readFileSync(qwenLogsPath, "utf8").split(/\r?\n/).slice(-12).join("\n"));
    }
    setState({ status: "failed", message: "Runtime start failed", lastError: message });
  }
  return getRuntimeState();
}

function sendSse(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalizeMessages(request: ChatRequest): ChatMessage[] {
  const messages = request.messages.filter((message) => message.content.trim().length > 0 || (message.images?.length ?? 0) > 0);
  if (request.systemPrompt?.trim()) {
    return [{ role: "system", content: request.systemPrompt.trim() }, ...messages.filter((m) => m.role !== "system")];
  }
  return messages;
}

export async function streamChat(request: ChatRequest, res: Response): Promise<void> {
  const active = state.activeModelId ? getModel(state.activeModelId) : undefined;
  if (!active || state.status !== "ready") {
    res.status(409).json({ error: "No ready runtime" });
    return;
  }
  if (active.role === "embedding") {
    res.status(400).json({ error: "Embedding models cannot be used for chat" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  try {
    if (active.runtime === "ollama") {
      const messages = normalizeMessages(request);
      const hasImages = messages.some((message) => (message.images?.length ?? 0) > 0);
      const response = await fetch(`${OLLAMA_ENDPOINT}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: active.ollamaModel,
          messages,
          stream: true,
          think: false,
          options: {
            temperature: request.temperature ?? 0.2,
            num_predict: request.maxTokens ?? 512,
            ...(hasImages ? { num_ctx: 8192 } : {})
          }
        })
      });
      if (!response.ok || !response.body) throw new Error(`Ollama chat failed: ${response.status}`);
      await streamOllamaNdjson(response, res);
    } else {
      const response = await fetch(`${VLLM_ENDPOINT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: active.servedModelName,
          messages: normalizeMessages(request),
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 512,
          stream: true
        })
      });
      if (!response.ok || !response.body) throw new Error(`vLLM chat failed: ${response.status}`);
      await streamOpenAiSse(response, res);
    }
    sendSse(res, "done", {});
  } catch (error) {
    sendSse(res, "error", { message: error instanceof Error ? error.message : String(error) });
  } finally {
    res.end();
  }
}

async function streamOllamaNdjson(response: globalThis.Response, res: Response): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as { message?: { content?: string; thinking?: string }; done?: boolean };
      const text = parsed.message?.content;
      const thinking = parsed.message?.thinking;
      if (text) sendSse(res, "token", { text });
      if (thinking) sendSse(res, "thinking", { text: thinking });
    }
  }
}

async function streamOpenAiSse(response: globalThis.Response, res: Response): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const dataLine = chunk.split(/\r?\n/).find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const data = dataLine.slice(6).trim();
      if (data === "[DONE]") return;
      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) sendSse(res, "token", { text });
    }
  }
}

export async function installModel(modelId: string): Promise<InstallJob> {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  if (!model.remoteTag) throw new Error(`${model.displayName} does not have an automatic install command`);
  const storePath = getStorePath(model);
  if (!storePath) throw new Error(`Missing store path for ${model.id}`);

  await stopOllama();
  setState({ status: "installing", activeModelId: model.id, activeModelName: model.displayName, message: `Installing ${model.displayName}` });
  await startOllamaServer(model, false);

  const job: InstallJob = {
    id: `${model.id}-${Date.now()}`,
    modelId: model.id,
    status: "running",
    logs: [],
    startedAt: new Date().toISOString()
  };
  installJobs.set(job.id, job);

  const child = spawn(ollamaExe, ["pull", model.remoteTag], {
    env: ollamaEnv(storePath),
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    job.logs.push(text);
    pushLog(text.trim());
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    job.logs.push(text);
    pushLog(text.trim());
  });
  child.on("close", (code) => {
    job.finishedAt = new Date().toISOString();
    job.status = code === 0 ? "done" : "failed";
    if (code !== 0) job.error = `ollama pull exited with code ${code}`;
    setState({ status: code === 0 ? "idle" : "failed", message: code === 0 ? "Install complete" : "Install failed", lastError: job.error });
  });
  return job;
}

export async function runBench(modelId: string): Promise<unknown> {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  if (model.role === "embedding") throw new Error("Embedding models are not generation benchmark targets");
  const runtime = await switchRuntime(modelId);
  if (runtime.status !== "ready") throw new Error(runtime.lastError ?? "Runtime failed to start");
  setState({ status: "benchmarking", message: `Benchmarking ${model.displayName}` });
  const runs: BenchRun[] = [];
  for (let i = 0; i < 3; i += 1) {
    runs.push(model.runtime === "ollama" ? await benchOllama(model) : await benchVllm(model));
  }
  const avgTps = runs.reduce((sum, run) => sum + run.tps, 0) / runs.length;
  const avgTotalMs = runs.reduce((sum, run) => sum + run.totalMs, 0) / runs.length;
  const avgOutputTokens = runs.reduce((sum, run) => sum + run.outputTokens, 0) / runs.length;
  const warning =
    model.expectedTps && Math.abs(avgTps - model.expectedTps) / model.expectedTps > 0.25 ? "재측정 필요: 기존 실측값과 25% 이상 차이" : undefined;
  const summary = { updatedAt: new Date().toISOString(), runs, avgTps, avgTotalMs, avgOutputTokens, warning };
  saveBenchResult(model.id, summary);
  setState({ status: "ready", message: `${model.displayName} is ready` });
  return summary;
}

async function benchOllama(model: ModelProfile): Promise<BenchRun> {
  const started = performance.now();
  const response = await fetch(`${OLLAMA_ENDPOINT}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.ollamaModel,
      prompt: "Write a concise developer note explaining why model switching should unload the previous local LLM first.",
      stream: false,
      think: false,
      options: { num_predict: 220, temperature: 0.2 }
    })
  });
  const totalMs = performance.now() - started;
  if (!response.ok) throw new Error(`Ollama bench failed: ${response.status}`);
  const parsed = (await response.json()) as { eval_count?: number; eval_duration?: number };
  const outputTokens = parsed.eval_count ?? 0;
  const evalSeconds = parsed.eval_duration ? parsed.eval_duration / 1_000_000_000 : totalMs / 1000;
  return { outputTokens, totalMs, tps: outputTokens / Math.max(evalSeconds, 0.001) };
}

async function benchVllm(model: ModelProfile): Promise<BenchRun> {
  const started = performance.now();
  const response = await fetch(`${VLLM_ENDPOINT}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.servedModelName,
      messages: [{ role: "user", content: "Write a concise developer note explaining why model switching should unload the previous local LLM first." }],
      max_tokens: 220,
      temperature: 0.2
    })
  });
  const totalMs = performance.now() - started;
  if (!response.ok) throw new Error(`vLLM bench failed: ${response.status}`);
  const parsed = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { completion_tokens?: number } };
  const text = parsed.choices?.[0]?.message?.content ?? "";
  const outputTokens = parsed.usage?.completion_tokens ?? Math.max(1, Math.round(text.split(/\s+/).length * 1.35));
  return { outputTokens, totalMs, tps: outputTokens / Math.max(totalMs / 1000, 0.001) };
}
