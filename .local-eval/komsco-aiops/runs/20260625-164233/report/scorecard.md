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
