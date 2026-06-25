# GB10 2노드 적용 제안서

## 결론

- 권장안: **2안 Gemma Active-Active**
- 판단 근거: Gemma 12B가 종합 점수에서 우세하거나 운영 단순성/HA 측면에서 가장 방어 가능함.

## 1안 혼합형 평가

- 의미: Gemma 12B 계열을 한국어 보고서/운영 응답 축으로 두고, Qwen 또는 DeepSeek를 RCA/Tool Plan 축으로 라우팅.
- Gemma 한국어 품질: ★★★★★ / Qwen Tool Plan: ★★★★★ / DeepSeek RCA: ★★★★★
- 적용 조건: 모델별 강점이 분리되고 라우팅 정책을 운영할 수 있을 때.

## 2안 Gemma Active-Active 평가

- 의미: GB10 2대에 동일 Gemma 계열 모델을 올려 운영 단순성, HA, 처리량을 우선.
- Gemma 실운영 적합도: ★★★★★ / 운영 단순성: ★★★★☆ / 확장성·HA: ★★★★☆
- 적용 조건: Gemma 12B 프록시 결과가 RCA/Tool Plan까지 충분히 방어 가능하고 운영 단순성이 중요할 때.

## 3안 Gemma+Qwen 결합형 평가

- 의미: Qwen이 Tool Plan/원인 후보를 생성하고 Gemma가 최종 한국어 RCA 보고서를 작성.
- 결합형 실운영 적합도: ★★★★☆ / RCA 품질: ★★★★★ / 운영 단순성: ★★☆☆☆
- 적용 조건: 복합 RCA 요청에서만 제한 적용. 일반 질의에 상시 결합하면 지연과 운영 복잡도가 커짐.

## PoC 필수 체크포인트

- Gemma 26B A4B 실제 처리량과 품질
- GB10 2노드 동시성 1/4/8 처리량
- failover RTO와 세션 재시도 정책
- 네트워크 지연과 Gateway 라우팅 오버헤드
- KV cache 포함 메모리 여유율
- Tool Call 안전 승인 정책과 감사로그 적재

## 로컬 테스트 한계

- 본 테스트는 단일 PC에서 모델을 하나씩 전환해 수행했다.
- Gemma+Qwen 결합형은 동시 실행이 아니라 순차 오케스트레이션이다.
- 대형 모델 분산 추론 병목과 GB10 NPU/GPU 런타임 특성은 본 테스트에서 실측하지 않았다.
- Qwen 축 점수는 Qwen3.5 AWQ 두 프로필의 health check 실패 후 `qwen2.5-coder:7b` fallback으로 측정한 값이다.

## 실행 중 실패 기록

- qwen/qwen35-9b-awq switch: Timed out waiting for http://127.0.0.1:8080/v1/models: fetch failed
- qwen/qwen35-9b-awq-quanttrio switch: Timed out waiting for http://127.0.0.1:8080/v1/models: fetch failed
