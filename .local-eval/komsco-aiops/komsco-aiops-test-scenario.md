# KOMSCO AIOps LLM Test Scenario

이 문서는 `Komsco_ai_agent_final.pdf` 11~13페이지의 구성안 비교 포맷을 로컬 SWEET12 실측 테스트로 재현하기 위한 시나리오다. 목적은 Dell GB10 2노드 PoC 이전에, 동일 계열의 로컬 스윗스팟 모델로 한국어 운영 질의, RCA, Tool Plan, Evidence 기반 보고서 품질을 비교하고 적용 권장안을 도출하는 것이다.

## 1. 테스트 원칙

- 실제 GB10 후보 대형 모델을 직접 실측한 결과가 아니라, 같은 계열 로컬 모델 기반의 프록시 테스트로 명시한다.
- 모델명은 계열명이 아니라 실제 실행한 태그까지 기록한다.
- 모든 테스트는 동일 프롬프트, 동일 Evidence, 동일 채점 루브릭으로 반복한다.
- 원본 응답은 수정하지 않고 보존한다. 요약/채점/제안서는 별도 파일로 작성한다.
- 자동 채점만으로 확정하지 않는다. JSON 유효성, 키워드/증적 일치 같은 기계 검증과 사람이 읽는 정성 평가를 함께 남긴다.
- Gemma+Qwen 결합형은 로컬 동시 실행이 어려우므로 순차 오케스트레이션으로 프록시 검증한다.

## 2. 테스트 대상 모델

| 구분 | 실제 모델명 | 런타임 | 대표 역할 |
|---|---|---|---|
| Gemma 대표 | `gemma4:e4b` 또는 `hf.co/unsloth/gemma-4-E4B-it-qat-mobile-GGUF:UD-Q2_K_XL` | Ollama | 한국어 운영 응답, 보고서 문체, 멀티모달/운영형 질의 |
| Qwen 대표 | `Qwen3.5-9B-AWQ` 또는 설치 가능 시 Qwen3.6 계열 | vLLM 또는 Ollama | Tool Plan, 명령 추론, 코드/운영 작업 |
| DeepSeek 대표 | `deepseek-r1:7b` | Ollama | 복합 reasoning, RCA 추론 비교 |

최종 실행 전 고정할 항목:

- Gemma 대표 1개
- Qwen 대표 1개
- DeepSeek 대표 1개
- 결합형 순차 테스트 순서: `Qwen -> Gemma`, 필요 시 `Gemma -> Qwen`

## 3. 구성안 매핑

| PDF 구성안 | 로컬 테스트 매핑 | 판단 목적 |
|---|---|---|
| 1안 혼합형 | Gemma/Qwen/DeepSeek 중 역할별 최적 모델 조합 | 모델별 강점이 분리될 때 하이브리드 운영이 타당한지 확인 |
| 2안 Gemma Active-Active | Gemma 대표 모델 단독 평가를 기준으로 동일 모델 2노드 운영성 추정 | 단일 Gemma 계열로 품질/속도/운영 단순성을 모두 만족하는지 확인 |
| 3안 대형모델 결합형 | Qwen Tool Plan 생성 후 Gemma가 최종 한국어 RCA 보고서 작성하는 순차 결합 테스트 | 두 모델 결합이 단독 모델 대비 품질 이득을 주는지 확인 |

3안 한계 문구:

> 본 테스트는 단일 PC 환경 제약으로 Gemma와 Qwen의 동시 상주 및 병렬 추론을 수행하지 않았다. 대신 동일 Evidence와 중간 산출물을 기반으로 순차 오케스트레이션을 수행하여 GB10 2노드 환경에서의 Gemma-Qwen 협업 구성 가능성을 프록시 검증하였다. 동시성, 네트워크 지연, KV cache 메모리 여유, failover RTO는 GB10 PoC에서 별도 실측해야 한다.

## 4. 평가 항목과 점수

각 항목은 5점 만점으로 채점한다. PDF 제출용 표에서는 별점으로 변환한다.

| 평가 항목 | 점수 기준 |
|---|---|
| 한국어 품질 | 운영자가 바로 이해할 수 있는 자연스러운 한국어, 용어 일관성, 보고서 문체 |
| 단일 요청 출력 속도 | TTFT, decode tok/s, 전체 응답 시간 |
| 복합 RCA 품질 | 원인 후보, 영향 범위, 확인 절차, 조치안의 논리성 |
| Tool Plan 품질 | Linux/Windows/OCP에 맞는 도구와 명령 선택, 실행 순서, 위험도 판단 |
| JSON Schema 유효율 | 요구한 JSON Schema 파싱 가능 여부, 필수 필드 충족 |
| Evidence 일치율 | 제공 로그/이벤트/메트릭과 답변의 모순 여부 |
| 서비스 처리량/동시성 | 동시성 1/2/4 요청에서 응답 안정성 및 처리량 |
| 운영 단순성 | 모델 수, 런타임 수, 라우팅 복잡도, 장애 대응 난이도 |
| 확장성/HA | 2노드 Active-Active, 역할 분리, failover 가능성 |
| 실운영 적합도 | 위 항목을 종합한 운영 투입 가능성 |

별점 변환:

- 5점: `★★★★★`
- 4점: `★★★★☆`
- 3점: `★★★☆☆`
- 2점: `★★☆☆☆`
- 1점: `★☆☆☆☆`

## 5. 테스트 시나리오

### S01. 한국어 운영 질의

목적: 운영자 질문에 대한 한국어 이해도와 실무형 답변 품질 평가.

입력:

```text
OpenShift 클러스터에서 특정 namespace의 Pod가 반복적으로 CrashLoopBackOff 상태입니다.
운영자가 먼저 확인해야 할 항목과 조치 순서를 한국어로 정리해 주세요.
```

평가:

- 한국어 품질
- RCA 기본 구조
- OCP 용어 정확성
- 조치 순서 실무성

### S02. Evidence 기반 RCA

목적: 주어진 증적만 사용해 원인 추론과 조치안을 구성하는지 평가.

입력 Evidence:

```text
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
```

질문:

```text
위 증적을 기반으로 가장 가능성 높은 원인, 추가 확인 명령, 즉시 조치, 재발 방지책을 RCA 보고서 형식으로 작성해 주세요.
제공되지 않은 사실은 추정으로 표시하세요.
```

평가:

- Evidence 일치율
- 복합 RCA 품질
- 한국어 보고서 품질
- 추정/확정 구분

### S03. Tool Plan JSON 생성

목적: 장애 질문을 OS/OCP-aware Tool Plan으로 구조화하는 능력 평가.

입력:

```text
사용자 질문: OCP에서 route 접속은 되지만 백엔드 서비스 응답이 503입니다.
환경: OpenShift 4.x, namespace=portal, app=web-frontend

다음 JSON Schema에 맞춰 조사 Tool Plan을 생성하세요.
```

요구 Schema:

```json
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
}
```

평가:

- JSON Schema 유효율
- Tool Plan 품질
- Tool Call 정확도
- 위험 작업 승인 판단

### S04. Linux/Windows/OCP 도구 선택

목적: 동일 장애 질문에서 환경별 도구와 명령을 올바르게 분기하는지 평가.

입력:

```text
다음 세 환경에서 CPU 사용률 급증 원인을 조사해야 합니다.
1. RHEL 서버
2. Windows Server
3. OpenShift Pod

각 환경별로 먼저 실행할 확인 명령 5개와, 명령을 선택한 이유를 표로 작성해 주세요.
```

평가:

- OS-aware Tool Reasoning
- 명령 정확성
- 설명 품질

### S05. 민감정보 필터링 포함 보고서

목적: 민감정보가 포함된 Evidence에서 보고서 작성 시 마스킹/감사 관점 반영 여부 평가.

입력:

```text
아래 로그를 기반으로 장애 요약 보고서를 작성하세요.
민감정보는 제거하거나 마스킹하고, 감사로그에 남겨야 할 항목을 별도로 정리하세요.

2026-06-24T09:21:33Z ERROR login failed user=kim_admin password=P@ssw0rd! token=eyJhbGciOi...
2026-06-24T09:22:10Z WARN secret payment-db-secret was updated by user park_ops
2026-06-24T09:23:02Z ERROR database authentication failed for user payment_app
```

평가:

- 민감정보 식별/마스킹
- 감사로그 관점
- Evidence 일치율
- 한국어 보고서 품질

### S06. 장문 보고서 생성

목적: 짧은 Evidence를 바탕으로 임원/운영자용 보고서 문체를 분리 생성하는 능력 평가.

입력:

```text
다음 장애 상황을 바탕으로 두 가지 결과물을 작성하세요.
1. 운영자용 상세 RCA
2. 임원 보고용 5줄 요약

상황:
- payment-api 배포 직후 장애 발생
- DB 인증 실패 로그 확인
- Secret 변경 이력 존재
- 현재 임시 rollback으로 서비스 복구
- 재발 방지를 위해 배포 전 secret validation 필요
```

평가:

- 장문 구조화
- 대상 독자별 문체
- 재발 방지책 구체성

### S07. 결합형 순차 오케스트레이션

목적: Gemma+Qwen 결합형이 단독 모델 대비 품질 이득을 주는지 평가.

절차:

1. Qwen 대표 모델에 S02 Evidence를 입력하고 Tool Plan JSON과 원인 후보를 생성한다.
2. Qwen 원본 산출물을 저장한다.
3. 런타임을 Gemma 대표 모델로 교체한다.
4. Gemma에 S02 Evidence와 Qwen 산출물을 함께 입력한다.
5. Gemma가 최종 한국어 RCA 보고서를 작성한다.
6. 단독 Gemma, 단독 Qwen, 결합형 결과를 같은 루브릭으로 비교한다.

평가:

- 결합형 RCA 품질 향상 여부
- 중간 Tool Plan 활용도
- 전체 소요시간
- 운영 복잡도 감점

## 6. 증적 패키지 구조

테스트 실행 결과는 아래 구조로 남긴다.

```text
test-runs/komsco-aiops/YYYYMMDD-HHMMSS/
  run-manifest.json
  prompts/
    S01.md
    S02.md
    ...
  raw/
    gemma4-e4b/
      S01.response.md
      S01.metrics.json
    qwen/
      S01.response.md
      S01.metrics.json
    deepseek-r1-7b/
      S01.response.md
      S01.metrics.json
    hybrid-qwen-to-gemma/
      S07.intermediate-qwen.md
      S07.final-gemma.md
      S07.metrics.json
  scoring/
    scorecard.csv
    scorecard.md
    reviewer-notes.md
  report/
    test-result-report.md
    proposal.md
```

`run-manifest.json` 필수 항목:

```json
{
  "startedAt": "ISO-8601",
  "operator": "codex",
  "sourcePdf": "F:/[Downloads Backup]/[2020] Downloads/Komsco_ai_agent_final.pdf",
  "sourcePdfSha256": "string",
  "sweet12Commit": "string",
  "models": [
    {
      "id": "string",
      "displayName": "string",
      "runtime": "ollama|vllm",
      "modelTag": "string",
      "installed": true
    }
  ],
  "scenarios": ["S01", "S02", "S03", "S04", "S05", "S06", "S07"]
}
```

## 7. 사람이 확인 가능한 근거 만들기

백그라운드 실행 신뢰 문제를 줄이기 위해 다음 증적을 남긴다.

- 실행 전 모델 목록과 설치 상태 캡처/API 응답
- 각 모델 전환 로그
- 각 프롬프트 원문
- 각 모델 원본 응답 전문
- TTFT, tok/s, total time metrics
- JSON Schema 검증 결과
- 채점 근거 문장
- 최종 점수 산식
- 산출물 생성 시점의 git commit hash
- 전체 결과 폴더 SHA256 manifest

권장 검수 방식:

1. 테스트 전 `run-manifest.json`과 프롬프트 세트를 사용자에게 먼저 보여준다.
2. 테스트 중 SWEET12 UI 또는 로그에서 현재 실행 모델을 확인 가능하게 둔다.
3. 테스트 후 원본 응답과 점수표를 먼저 검수한다.
4. 검수 완료 후 PDF 포맷을 닮은 결과서/제안서로 정리한다.

## 8. 최종 산출물

- `test-result-report.md`: 실제 테스트 결과서
- `proposal.md`: GB10 2노드 적용 제안서
- `scorecard.md`: PDF 13페이지 형식의 선정 판단표
- 필요 시 `test-result-report.pdf`: 제출용 PDF 변환본

결론 작성 원칙:

- 단일 모델이 전 항목에서 우세하면 2안 Active-Active 권장
- 모델별 강점이 분리되면 1안 혼합형 또는 제한적 결합형 권장
- 결합형이 품질 이득 대비 지연/운영 복잡도가 크면 3안은 기술 검증용으로 제한
- 동시성, failover, GB10 메모리 여유율은 PoC 실측 필수 항목으로 남김
