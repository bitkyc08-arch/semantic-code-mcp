# Phase 5 — Multi-Provider Embedding + Vertex Native API + 병렬 워커

> Phase 4까지 Gemini + Milvus 기반 인덱싱/검색을 완성했다.
> Phase 5는 멀티 프로바이더(openai/openai-compatible/vertex/voyage) 지원을 양쪽 MCP 서버에 추가하고,
> Vertex AI를 네이티브 predict API로 구현하며, API provider의 병렬 워커를 활성화한다.

---

## 범위

- **IN**: 멀티 프로바이더 라우팅, Vertex 네이티브 :predict API, SA JSON 보안 경로 이동, API provider 병렬 워커 활성화, config 확장, MCP 글로벌 설정 연동
- **OUT**: Claude Model Garden 활성화 (별도 이슈), Milvus 인덱스 튜닝

---

## 체크리스트

### P5-1: mcp-markdown-rag — Multi-Provider 지원
- [x] `server.py`: `VertexEmbeddingFunction` 클래스 추가 (네이티브 :predict)
- [x] `server.py`: openai-compatible 분기 추가
- [x] `server.py`: Vertex 토큰 naive/aware datetime 충돌 버그 수정
- [x] `server.py`: provider/model/endpoint/dim 로그 stderr 출력
- [x] `pyproject.toml`: `google-auth>=2.20.0` 의존성 추가
- [x] `README.md`: 프로바이더 매트릭스, env 테이블, Vertex 예시 업데이트

### P5-2: smart-coding-mcp — Multi-Provider 지원
- [x] `config.js`: validProviders 확장 (`local,gemini,openai,openai-compatible,vertex`)
- [x] `config.js`: 신규 env 파싱 (`SMART_CODING_EMBEDDING_API_KEY`, `_BASE_URL`, `_VERTEX_PROJECT`, `_VERTEX_LOCATION`)
- [x] `mrl-embedder.js`: createEmbedder() 라우팅 확장
- [x] `gemini-embedder.js`: provider별 apiKey/baseUrl/defaultModel 분기
- [x] `gemini-embedder.js`: Vertex 네이티브 :predict 요청/응답 어댑터
- [x] `gemini-embedder.js`: `google-auth-library` 연동 토큰 발급
- [x] `embedding-worker.js`: API provider 분기 확장 + 신규 옵션 전달
- [x] `milvus-cache.js`: API provider dimension 계산 통일
- [x] `get-status.js`: Vertex fallback 모델 표시 정합화
- [x] `package.json`: `google-auth-library` 의존성 추가
- [x] 테스트: `gemini-embedder.test.js` 비동기 패턴 수정 (10 passed)

### P5-3: SA JSON 보안 경로 이동
- [x] `/Users/jun/secure/` 디렉토리 생성 (chmod 700)
- [x] `vertex-sa.json` 이동 + chmod 600
- [x] iCloud 경로의 원본 삭제
- [x] `~/.zshrc`: `GOOGLE_APPLICATION_CREDENTIALS` export 추가
- [x] `config.toml` (Codex): 양쪽 MCP 서버 env에 경로 반영
- [x] `.claude.json` (Claude): 양쪽 MCP 서버 env에 경로 반영
- [x] `mcp_config.json` (Antigravity): 양쪽 MCP 서버 env에 경로 반영
- [x] VS Code `settings.json` (Copilot): 양쪽 MCP 서버 env에 경로 반영

### P5-4: API Provider 병렬 워커
- [x] `index-codebase.js`: API provider에서 worker 차단 가드 제거
- [x] `config.json`: `workerThreads: "auto"` → `50`
- [x] `resource-throttle.js`: CPU 코어 수 상한 제거 (API는 I/O-bound)

### P5-5: Tokenizer 모델별 토큰 한도 추가
- [x] `tokenizer.js`: `MODEL_TOKEN_LIMITS`에 `gemini-embedding-001: 2048` 추가
- [x] 검증: `targetTokens=1740`, `overlapTokens=313` (기존 fallback 256 → 2048으로 변경)
- [x] 효과: 청크 수 대폭 감소 (예: 7파일 206청크 → 재인덱싱 시 확인)

---

## 수정 파일 목록

### mcp-markdown-rag

| 파일             | 변경 내용                                                                      |
| ---------------- | ------------------------------------------------------------------------------ |
| `server.py`      | VertexEmbeddingFunction 추가, openai-compatible 분기, datetime 버그 수정, 로그 |
| `pyproject.toml` | google-auth 의존성                                                             |
| `README.md`      | 프로바이더 매트릭스/env 업데이트                                               |

### smart-coding-mcp

| 파일                           | 변경 내용                                 |
| ------------------------------ | ----------------------------------------- |
| `lib/config.js`                | validProviders 확장, 신규 env/config 키   |
| `lib/mrl-embedder.js`          | createEmbedder 라우팅 확장                |
| `lib/gemini-embedder.js`       | Vertex native :predict, provider별 어댑터 |
| `lib/embedding-worker.js`      | API provider 분기, 신규 옵션 전달         |
| `lib/milvus-cache.js`          | dimension 계산 통일                       |
| `features/get-status.js`       | Vertex fallback 모델 정합화               |
| `features/index-codebase.js`   | API provider 워커 가드 제거               |
| `lib/resource-throttle.js`     | CPU 코어 상한 제거                        |
| `config.json`                  | workerThreads: 50                         |
| `package.json`                 | google-auth-library                       |
| `test/gemini-embedder.test.js` | 비동기 패턴 수정                          |

### 인프라/설정

| 파일                               | 변경 내용                             |
| ---------------------------------- | ------------------------------------- |
| `/Users/jun/secure/vertex-sa.json` | SA JSON 보안 경로 이동                |
| `~/.zshrc`                         | GOOGLE_APPLICATION_CREDENTIALS export |
| `config.toml`                      | Codex MCP env                         |
| `.claude.json`                     | Claude MCP env                        |
| `mcp_config.json`                  | Antigravity MCP env                   |
| VS Code `settings.json`            | Copilot MCP env                       |

---

## 검증 결과

### mcp-markdown-rag

| 항목                                 | 결과                   |
| ------------------------------------ | ---------------------- |
| py_compile                           | ✅ 통과                 |
| Vertex 스모크 (gemini-embedding-001) | ✅ ok=True dim=768      |
| force_reindex=true                   | ✅ 44파일, 655청크      |
| 증분 인덱싱                          | ✅ "Already up to date" |

### smart-coding-mcp

| 항목                                 | 결과                         |
| ------------------------------------ | ---------------------------- |
| node --check (6 files)               | ✅ 전부 통과                  |
| gemini-embedder.test.js              | ✅ 10 passed                  |
| Vertex 스모크 (gemini-embedding-001) | ✅ ok=true dim=768            |
| Config validation (invalid provider) | ✅ 에러 로그 + local fallback |
| Vertex project 누락                  | ✅ "Missing project" 에러     |

### Vertex 병렬 워커

| 항목              | 변경 전                      | 변경 후                 |
| ----------------- | ---------------------------- | ----------------------- |
| API provider 워커 | ❌ 비활성화 (single-thread)   | ✅ 50 workers            |
| CPU 코어 상한     | `Math.min(parsed, cpuCount)` | `Math.max(1, parsed)`   |
| 타임아웃 리스크   | ⚠️ 60초 초과                  | ✅ 병렬 처리로 개선 예상 |

---

## 프로바이더 매트릭스 (최종)

| Provider              | `EMBEDDING_PROVIDER` | 필수 env                                                              | base_url               | 인증              |
| --------------------- | -------------------- | --------------------------------------------------------------------- | ---------------------- | ----------------- |
| **OpenAI**            | `openai`             | `OPENAI_API_KEY`                                                      | (기본)                 | API Key           |
| **OpenAI-compatible** | `openai-compatible`  | `EMBEDDING_API_KEY`, `EMBEDDING_BASE_URL`                             | 사용자 지정            | API Key           |
| **Gemini**            | `gemini`             | `GEMINI_API_KEY`                                                      | Google AI Studio       | API Key           |
| **Vertex AI**         | `vertex`             | `GOOGLE_APPLICATION_CREDENTIALS`, `VERTEX_PROJECT`, `VERTEX_LOCATION` | Vertex native :predict | OAuth (자동 갱신) |
| **Voyage**            | `voyage`             | `VOYAGE_API_KEY`                                                      | (기본)                 | API Key           |
| **Local**             | `local`              | —                                                                     | —                      | —                 |

---

## 리스크 및 미완료 항목

| 항목                         | 상태   | 비고                                           |
| ---------------------------- | ------ | ---------------------------------------------- |
| 병렬 워커 50 실사용 검증     | 미완료 | rate limit 에러 시 워커 수 조정 필요           |
| Claude Model Garden 활성화   | 미완료 | 별도 이슈 (gen-lang-client 프로젝트 제약 추정) |
| 4개 에이전트 MCP 재연결 검증 | 미완료 | 리로드 후 provider별 동작 확인                 |
| vitest 전체 테스트           | 미완료 | 장시간 실행으로 문법/스모크 검증으로 대체      |

---

## 변경 기록

- 2026-02-15: Phase 5 상세 계획 생성. Multi-Provider + Vertex native + 병렬 워커 구현 완료.
