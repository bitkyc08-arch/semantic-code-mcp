# Phase 4 상세 계획 — ANN 검색 전환

> Phase 2에서 Milvus를 저장소로 사용하되 검색은 JS 전수 cosine이었다.
> Phase 4는 검색을 Milvus 서버측 ANN으로 전환해, 대규모 인덱스에서 성능을 확보한다.

---

## 범위

- **IN**: searchByVector, getStats, load 최적화, hybrid-search ANN 경로, 통계 전환, 폴백 계약, 로컬 push 제거
- **OUT**: Milvus 인덱스 타입 튜닝(HNSW/IVF_FLAT), 검색 파라미터 최적화(nprobe/ef), indexAll coalescing

---

## 개발 전략

1. dev 폴더(`smart-coding-mcp-dev`)를 복사해 B 서버로 분리
2. B에서 P4-1~P4-7 구현 + Gemini 실호출 E2E 검증
3. 검증 통과 후 B를 A로 재통합
4. dev 폴더/config B 블록 삭제

---

## 체크리스트

### P4-0: 체크리스트 고정 + dev 폴더 분리
- [x] phase4-plan.md 생성 및 P4-0~P4-7 항목 고정
- [x] `700_projects/smart-coding-mcp` → `smart-coding-mcp-dev` 복사
- [x] dev 폴더에서 독립 실행 가능 확인

### P4-1: `milvus-cache.js` — searchByVector
- [x] `searchByVector(queryVector, topK)` 메서드 구현
- [x] Milvus `search()` API 호출, 결과를 `{ file, content, score }` 형태로 반환
- [x] 계약 테스트 추가 (`milvus-cache-contract.test.js`)

### P4-2: `milvus-cache.js` — getStats
- [x] `getStats()` 메서드 구현 — `count()` 우선, `getCollectionStatistics()` 폴백
- [x] 반환 형태: `{ totalChunks, totalFiles }`

### P4-3: `milvus-cache.js` — load 전체 벡터 로드 제거
- [x] ANN 모드(`searchByVector` 존재)에서 `fetchAllVectors()` 호출 제거
- [x] `this.vectorStore = []` 유지 (메모리 절약)

### P4-4: `features/hybrid-search.js` — ANN 우선 경로
- [x] `cache.searchByVector` 존재 시 ANN 경로 사용
- [x] 미존재 시 레거시 전수 cosine 폴백 유지
- [x] 빈 인덱스 메시지 / 인덱싱 중 메시지 동작 유지

### P4-5: 통계 경로 전환
- [x] `features/get-status.js` — `getStats()` 기반으로 전환
- [x] `features/index-codebase.js` — 인덱싱 결과/리포트에서 `getStats()` 사용

### P4-6: 폴백 계약 추가
- [x] `lib/sqlite-cache.js` — `searchByVector()`, `getStats()` 스텁 추가
- [x] `lib/cache.js` — 동일 인터페이스 보장

### P4-7: 로컬 vectorStore push 제거
- [x] ANN 모드에서 `this.vectorStore.push(...)` 호출 제거
- [x] 인덱싱 시 Milvus insert만 수행, 로컬 메모리에 벡터 적재 안 함

---

## 수정 파일 목록

| 파일 | 변경 내용 |
| --- | --- |
| `lib/milvus-cache.js` | searchByVector, getStats, load 최적화, push 제거 |
| `lib/sqlite-cache.js` | searchByVector/getStats 폴백 스텁 |
| `lib/cache.js` | 인터페이스 통일 |
| `features/hybrid-search.js` | ANN 우선 검색 경로 |
| `features/get-status.js` | getStats() 기반 통계 |
| `features/index-codebase.js` | 통계/인덱싱 결과 getStats() 기반 |
| `test/milvus-cache-contract.test.js` | searchByVector 계약 테스트 |
| `test/hybrid-search-ann.test.js` | ANN 경로 검증 |
| `test/get-status.test.js` | getStats 경로 검증 |
| `test/index-codebase-stats.test.js` | 통계 경로 검증 |

---

## 검증 결과

### 단위 테스트
- 실행: 4 test files, 15 tests
- 결과: **전부 통과**

### Gemini + Milvus E2E (실호출)

| 항목 | 결과 |
| --- | --- |
| model | gemini-embedding-001 |
| dimension | 768 |
| annCalls | 1 (searchByVector 경유 확인) |
| indexResult.totalChunks | 2 |
| stats.totalChunks | 2 |
| top result | auth.js |

### 증분 재인덱싱 (주석 추가 테스트)

| 시점 | filesProcessed | chunksCreated | 메시지 |
| --- | --- | --- | --- |
| 1차 (force) | 2 | 2 | — |
| 2차 (무변경) | 0 | 0 | All 2 files up to date |
| 3차 (주석 추가) | 1 | 1 | Indexed 1 files |

### 재통합 후 풀 리인덱싱

| 항목 | 결과 |
| --- | --- |
| files | 47 |
| chunks | 79 |
| 소요 시간 | 44s |
| provider | gemini + milvus |

---

## 리스크 및 미완료 항목

| 항목 | 상태 | 비고 |
| --- | --- | --- |
| P4-8: 기준 쿼리 세트 v0 A/B 비교 리포트 | 미완료 | Phase 2 vs Phase 4 지연/품질 정량 비교 |
| P4-9: 4개 에이전트 재연결 검증 | 미완료 | Claude Code, Codex, Copilot, Antigravity |
| Milvus 인덱스 타입 튜닝 | OUT | HNSW/IVF_FLAT 선택은 후속 |
| 검색 파라미터 최적화 | OUT | nprobe, ef 등 |

---

## 변경 기록

- 2026-02-14: Phase 4 상세 계획 생성 (P4-0~P4-7 완료, P4-8/P4-9 미완료)
