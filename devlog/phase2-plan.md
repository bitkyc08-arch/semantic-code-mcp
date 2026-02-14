# Phase 2 실행 계획: Milvus A 저장소 전환

이 문서는 `smart-coding-mcp`의 Phase 2 범위를 고정한다.
Phase 2의 목표는 검색 경로를 바꾸지 않고 벡터 저장소만 SQLite에서 Milvus로 교체하는 것이다.
단, 이번 버전은 "실제 Google(Gemini) 임베딩 호출이 성공한 조건"을 기준선으로 삼는다.

## 무엇을 하는 문서인가

이 문서는 Phase 2에서 실제로 수정할 파일, 인터페이스, 검증 순서를 실행 단위로 정리한다.
핵심은 "현재 검색 품질/출력 포맷을 유지한 채 저장소만 바꾼다"는 원칙을 지키는 것이다.

## 왜 중요한가

현재 구조는 `SQLiteCache`를 기준으로 안정화되어 있다.
하지만 동시 접근이 늘어나면 저장/삭제 타이밍 충돌이 생기기 쉽다.
Milvus A는 ANN 검색 전환 없이 저장소만 바꾸므로, 위험을 낮추면서도 운영 안정성을 먼저 올릴 수 있다.

또한 Phase 1에서 Gemini 임베딩 경로를 분리했기 때문에, Phase 2는 임베더를 건드리지 않고 캐시 레이어만 독립적으로 개선할 수 있다.
이 순서를 지키면 회귀 분석이 쉬워진다.

## 어떻게 진행하는가

1. Phase 2-0에서 실제 Gemini 임베딩 호출을 먼저 통과시켜 API/키/차원 기준을 고정한다.
2. 캐시 인터페이스를 먼저 고정한다.
3. `MilvusCache`를 `SQLiteCache`와 같은 계약으로 구현한다.
4. `index.js`에서 캐시 팩토리 분기로 `sqlite|milvus`를 선택한다.
5. `set-workspace`의 내부구조 직접 접근(`fileHashes`)을 제거하고 공통 메서드만 사용한다.
6. 검색(`HybridSearch`)은 그대로 두고 `getVectorStore()` 기반 동작을 유지한다.

Phase 2 실행 트리거 문구는 아래처럼 사용한다.
- 한국어: `phase2 시작해`, `Milvus A 진행해`, `저장소만 Milvus로 바꿔`
- English: `start phase2`, `run milvus A`, `switch cache to milvus only`

대화 예시는 아래처럼 짧게 시작한다.
- 사용자: `phase2 시작해. 검색 로직은 건들지 마.`
- 에이전트: `Milvus A 범위로 cache layer만 교체하고, hybrid-search는 유지한다.`

실무 팁은 세 가지다.
첫째, Phase 2에서 ANN 검색 최적화는 금지한다.
둘째, `MilvusCache`가 `SQLiteCache`와 같은 반환 타입을 지키는지부터 확인한다.
셋째, 실호출 기준에서 `model/dim/latency`를 로그로 남기고 나서 코드 변경에 들어간다.

---

## 기술 레퍼런스

### 범위 정의

| 항목 | 포함 | 제외 |
| --- | --- | --- |
| 저장소 | SQLite -> Milvus 교체 | ANN 검색 전환 |
| 검색 경로 | `HybridSearch` 유지 | `hybrid-search.js` 점수 로직 변경 |
| 인덱싱 | 기존 증분 인덱싱 유지 | 청킹/임베딩 알고리즘 변경 |
| 임베딩 | Phase 1 경로 재사용 | Gemini/Local 분기 재설계 |

### 현재 캐시 계약 (Phase 2에서 유지해야 하는 인터페이스)

| 메서드/필드 | 호출 위치 | 요구 사항 |
| --- | --- | --- |
| `load()` | `index.js` | 초기화 및 연결 준비 |
| `getVectorStore()` | `features/hybrid-search.js`, `features/get-status.js`, `features/index-codebase.js` | `[{file,startLine,endLine,content,vector}]` 반환 |
| `addBatchToStore(chunks)` | `features/index-codebase.js` | 배치 insert |
| `addToStore(chunk)` | fallback 경로 | 단건 insert |
| `removeFileFromStore(file)` | `features/index-codebase.js` | 파일 단위 delete |
| `getFileHash/getFileMtime/setFileHash/deleteFileHash/getAllFileHashes/clearAllFileHashes` | `features/index-codebase.js` | 증분 인덱싱 유지 |
| `save()/saveIncremental()` | `features/index-codebase.js` | API 호환 유지 |
| `clear()` | `features/clear-cache.js` | 전체 캐시 삭제 |
| `setVectorStore()` | `features/set-workspace.js`, 테스트 | 호환성 유지 |
| `isSaving` | `features/clear-cache.js` | 동시 clear 보호 |

### 주요 수정 파일

| 파일 | 변경 유형 | 핵심 작업 |
| --- | --- | --- |
| `lib/milvus-cache.js` | 신규 | SQLite 계약을 만족하는 Milvus 구현 |
| `lib/config.js` | 수정 | `vectorStoreProvider`, Milvus 연결 env 추가 |
| `index.js` | 수정 | `SQLiteCache` 고정 생성 제거, provider 분기 |
| `features/get-status.js` | 수정 | cache type 판별 로직을 provider 기반으로 정리 |
| `features/set-workspace.js` | 수정 | `cache.fileHashes` 직접 접근 제거 |
| `README.md` | 수정 | Milvus provider 설정/운영 예시 추가 |
| `test/*` | 수정/신규 | config parser, cache factory, cache contract 테스트 |

### Phase 2 작업 순서 (임베딩 호출 기준)

| 단계 | 작업 | 수정 파일 | 임베딩 호출 여부 |
| --- | --- | --- | --- |
| P2-0 | Gemini 실호출 스모크(단건+2건 배치)로 API 기준선 고정 | 실행 커맨드만 | 호출 있음 |
| P2-1 | provider/환경변수/팩토리 뼈대 추가 | `lib/config.js`, `lib/cache-factory.js`, `index.js` | 호출 없음 |
| P2-2 | Milvus cache 클래스 뼈대 + 해시 API 구현 | `lib/milvus-cache.js` | 호출 없음 |
| P2-3 | workspace/status 호환성 수정 | `features/set-workspace.js`, `features/get-status.js` | 호출 없음 |
| P2-4 | 통합 검증(`b_index_codebase`, `a_semantic_search`) | 실행 커맨드만 | 호출 있음 |
| P2-5 | 부하/재시도/삭제 반영 검증 | 실행 커맨드만 | 호출 있음 |

### 실측 기준선 (2026-02-14)

`lib/gemini-embedder.js` 경로를 직접 실행해 Gemini API를 호출한 결과는 아래와 같다.

| 항목 | 실측값 |
| --- | --- |
| provider | `gemini` |
| model | `gemini-embedding-001` |
| configured dimension | `768` |
| returned vector length | `768` |
| 2건 배치 호출 elapsed | 약 `489ms` |
| API key 로딩 | `~/.zshrc` 환경변수에서 정상 로드 |

이 값을 Phase 2 검증의 최소 통과선으로 사용한다.

### 코드 기준 스니펫 (현 상태)

```javascript
// index.js (현 상태)
cache = new SQLiteCache(config);
await cache.load();
```

```javascript
// lib/config.js (현 상태)
const DEFAULT_CONFIG = {
  ...
  embeddingProvider: "local",
  ...
  // vectorStoreProvider 없음
};
```

```javascript
// features/set-workspace.js (현 상태 - 백엔드 의존)
if (clearCache && this.cache) {
  this.cache.setVectorStore([]);
  this.cache.fileHashes = new Map();
}
```

```javascript
// features/hybrid-search.js (현 상태)
const vectorStore = this.cache.getVectorStore();
const scoredChunks = vectorStore.map(chunk => {
  let score = cosineSimilarity(queryVector, chunk.vector) * this.config.semanticWeight;
  ...
});
```

### 코드 목표 스니펫 (Phase 2 완료 상태)

```javascript
// index.js (목표)
import { createCache } from "./lib/cache-factory.js";

cache = createCache(config);
await cache.load();
```

```javascript
// lib/cache-factory.js (목표)
import { SQLiteCache } from "./sqlite-cache.js";
import { MilvusCache } from "./milvus-cache.js";

export function createCache(config) {
  const provider = (config.vectorStoreProvider || "sqlite").toLowerCase();
  if (provider === "milvus") {
    return new MilvusCache(config);
  }
  return new SQLiteCache(config);
}
```

```javascript
// lib/config.js (목표 핵심)
const DEFAULT_CONFIG = {
  ...
  vectorStoreProvider: "sqlite", // "sqlite" | "milvus"
  milvusAddress: "",
  milvusToken: "",
  milvusDatabase: "default",
  milvusCollection: "smart_coding_embeddings",
  ...
};
```

```javascript
// features/set-workspace.js (목표)
if (clearCache && this.cache) {
  this.cache.setVectorStore([]);
  this.cache.clearAllFileHashes();
}
```

```javascript
// lib/milvus-cache.js (목표 핵심)
async removeFileFromStore(file) {
  await this.client.delete({
    collection_name: this.collectionName,
    filter: `file == "${escapeForMilvus(file)}"`
  });
}

addBatchToStore(chunks) {
  // [{ file, startLine, endLine, content, vector }] -> Milvus schema로 매핑
}
```

### 마일스톤

| 단계 | 목표 | 산출물 |
| --- | --- | --- |
| M2-1 | 캐시 provider 분기 | `cache-factory`, `config` |
| M2-2 | Milvus 저장/삭제/해시 경로 구현 | `milvus-cache` |
| M2-3 | workspace/status 호환성 정리 | `set-workspace`, `get-status` |
| M2-4 | 회귀 테스트 + 스모크 | 테스트 리포트, devlog 업데이트 |

### 세부 TODO (실행 단위)

- [x] `lib/config.js`: `vectorStoreProvider`, `SMART_CODING_VECTOR_STORE_PROVIDER`, `SMART_CODING_MILVUS_*` 파싱 추가
- [x] `lib/cache-factory.js`: `sqlite|milvus` 분기 생성
- [x] `index.js`: `new SQLiteCache(config)` -> `createCache(config)`로 전환
- [x] `lib/milvus-cache.js`: `load/getVectorStore/addBatchToStore/removeFileFromStore/fileHash API/save/saveIncremental/clear/setVectorStore` 구현
- [x] `features/set-workspace.js`: `this.cache.fileHashes = new Map()` 제거
- [x] `features/get-status.js`: 파일 확장자 기반 추론 대신 provider 기반 cache type 보고
- [x] `README.md`: Milvus provider 설정 예시 및 주의사항 추가
- [x] `test/device-detection.test.js`: provider/env 파싱 테스트 확장
- [x] `test/cache-factory.test.js`: provider별 인스턴스 선택 테스트
- [x] `test/milvus-cache-contract.test.js`: SQLite 계약 동일성 테스트
- [x] `devlog/plan.md`: 임베딩 실호출 실측값(model/dim/elapsed) 로그 업데이트

### 검증 체크리스트

| 항목 | 성공 기준 |
| --- | --- |
| 임베딩 호출 | `createGeminiEmbedder().embed()` 단건 호출 성공 |
| 임베딩 배치 | 2건 동시 호출에서 두 벡터 모두 `768d` 반환 |
| 부팅 | `vectorStoreProvider=milvus`에서 서버가 정상 기동 |
| 인덱싱 | `b_index_codebase` 수행 후 chunks/files 수치가 정상 증가 |
| 증분 | 무변경 재인덱싱 시 추가 write가 0 또는 최소 |
| 삭제 반영 | 파일 삭제 후 `removeFileFromStore`로 결과에서 제거 |
| 검색 | `a_semantic_search` 출력 포맷/품질 회귀 없음 |
| 캐시 정리 | `c_clear_cache` 실행 시 Milvus+tracking 모두 초기화 |

### 리스크와 대응

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| `getVectorStore()` 전체 로드 비용 증가 | 대용량에서 검색 지연 | Phase 2는 범위 내 허용, Phase 4(B)에서 ANN 전환 |
| Milvus 연결 설정 불일치 | 부팅 실패 | 시작 시 연결 검증 + 명확한 에러 메시지 |
| Milvus SDK 의존성 추가 필요 | 설치/빌드 불일치 | 의존성 추가 전에 사용자 승인 후 진행 |
| 백엔드 내부구조 접근 코드 잔존 | provider별 버그 | `set-workspace`에서 인터페이스 메서드만 사용 |
| 파일 경로 escaping 오류 | delete 누락 | 공통 escape 유틸 추가 및 단위 테스트 |
| lockfile 불일치 | 반복적인 dirty 상태 | 의존성 변경 시 `package-lock.json` 포함 커밋 |
| Gemini API quota/429 | 인덱싱 지연/실패 | micro-batch 크기 축소 + retry/backoff 로그 확인 |

### 실행 커맨드 예시 (P2-0: Gemini 실호출 기준선)

```bash
cd 700_projects/smart-coding-mcp
node --input-type=module -e 'import { createGeminiEmbedder } from "./lib/gemini-embedder.js";
const embed = createGeminiEmbedder({ verbose: true });
const [a, b] = await Promise.all([embed("phase2 baseline A"), embed("phase2 baseline B")]);
console.log({ model: embed.modelName, dim: a.data.length, dim2: b.data.length });'
```

### 실행 커맨드 예시 (P2-1 ~ P2-5: Milvus A 통합 검증)

```bash
cd 700_projects/smart-coding-mcp
npm install
SMART_CODING_VECTOR_STORE_PROVIDER=milvus \
SMART_CODING_MILVUS_ADDRESS=YOUR_MILVUS_ADDRESS \
SMART_CODING_AUTO_INDEX_DELAY=false \
npm run dev -- --workspace /absolute/path/to/codebase
```

### 의사결정 게이트

| 게이트 | 질문 | 조건 |
| --- | --- | --- |
| G1 | Milvus 연결 방식 확정 | 로컬/서버 중 운영 모드 1개 확정 |
| G2 | 캐시 계약 확정 | `SQLiteCache`와 동일 API 유지 |
| G3 | Phase 2 완료 판정 | 체크리스트 전부 통과 |

## 변경 기록

- 2026-02-14 20:39: `phase2-plan.md` 신규 작성. Milvus A 범위, 캐시 계약, 마일스톤, 검증 기준 고정.
- 2026-02-14 20:42: Phase 2-0(임베딩 미호출) 선행 경로, 세부 TODO, cache factory/config 스니펫, lockfile 정책 추가.
- 2026-02-14 20:43: Google(Gemini) 실호출 성공값(model=`gemini-embedding-001`, 768d, 2건 배치) 기준으로 실행 순서를 재작성.
- 2026-02-14 20:50: P2-1 코드 반영 완료(`config`, `cache-factory`, `index.js`, `set-workspace`, `get-status`) 및 관련 테스트 통과.
- 2026-02-14 20:59: P2-2 MilvusCache 실구현 반영(`@zilliz/milvus2-sdk-node`), 로컬 Milvus에서 load/insert/delete/save 스모크 통과.
- 2026-02-14 21:00: `embeddingProvider=gemini` + `vectorStoreProvider=milvus` 조합 end-to-end 스모크(임베딩 768d, Milvus insert/delete/save) 통과.
- 2026-02-14 21:03: Gemini+Milvus 통합 검증(P2-4) 수행. 임시 워크스페이스 2파일 인덱싱과 semantic search 결과(`auth.js`) 확인.
- 2026-02-14 21:07: P2-5 검증 완료. Gemini embedder 재시도 테스트에 429/네트워크 예외/동시 배치 부하/비재시도(400) 케이스 추가 및 통과.
