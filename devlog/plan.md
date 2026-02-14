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

### Phase 3. 통합 검증

- 무변경 재인덱싱에서 write 0 확인
- 파일 수정/삭제 반영 정확성 확인
- 다중 쿼리 품질 비교
- 네트워크 오류/타임아웃 동작 확인

### Phase 4. B 준비 (후속)

- `features/hybrid-search.js` ANN 전환 스파이크
- A/B 비교 리포트(지연/품질/메모리)
- 승격 기준 충족 시 B 본개발

---

## 5) 파일별 TODO (A 우선)

### Gemini

- [x] `lib/gemini-embedder.js` 작성
- [x] `lib/mrl-embedder.js`에 `embeddingProvider=gemini` 분기
- [x] `lib/embedding-worker.js`에 동일 분기 추가
- [x] `package.json` 의존성 추가 검토 (native `fetch` 사용으로 신규 의존성 불필요)
- [x] `lib/config.js` env 키 추가

### Milvus A

- [ ] `lib/milvus-cache.js` 작성
- [ ] `index.js`에서 `SQLiteCache|MilvusCache` 분기
- [ ] `features/index-codebase.js`에서 `getVectorStore()` 의존 최소화
- [ ] `features/get-status.js`에서 통계 수집 방식 정리

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

### B안: 검색 전환 핵심 (후속)

```javascript
// features/hybrid-search.js
const candidates = await this.cache.searchByVector(queryVector, maxResults * 20);
const boosted = candidates.map((c) => ({
  ...c,
  score:
    c.score +
    (c.content.toLowerCase().includes(query.toLowerCase()) ? this.config.exactMatchBoost : 0),
}));
return { results: boosted.sort((a, b) => b.score - a.score).slice(0, maxResults) };
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
