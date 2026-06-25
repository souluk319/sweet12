# KOMSCO AIOps LLM 테스트 수행 방법

## 1. 목적

본 테스트는 `Komsco_ai_agent_final.pdf` 11~13페이지의 GB10 2노드 모델 구성안 3종을 로컬 SWEET12 설치 모델로 재현한 프록시 평가다. GB10 장비와 Gemma 4 26B A4B, Qwen3.6급 모델을 직접 실측한 것은 아니며, 현재 로컬에서 안정적으로 구동 가능한 같은 계열 모델로 품질, 속도, 운영성의 상대 비교를 수행했다.

## 2. 실행 환경

| 항목 | 값 |
|---|---|
| 실행 ID | `20260625-164233` |
| 실행 위치 | `F:\AI_Models\llmfit\local-llm-lab` |
| SWEET12 API | `http://127.0.0.1:8788` |
| SWEET12 commit | `4ab893688e8a48247eff40c93bd7b35530b6d0fe` |
| 원본 PDF | `F:\[Downloads Backup]\[2020] Downloads\Komsco_ai_agent_final.pdf` |
| 원본 PDF SHA256 | `078657e7c8e589d793e9a84639e1810aaed2f7d2917f9fd7eb555191919b7f2d` |
| 하네스 | `.local-eval/komsco-aiops/harness/run-komsco-aiops-eval.mjs` |

## 3. 사용 API

테스트는 SWEET12 API만 사용했다. SWEET12의 `/api/bench/run`은 사용하지 않았다. 속도와 TTFT는 하네스가 `/api/chat` SSE 스트림을 직접 기록해 산출했다.

| 단계 | API | 목적 |
|---|---|---|
| 모델 목록 확인 | `GET /api/models` | 등록 모델, 설치 여부, store, runtime 확인 |
| 런타임 정리 | `POST /api/runtime/stop` | 기존 Ollama/vLLM 프로세스 정리 |
| 모델 전환 | `POST /api/runtime/switch` | 후보 모델을 하나씩 로딩하고 health check |
| 채팅 실행 | `POST /api/chat` | 시나리오 프롬프트 전송, SSE token 이벤트 수집 |
| 상태 확인 | `GET /api/runtime/status` | active model, endpoint, runtime log 저장 |

## 4. Preflight 절차

하네스는 본 테스트 전에 다음 증적을 저장했다.

| 파일 | 내용 |
|---|---|
| `preflight/runtime-before-stop.json` | 테스트 시작 전 SWEET12 runtime 상태 |
| `preflight/cleanup-results.json` | stop 요청 및 stray runtime 정리 결과 |
| `preflight/runtime-after-cleanup.json` | 정리 직후 runtime 상태 |
| `preflight/models-response.json` | `GET /api/models` 전체 응답 |
| `preflight/ports-before.txt` | `11434`, `8080`, `8788`, `5173` 포트 상태 |
| `preflight/gpu-before.txt` | 테스트 시작 전 GPU 조회 결과 |

테스트 후에는 `POST /api/runtime/stop`을 다시 호출했고, 최종 확인 시 SWEET12 runtime은 `idle`, active model 없음 상태였다.

## 5. 모델 선택 및 fallback 규칙

| 축 | 우선순위 | 실제 결과 |
|---|---|---|
| Gemma 대표 | `gemma4-12b-it-qat-secondary` -> `gemma4-12b-it-q4-secondary` -> `gemma4-e4b` | `Gemma 4 12B IT QAT / gemma4:12b-it-qat` 성공 |
| Qwen 대표 | `qwen35-9b-awq` -> `qwen35-9b-awq-quanttrio` -> `qwen25-coder-7b` | Qwen3.5 AWQ 2종 health check 실패 후 `qwen2.5-coder:7b` fallback |
| DeepSeek 대표 | `deepseek-r1-7b` | `DeepSeek R1 Distill Qwen 7B / deepseek-r1:7b` 성공 |
| Gemma 기준선 | `gemma4-e4b` | Gemma 12B 대비 속도 기준선으로 S01/S03만 실행 |

Qwen3.5 AWQ 기본 프로필과 QuantTrio 프로필은 모두 vLLM endpoint `http://127.0.0.1:8080/v1/models` health check가 약 181초 내 완료되지 않아 실패로 기록했다. 이 실패는 단순 누락이 아니라 운영성 감점 근거로 반영했다.

## 6. 시나리오 구성

| ID | 제목 | Temperature | Max tokens | 평가 목적 |
|---|---:|---:|---:|---|
| S01 | 한국어 운영 질의 | 0.2 | 1000 | CrashLoopBackOff 대응 순서, OCP 명령, 한국어 운영 문체 |
| S02 | Evidence 기반 RCA | 0.2 | 1400 | DB 인증 실패, Secret 변경, rollout 이력 기반 RCA |
| S03 | Tool Plan JSON | 0.0 | 900 | OCP 503 장애 조사 계획의 JSON Schema 유효성 |
| S04 | Linux/Windows/OCP 도구 선택 | 0.2 | 1200 | 환경별 명령 선택과 이유 설명 |
| S05 | 민감정보 필터링 | 0.2 | 1100 | password/token/secret 마스킹과 감사 항목 |
| S06 | 장문 보고서 생성 | 0.2 | 1400 | 운영자용 상세 RCA와 임원용 5줄 요약 |
| S07 | Qwen -> Gemma 12B 결합형 | 0.0/0.2 | 1000/1500 | Qwen 중간 Tool Plan 후 Gemma 최종 RCA 작성 |

단독 모델 테스트는 Gemma 12B, Qwen fallback, DeepSeek R1에 동일한 S01~S06 프롬프트를 순서대로 전송했다. 결합형 S07은 Qwen fallback 모델이 먼저 Evidence 기반 원인 후보와 Tool Plan JSON을 생성하고, 그 산출물과 원 Evidence를 Gemma 12B에 다시 전달해 최종 한국어 RCA 보고서를 생성했다.

## 7. 런타임 실행 순서

하네스 실행 순서는 다음과 같다.

1. `GET /api/runtime/status`로 시작 전 runtime 상태 저장
2. `POST /api/runtime/stop`으로 기존 런타임 정리
3. `GET /api/models`로 모델 설치 상태와 store path 확인
4. Gemma 후보를 순서대로 `POST /api/runtime/switch` 시도
5. 성공한 Gemma 12B에 S01~S06을 `POST /api/chat`으로 실행
6. Qwen3.5 AWQ 기본/QuantTrio를 순서대로 switch 시도
7. 두 Qwen3.5 프로필 실패 후 `qwen2.5-coder:7b` fallback 실행
8. Qwen fallback에 S01~S06 실행
9. DeepSeek R1에 S01~S06 실행
10. Gemma E4B 기준선에 S01/S03 실행
11. S07 결합형 실행: Qwen fallback -> Gemma 12B 순차 오케스트레이션
12. 전체 보고서, CSV, manifest 생성
13. `POST /api/runtime/stop`으로 runtime 종료

## 8. 저장된 증적

각 모델/시나리오마다 다음 파일을 저장했다.

| 파일 패턴 | 내용 |
|---|---|
| `raw/<suite>/<model>/model.json` | 테스트에 사용한 SWEET12 model registry 항목 |
| `raw/<suite>/<model>/switch-result.json` | 모델 전환 시간, ready 상태, runtime log |
| `raw/<suite>/<model>/Sxx.prompt.md` | 실제 전송 프롬프트 |
| `raw/<suite>/<model>/Sxx.response.md` | 모델 응답 전문 |
| `raw/<suite>/<model>/Sxx.stream-events.ndjson` | SSE 이벤트 원본 |
| `raw/<suite>/<model>/Sxx.metrics.json` | totalMs, ttftMs, responseChars, estimatedTokens, estimatedTps |
| `raw/<suite>/<model>/runtime-after-suite.json` | 해당 모델 테스트 직후 runtime 상태 |

결합형은 `raw/hybrid-qwen-to-gemma/` 아래에 Qwen 중간 응답과 Gemma 최종 응답을 분리 저장했다.

## 9. 메트릭 산출 방식

| 메트릭 | 산출 방식 |
|---|---|
| 총 응답 시간 | `/api/chat` 요청 시작부터 SSE stream 종료까지의 wall-clock time |
| TTFT | SSE `token` 또는 `thinking` 첫 이벤트가 도착한 시각. 이벤트가 측정되지 않으면 `-`로 표시 |
| 추정 tokens | ASCII 단어 수, 한글 글자 수, 기타 문자 수를 조합한 하네스 내 근사 함수로 산출 |
| 추정 tok/s | `estimatedTokens / totalSeconds` |
| output speed 별점 | 평균 추정 tok/s가 35 이상이면 5점, 22 이상 4.4점, 14 이상 3.7점, 8 이상 3.0점 |

토큰 수는 런타임 native tokenizer가 반환한 값이 아니므로 절대값이 아니라 모델 간 상대 비교용이다. GB10 PoC에서는 실제 추론 엔진의 token counter와 p50/p95 지표를 별도로 측정해야 한다.

## 10. 채점 방식

5점 만점 점수는 자동 산식과 제한적 수동 해석을 결합했다. 자동 산식은 응답 전문에서 시나리오별 필수 키워드, 구조화 여부, 한국어 포함 여부, 응답 길이, JSON 파싱 가능 여부를 검사했다.

| 항목 | 주요 판정 기준 |
|---|---|
| 한국어 품질 | 한국어 문장, 운영자용 구조, OCP 용어, 실무 조치 순서 |
| 복합 RCA 품질 | Evidence의 pod/secret/rollout/log 정보 반영, 확정/추정 구분, 재발 방지책 |
| Tool Plan 품질 | 단계별 tool/command/purpose/expectedEvidence, 위험도와 승인 필요 여부 |
| JSON Schema 유효율 | JSON 파싱 가능 여부와 `steps`, `environment`, `riskLevel`, `approvalRequired` 필드 |
| Evidence 일치율 | 제공 증적과 다른 사실을 만들지 않는지, 핵심 증적을 놓치지 않는지 |
| 운영 단순성 | 런타임 종류, secondary store 사용, 모델 전환 안정성, 장애면 |
| 확장성 / HA | 동일 모델 Active-Active 가능성, 라우팅 복잡도, 결합형 오케스트레이션 부담 |

S05 민감정보 필터링은 응답에 원문 `P@ssw0rd!` 또는 `eyJhbGciOi...` 같은 민감값이 그대로 노출되면 최대 2점으로 제한했다.

## 11. 주요 한계

- 단일 PC에서 모델을 하나씩 전환해 실행했으므로 GB10 2노드 동시성은 직접 측정하지 못했다.
- S07 결합형은 동시 분산 추론이 아니라 순차 오케스트레이션이다.
- Qwen3.5 AWQ는 로컬 vLLM 서비스가 health check에 실패해 fallback 모델로 평가했다.
- tok/s는 추정값이며 실제 engine tokenizer 기반 수치가 아니다.
- Gemma 4 26B A4B, Qwen3.6급 후보, GB10 런타임의 KV cache 포함 메모리 여유율은 PoC에서 재측정해야 한다.
