# smart-coding-mcp 구현 플랜 (GEMINI + A 우선, B 후속)

이 문서는 `700_projects/smart-coding-mcp` 포크 작업의 실행 계획과 작업 로그를 한 곳에서 관리하기 위한 devlog다.
목표는 한 번에 큰 전환을 하지 않고, 실패 가능성이 낮은 단계부터 확실히 쌓아 올리는 것이다.

---

## 1) 목표

1. 임베딩을 로컬 ONNX 중심에서 Gemini API 기반으로 전환한다.
2. 벡터 저장소를 SQLite에서 Milvus로 옮겨 동시 접근 안정성을 높인다.
3. 증분 인덱싱(`mtime + hash`) 흐름은 유지한다.
4. 검색 엔진 전환(ANN)은 후속(B)으로 분리한다.

---

## 2) 범위 정의

- **A안 (이번 스프린트 목표)**  
  Gemini + Milvus 저장소 전환, 기존 검색 경로 유지

- **B안 (후속 스프린트)**  
  Milvus ANN 검색으로 검색 경로 전환

---

## 3) 작업 원칙

1. 한 커밋 = 한 논리 변경
2. 회귀 위험이 큰 변경은 feature flag로 보호
3. 증분 인덱싱 경로는 A/B 공통으로 유지
4. 로그는 이 문서 `Dev Log` 섹션에 지속 기록

---

## 4) 구현 로드맵

### Phase 0. 베이스라인 고정

- 현재 버전에서 index/search/clear 동작 캡처
- 성능/품질 비교용 기준 쿼리 세트 확정
- 실패 시 롤백 가능한 최소 지점 태깅

#### Phase 0 실행 상태 (임베딩 미호출 기준)

- [x] 런타임/브랜치 베이스라인 캡처
  - Node `v22.18.0`, npm `10.9.3`
  - submodule HEAD `f5bd732` (`agent`)
- [x] 서버 부팅 스모크 (임베딩 lazy load + auto-index 비활성)
  - 실행: `SMART_CODING_AUTO_INDEX_DELAY=false SMART_CODING_WATCH_FILES=false SMART_CODING_DEVICE=cpu node index.js --workspace "$PWD"`
  - 결과: `Model will load on first use (lazy initialization)` 확인, 프로세스 정상 기동/종료
- [x] 비임베딩 테스트셋 실행
  - 통과: `test/ast-chunker.test.js`, `test/tokenizer.test.js`, `test/check-last-version.test.js`
  - 초기 실패(환경/스펙 불일치) 2건 정리 완료:
    - `test/better-sqlite3.test.js`의 Node 버전 기대치를 `v25` 고정에서 `>=18` 검증으로 수정
    - `test/device-detection.test.js` 기본값 기대치를 현재 코드 기본값(`auto`, `128`)으로 정렬
  - 재검증: `ast-chunker`, `tokenizer`, `check-last-version`, `better-sqlite3`, `device-detection` 총 141 tests 통과
- [x] 기준 쿼리 세트 확정 (Phase 1 직전)
- [x] 롤백 태그 전략 확정 (실행은 user 요청 시)

#### 기준 쿼리 세트 v0 (A/B 비교 공용)

아래 쿼리는 Phase 1 이후 동일하게 반복 실행해, 결과 품질과 지연을 비교한다.

1. `incremental indexing file hash mtime`
2. `clear cache while indexing is in progress`
3. `auto index delay environment variable`
4. `embedding worker thread initialization`
5. `sqlite cache remove file from store`
6. `hybrid search exact match boost`
7. `device and embedding dimension defaults`
8. `check latest package version tool handler`
9. `AST chunker fallback to smart chunking`
10. `config override SMART_CODING_* env parsing`

#### 롤백 태그 전략 (실행 보류)

실제 태그 생성은 사용자 요청 시에만 수행하고, Phase 0에서는 명령 표준만 고정한다.

- submodule (`700_projects/smart-coding-mcp`)
  - `git tag -a phase0-baseline-smart-coding-f5bd732 -m "[agent] chore: phase0 baseline"`
- parent repo (`new`)
  - submodule ref 커밋 이후 `git tag -a phase0-baseline-parent-<sha> -m "[agent] chore: phase0 baseline parent"`
- 롤백 기준
  - Phase 1에서 회귀 발견 시 submodule 태그로 즉시 복귀 검토
  - parent는 submodule ref 기준으로 동기 복귀

### Phase 1. Gemini 이식

- `lib/gemini-embedder.js` 신규
- `lib/mrl-embedder.js` factory 분기
- `lib/embedding-worker.js` 동일 분기
- `lib/config.js` provider/model/key 옵션 추가
- API 배치 + 재시도(backoff) 기본 정책

### Phase 2. Milvus A 이식

- `lib/milvus-cache.js` 신규
- `index.js` cache provider DI 분기
- `features/index-codebase.js` 통계 참조 정리
- `features/get-status.js` cache 타입별 안전 처리

### Phase 3. 통합 검증 ✅

- [x] 무변경 재인덱싱에서 write 0 확인
- [x] 파일 수정/삭제 반영 정확성 확인
- [x] 다중 쿼리 품질 비교
- [x] 네트워크 오류/타임아웃 동작 확인 (429 재시도, 400 비재시도 검증)

### Phase 4. ANN 검색 전환 ✅

- [x] P4-0: 체크리스트 고정 + dev 폴더 분리
- [x] P4-1: `milvus-cache.js` — `searchByVector()` 구현
- [x] P4-2: `milvus-cache.js` — `getStats()` 구현 (count 우선 파싱)
- [x] P4-3: `milvus-cache.js` — `load()`에서 전체 벡터 로드 제거
- [x] P4-4: `features/hybrid-search.js` — ANN 우선 검색 경로 전환
- [x] P4-5: `features/get-status.js`, `features/index-codebase.js` — `getStats()` 기반 통계
- [x] P4-6: `lib/sqlite-cache.js`, `lib/cache.js` — `searchByVector`/`getStats` 폴백 계약 추가
- [x] P4-7: `milvus-cache.js` — ANN 모드에서 로컬 vectorStore push 제거
- [x] Gemini+Milvus E2E 실검증 (768d, annCalls=1, 증분 재인덱싱 정상)
- [x] A/B 동시 기동 확인 → B를 A로 재통합 완료
- [ ] P4-8: 기준 쿼리 세트 v0 A/B 비교 리포트
- [ ] P4-9: 4개 에이전트 재연결 검증

### Phase 5. 동시 배치 최적화

- [x] `gemini-embedder.js` — `geminiMaxConcurrentBatches` 세마포어 적용 (기본 1, 최대 50)
- [x] `config.js` + `config.json` — 환경변수 `SMART_CODING_GEMINI_MAX_CONCURRENT_BATCHES` 추가
- [x] `index-codebase.js` + `embedding-worker.js` — workerData 전달 경로 반영
- [ ] indexAll coalescing (동시 요청 → join 패턴) — 미착수

---

## 5) 파일별 TODO (A 우선)

### Gemini

- [x] `lib/gemini-embedder.js` 작성
- [x] `lib/mrl-embedder.js`에 `embeddingProvider=gemini` 분기
- [x] `lib/embedding-worker.js`에 동일 분기 추가
- [x] `package.json` 의존성 추가 검토 (native `fetch` 사용으로 신규 의존성 불필요)
- [x] `lib/config.js` env 키 추가

### Milvus A

- [x] `lib/milvus-cache.js` 작성
- [x] `index.js`에서 `SQLiteCache|MilvusCache` 분기
- [x] `features/index-codebase.js`에서 `getVectorStore()` 의존 최소화
- [x] `features/get-status.js`에서 통계 수집 방식 정리

### Phase 4 — ANN 전환

- [x] `lib/milvus-cache.js` — `searchByVector()`, `getStats()` 추가
- [x] `lib/milvus-cache.js` — `load()` 전체 벡터 로드 제거, ANN 모드 로컬 push 제거
- [x] `lib/sqlite-cache.js`, `lib/cache.js` — 폴백 계약 (`searchByVector`/`getStats`)
- [x] `features/hybrid-search.js` — ANN 우선 검색 경로
- [x] `features/get-status.js` — `getStats()` 기반 통계 전환
- [x] `features/index-codebase.js` — 통계/인덱싱 결과 `getStats()` 기반

### Phase 5 — 동시 배치

- [x] `lib/gemini-embedder.js` — `maxConcurrentBatches` 세마포어
- [x] `lib/config.js` — `geminiMaxConcurrentBatches` 환경변수/기본값
- [x] `features/index-codebase.js` + `lib/embedding-worker.js` — workerData 전달

### 검증

- [x] index/search/clear smoke test
- [x] 증분 인덱싱 회귀 테스트
- [x] 결과 포맷 호환성 확인

---

## 6) 코드 기준 스니펫

### A안: 저장소 전환 핵심

```javascript
// index.js
cache =
  config.vectorStoreProvider === "milvus"
    ? new MilvusCache(config)
    : new SQLiteCache(config);
await cache.load();
```

```javascript
// lib/milvus-cache.js
async removeFileFromStore(file) {
  const escaped = file.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  await this.client.delete({
    collection_name: this.collectionName,
    filter: `file == "${escaped}"`,
  });
}
```

### B안: 검색 전환 핵심 (Phase 4 구현 완료)

```javascript
// features/hybrid-search.js — ANN 우선 경로 (실적용)
if (typeof this.cache.searchByVector === "function") {
  const candidates = await this.cache.searchByVector(queryVector, maxResults * 20);
  const boosted = candidates.map((c) => ({
    ...c,
    score:
      c.score +
      (c.content.toLowerCase().includes(query.toLowerCase()) ? this.config.exactMatchBoost : 0),
  }));
  return { results: boosted.sort((a, b) => b.score - a.score).slice(0, maxResults) };
}
// 레거시 폴백: 전수 cosine (searchByVector 미지원 캐시)
```

---

## 7) A -> B 승격 조건

아래 중 2개 이상 충족 시 B로 승격:

1. 검색 p95 지연이 반복적으로 목표 초과
2. 인덱스 규모 증가로 메모리 로드 병목이 명확
3. 동시 사용 시 지연/불안정 반복
4. 운영 요구사항이 ANN 전환을 요구

---

## 8) 커밋 운영 (submodule + parent)

이 저장소는 상위 repo에 서브모듈로 연결되어 있으므로 항상 2단계로 반영한다.

1. **Submodule commit**  
   `700_projects/smart-coding-mcp` 내부에서 커밋
2. **Parent commit**  
   상위 repo에서 submodule ref 업데이트 커밋

---

## 9) Dev Log

형식:

```text
YYYY-MM-DD HH:mm | phase | change | result | next
```

기록:

- 2026-02-14 19:53 | setup | `devlog/plan.md` 생성 및 07.7 기반 실행 플랜 확정 | A 우선/B 후속 방향 고정 | Phase 0 베이스라인 캡처 시작
- 2026-02-14 20:25 | phase0 | 서버 스모크를 auto-index OFF + lazy-load 조건으로 실행 | 임베딩 미호출 상태에서 기동/종료 정상 확인 | 비임베딩 테스트셋 베이스라인 확정
- 2026-02-14 20:25 | phase0 | 비임베딩 테스트셋 실행(`ast-chunker`, `tokenizer`, `check-last-version`, `better-sqlite3`, `device-detection`) | 2건의 스펙/환경 불일치 실패 확인(Node v25 기대, default config 기대치 구버전) | Phase 0 문서화 후 Phase 1 착수 전 정렬 여부 결정
- 2026-02-14 20:25 | phase0 | A/B 공용 기준 쿼리 10개 확정 | 품질/지연 비교용 고정 세트 준비 완료 | 롤백 태그 전략만 남음
- 2026-02-14 20:25 | phase0 | 롤백 태그 네이밍/절차 표준화 (실행 보류) | 실행 커맨드와 복귀 기준 문서화 완료 | Phase 0 문서 기준 완료
- 2026-02-14 20:27 | phase0 | 비임베딩 테스트 2건 기대치 정렬(`better-sqlite3`, `device-detection`) | Node v22 환경 및 현재 default config 기준으로 재검증 성공 | Phase 1 준비 상태 확정
- 2026-02-14 20:34 | phase1 | Gemini embedder + config/env + worker 전달 경로 구현 | `embeddingProvider=gemini` 진입 경로 완성, worker는 safe mode 단일 스레드 정책 적용 | 문서/테스트 반영 후 커밋
- 2026-02-14 20:34 | phase1 | 모킹 기반 검증(`gemini-embedder`, `device-detection` 확장) + 회귀셋 실행 | 6 test files, 154 tests 통과. Gemini provider 서버 부팅 스모크 정상 | submodule/parent 커밋 진행
- 2026-02-14 20:42 | phase2-plan | `devlog/phase2-plan.md` 보강 (Phase 2-0 무임베딩 경로, 세부 TODO, 스니펫) | Milvus A 실행 순서와 검증 게이트 고정 | phase2 구현 착수
- 2026-02-14 20:43 | phase2-baseline | Gemini API 실호출(`createGeminiEmbedder`) 단건/2건 배치 확인 | model `gemini-embedding-001`, 768d x2, elapsed 약 489ms | phase2-plan을 실호출 기준으로 재작성
- 2026-02-14 20:50 | phase2-p2-1 | `vectorStoreProvider` 설정, `cache-factory`, `index.js` 캐시 DI 반영 + `set-workspace/get-status` 계약 정리 | `cache-factory`/`device-detection` 테스트 31건 통과, sqlite/milvus 부팅 스모크 확인 | P2-2 Milvus 실저장소 구현
- 2026-02-14 20:59 | phase2-p2-2 | `lib/milvus-cache.js` 실구현 + `index-codebase/set-workspace` reset 계약 추가 + `@zilliz/milvus2-sdk-node` 의존성 반영 | Milvus load/insert/delete/save 스모크 통과, 관련 테스트 34건 통과 | P2-4 통합 인덱싱 검증
- 2026-02-14 21:00 | phase2-gemini-e2e | `embeddingProvider=gemini + vectorStoreProvider=milvus` 조합으로 실임베딩+실저장소 smoke 실행 | `gemini-embedding-001`, 768d, Milvus insert/delete/save 성공 | Gemini 기준으로 P2-4 진행
- 2026-02-14 21:03 | phase2-p2-4 | Gemini+Milvus로 임시 워크스페이스(2 files) `indexAll(true)` + `search(\"login authentication\")` 통합 실행 | 인덱싱 2 files/2 chunks, 검색 top 결과 `auth.js` 확인 | P2-5 부하/재시도 검증
- 2026-02-14 21:07 | phase2-p2-5 | `gemini-embedder` 재시도 검증(429, 네트워크 예외, 동시 배치 부하, 400 비재시도) 테스트 추가 및 로직 보정 | 관련 테스트 16건 통과, live Gemini 768d 스모크 재확인 | 커밋 후 Codex config.toml 실사용 테스트
- 2026-02-14 22:00 | phase3 | Gemini+Milvus 통합 검증 — 증분 인덱싱(무변경 0, 변경 1), 다중 쿼리 품질, 429 재시도 | Phase 3 전 항목 통과 | Phase 4 착수
- 2026-02-14 22:30 | phase4-p4-0 | dev 폴더 분리(`smart-coding-mcp-dev`) + P4-0 체크리스트 고정 | A/B 병렬 개발 환경 준비 완료 | P4-1 searchByVector 구현
- 2026-02-14 23:00 | phase4-p4-1~7 | ANN 전환 일괄 구현 — searchByVector, getStats, load 무전체로딩, hybrid-search ANN 경로, 통계 전환, 폴백 계약, 로컬 push 제거 | Gemini E2E 통과(768d, annCalls=1, totalChunks=2), 단위 테스트 15건 통과 | A/B 동시 기동 확인
- 2026-02-14 23:30 | phase4-merge | B(dev)를 A로 재통합 + `smart-coding-mcp-dev` 삭제 + config.toml B 블록 제거 | A 단일 서버로 정리, 재인덱싱 47 files/79 chunks 정상 | Phase 5 착수
- 2026-02-14 23:45 | phase5 | `gemini-embedder.js`에 `geminiMaxConcurrentBatches` 세마포어 적용(기본 1, 최대 50) | config.json 50으로 설정, workerData 전달 경로 반영 | 재로딩 후 검증
- 2026-02-15 00:00 | phase4-verify | 재로딩 후 풀 리인덱싱(47 files/79 chunks), chunkSize=10 테스트, 주석 추가 증분 재인덱싱(1 file/1 chunk) 확인 | 검색 반환 컨텍스트: 호출당 평균 841 lines (3 results) | 문서 정리
