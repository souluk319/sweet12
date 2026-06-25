# KOMSCO AIOps LLM 로컬 프록시 테스트 결과서

## 1. 테스트 개요

- 실행 ID: `20260625-164233`
- 원본 PDF SHA256: `078657e7c8e589d793e9a84639e1810aaed2f7d2917f9fd7eb555191919b7f2d`
- SWEET12 commit: `4ab893688e8a48247eff40c93bd7b35530b6d0fe`
- 성격: GB10 대형 모델 직접 실측이 아닌, 동일 계열 로컬 스윗스팟 모델 기반 프록시 테스트
- 하네스: SWEET12 API 기반 모델 전환, SSE 응답 수집, 자체 메트릭 기록
- 상세 방법론: [test-methodology.md](test-methodology.md)

## 1-1. 실제 테스트 절차

테스트는 SWEET12 API만 사용했다. `/api/bench/run`은 사용하지 않았고, 하네스가 `/api/chat` SSE 스트림을 직접 수집해 총 응답 시간, TTFT, 응답 전문, 추정 tok/s를 기록했다.

| 단계 | API | 저장 증적 |
|---|---|---|
| 시작 상태 확인 | `GET /api/runtime/status` | `preflight/runtime-before-stop.json` |
| 기존 런타임 정리 | `POST /api/runtime/stop` | `preflight/cleanup-results.json` |
| 모델 목록 확인 | `GET /api/models` | `preflight/models-response.json` |
| 포트/GPU 상태 기록 | PowerShell / `nvidia-smi` | `preflight/ports-before.txt`, `preflight/gpu-before.txt` |
| 모델 전환 | `POST /api/runtime/switch` | `raw/<suite>/<model>/switch-result.json` |
| 시나리오 실행 | `POST /api/chat` | `prompt.md`, `response.md`, `stream-events.ndjson`, `metrics.json` |
| 종료 정리 | `POST /api/runtime/stop` | runtime `idle`, active model 없음 |

모델 후보는 정해진 순서로 시도했다. Gemma는 `gemma4:12b-it-qat`가 성공했고, Qwen3.5 AWQ 기본/QuantTrio 프로필은 vLLM `127.0.0.1:8080/v1/models` health check timeout으로 실패했다. 따라서 Qwen 축 실측은 fallback `qwen2.5-coder:7b`로 수행했다.

| 축 | 후보 순서 | 실제 사용 |
|---|---|---|
| Gemma | `gemma4-12b-it-qat-secondary` -> `gemma4-12b-it-q4-secondary` -> `gemma4-e4b` | `gemma4:12b-it-qat` |
| Qwen | `qwen35-9b-awq` -> `qwen35-9b-awq-quanttrio` -> `qwen25-coder-7b` | `qwen2.5-coder:7b` |
| DeepSeek | `deepseek-r1-7b` | `deepseek-r1:7b` |
| 기준선 | `gemma4-e4b` | `gemma4:e4b` S01/S03만 실행 |

## 1-2. 시나리오 및 파라미터

| ID | 제목 | Temperature | Max tokens | 평가 목적 |
|---|---:|---:|---:|---|
| S01 | 한국어 운영 질의 | 0.2 | 1000 | CrashLoopBackOff 대응 순서, OCP 명령, 한국어 운영 문체 |
| S02 | Evidence 기반 RCA | 0.2 | 1400 | DB 인증 실패, Secret 변경, rollout 이력 기반 RCA |
| S03 | Tool Plan JSON | 0.0 | 900 | OCP 503 장애 조사 계획의 JSON Schema 유효성 |
| S04 | Linux/Windows/OCP 도구 선택 | 0.2 | 1200 | 환경별 명령 선택과 이유 설명 |
| S05 | 민감정보 필터링 | 0.2 | 1100 | password/token/secret 마스킹과 감사 항목 |
| S06 | 장문 보고서 생성 | 0.2 | 1400 | 운영자용 상세 RCA와 임원용 5줄 요약 |
| S07 | Qwen -> Gemma 12B 결합형 | 0.0/0.2 | 1000/1500 | Qwen 중간 Tool Plan 후 Gemma 최종 RCA 작성 |

## 2. 테스트 대상

- **Gemma 4 12B**: `Gemma 4 12B IT QAT` / `gemma4:12b-it-qat`
- **Qwen2.5 Coder (Qwen3.5 대체)**: `Qwen2.5 Coder 7B` / `qwen2.5-coder:7b`
- **DeepSeek R1**: `DeepSeek R1 Distill Qwen 7B` / `deepseek-r1:7b`
- **Gemma E4B 기준선**: `Gemma 4 E4B`

## 3. 시나리오별 결과 파일

### Gemma 4 12B - Gemma 4 12B IT QAT

| 시나리오 | 제목 | TTFT | 총 응답 | 추정 tok/s | 점수 | 원본 응답 |
|---|---|---:|---:|---:|---:|---|
| S01 | 한국어 운영 질의 | - | 19.6s | 38.68 | 5.00 | [response](../raw/gemma/gemma4-12b-it-qat-secondary/S01.response.md) |
| S02 | Evidence 기반 RCA | - | 16.7s | 42.78 | 5.00 | [response](../raw/gemma/gemma4-12b-it-qat-secondary/S02.response.md) |
| S03 | Tool Plan JSON | - | 9.7s | 41.65 | 5.00 | [response](../raw/gemma/gemma4-12b-it-qat-secondary/S03.response.md) |
| S04 | Linux/Windows/OCP 도구 선택 | - | 22.5s | 38.17 | 5.00 | [response](../raw/gemma/gemma4-12b-it-qat-secondary/S04.response.md) |
| S05 | 민감정보 필터링 | - | 16.0s | 37.28 | 2.00 | [response](../raw/gemma/gemma4-12b-it-qat-secondary/S05.response.md) |
| S06 | 장문 보고서 생성 | - | 14.5s | 38.70 | 5.00 | [response](../raw/gemma/gemma4-12b-it-qat-secondary/S06.response.md) |

### Qwen2.5 Coder (Qwen3.5 대체) - Qwen2.5 Coder 7B

| 시나리오 | 제목 | TTFT | 총 응답 | 추정 tok/s | 점수 | 원본 응답 |
|---|---|---:|---:|---:|---:|---|
| S01 | 한국어 운영 질의 | - | 8.6s | 66.86 | 5.00 | [response](../raw/qwen/qwen25-coder-7b/S01.response.md) |
| S02 | Evidence 기반 RCA | - | 5.3s | 66.63 | 4.80 | [response](../raw/qwen/qwen25-coder-7b/S02.response.md) |
| S03 | Tool Plan JSON | - | 5.4s | 65.83 | 4.60 | [response](../raw/qwen/qwen25-coder-7b/S03.response.md) |
| S04 | Linux/Windows/OCP 도구 선택 | - | 8.7s | 62.74 | 4.80 | [response](../raw/qwen/qwen25-coder-7b/S04.response.md) |
| S05 | 민감정보 필터링 | - | 9.5s | 60.12 | 3.80 | [response](../raw/qwen/qwen25-coder-7b/S05.response.md) |
| S06 | 장문 보고서 생성 | - | 3.1s | 61.16 | 4.58 | [response](../raw/qwen/qwen25-coder-7b/S06.response.md) |

### DeepSeek R1 - DeepSeek R1 Distill Qwen 7B

| 시나리오 | 제목 | TTFT | 총 응답 | 추정 tok/s | 점수 | 원본 응답 |
|---|---|---:|---:|---:|---:|---|
| S01 | 한국어 운영 질의 | - | 12.0s | 25.22 | 3.20 | [response](../raw/deepseek/deepseek-r1-7b/S01.response.md) |
| S02 | Evidence 기반 RCA | - | 14.1s | 66.47 | 4.10 | [response](../raw/deepseek/deepseek-r1-7b/S02.response.md) |
| S03 | Tool Plan JSON | - | 7.1s | 41.92 | 4.15 | [response](../raw/deepseek/deepseek-r1-7b/S03.response.md) |
| S04 | Linux/Windows/OCP 도구 선택 | - | 13.6s | 48.15 | 4.00 | [response](../raw/deepseek/deepseek-r1-7b/S04.response.md) |
| S05 | 민감정보 필터링 | - | 12.5s | 50.12 | 2.00 | [response](../raw/deepseek/deepseek-r1-7b/S05.response.md) |
| S06 | 장문 보고서 생성 | - | 9.1s | 64.27 | 5.00 | [response](../raw/deepseek/deepseek-r1-7b/S06.response.md) |

### S07 Qwen -> Gemma 결합형

- Qwen 중간 산출물: [S07.intermediate-qwen.response.md](../raw/hybrid-qwen-to-gemma/S07.intermediate-qwen.response.md)
- Gemma 최종 보고서: [S07.final-gemma.response.md](../raw/hybrid-qwen-to-gemma/S07.final-gemma.response.md)
- 전체 순차 소요시간: 18.4s

## 4. 실패 및 제한사항

- `qwen/qwen35-9b-awq` switch: Timed out waiting for http://127.0.0.1:8080/v1/models: fetch failed
- `qwen/qwen35-9b-awq-quanttrio` switch: Timed out waiting for http://127.0.0.1:8080/v1/models: fetch failed

## 5. 종합 점수

# 선정 판단표 및 적용 권장

권장안: **2안 Gemma Active-Active**

Gemma 12B가 종합 점수에서 우세하거나 운영 단순성/HA 측면에서 가장 방어 가능함.

> 주의: Qwen3.5 AWQ 기본/QuantTrio 프로필은 health check 실패로 실측 점수에서 제외했고, Qwen 축은 Qwen2.5 Coder 7B fallback 결과입니다.

| 평가 항목 | Gemma 12B | Qwen2.5 Coder (Qwen3.5 대체) | DeepSeek R1 | 결합형 |
|---|---:|---:|---:|---:|
| 한국어 품질 | ★★★★★ | ★★★★★ | ★★★★☆ | ★★★★★ |
| 단일 요청 출력 속도 | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★☆ |
| 복합 RCA 품질 | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ |
| Tool Plan 품질 | ★★★★★ | ★★★★★ | ★★★★☆ | ★★★★☆ |
| JSON Schema 유효율 | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★☆ |
| Evidence 일치율 | ★★★★☆ | ★★★★☆ | ★★★☆☆ | ★★★★★ |
| 서비스 처리량 / 동시성 | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★☆ |
| 운영 단순성 | ★★★★☆ | ★★★★★ | ★★★★★ | ★★☆☆☆ |
| 확장성 / HA | ★★★★☆ | ★★★★☆ | ★★★★☆ | ★★★☆☆ |
| 실운영 적합도 | ★★★★★ | ★★★★★ | ★★★★☆ | ★★★★☆ |

## 실제 테스트 모델

- **Gemma 4 12B**: `Gemma 4 12B IT QAT` / `gemma4:12b-it-qat`
- **Qwen2.5 Coder (Qwen3.5 대체)**: `Qwen2.5 Coder 7B` / `qwen2.5-coder:7b`
- **DeepSeek R1**: `DeepSeek R1 Distill Qwen 7B` / `deepseek-r1:7b`
- **Gemma 4 E4B Baseline**: `Gemma 4 E4B` / `gemma4:e4b` (속도 기준선)
- **Qwen -> Gemma 12B 결합형**: `Qwen2.5 Coder 7B -> Gemma 4 12B IT QAT` / `qwen2.5-coder:7b -> gemma4:12b-it-qat`

## 근거 요약

- **Gemma 4 12B**: 종합 4.65/5, 평균 TTFT 0ms, 평균 총 응답 16.5s, 추정 39.54 tok/s. 한국어 운영 응답 양호, RCA 구조 양호, Tool Plan 강점, JSON 구조화 양호, 응답 속도 우수. 한국어 운영 응답, 보고서 문체, Gemma 26B A4B 프록시
- **Qwen2.5 Coder (Qwen3.5 대체)**: 종합 4.65/5, 평균 TTFT 0ms, 평균 총 응답 6.8s, 추정 63.89 tok/s. 한국어 운영 응답 양호, RCA 구조 양호, Tool Plan 강점, JSON 구조화 양호, 응답 속도 우수. Tool Plan, 명령 추론, agentic reasoning
- **DeepSeek R1**: 종합 4.35/5, 평균 TTFT 0ms, 평균 총 응답 11.4s, 추정 49.36 tok/s. 한국어 운영 응답 양호, RCA 구조 양호, Tool Plan 강점, JSON 구조화 양호, 응답 속도 우수. 복합 RCA reasoning 비교
- **Gemma 4 E4B Baseline**: 종합 3.93/5, 평균 TTFT 0ms, 평균 총 응답 8.3s, 추정 75.14 tok/s. 한국어 운영 응답 양호, Tool Plan 강점, JSON 구조화 양호, 응답 속도 우수. Gemma 12B 대비 속도 기준선
- **Qwen -> Gemma 12B 결합형**: 종합 4.01/5, 평균 TTFT 477ms, 평균 총 응답 18.4s, 추정 44.94 tok/s. Qwen 중간 Tool Plan과 Gemma 최종 한국어 RCA를 순차 결합. 동시 2노드 추론이 아니므로 운영 복잡도와 지연을 감점.
