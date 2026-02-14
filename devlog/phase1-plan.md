# Phase 1 실행 계획: Gemini 임베딩 이식

이 문서는 `smart-coding-mcp` 포크의 Phase 1 작업 범위를 고정하기 위한 구현 계획 문서이다.
Phase 1의 범위는 "검색/저장소 구조를 바꾸지 않고 임베딩 경로만 Gemini로 교체"이다.

## 무엇을 하는 문서인가

이 문서는 코드베이스를 실제로 읽고, 어디를 어떻게 바꿔야 하는지 실행 단위로 정리한다.
목표는 변경 지점을 줄이고, 회귀를 막으면서 Gemini 임베딩 경로를 안정적으로 붙이는 것이다.

## 왜 중요한가

현재 구조는 로컬 모델(MRL/legacy)에 최적화되어 있다.
Gemini로 바꾸면 모델 로딩/추론 방식이 완전히 달라진다.
특히 워커 스레드 경로가 메인 embedder와 분리되어 있어 한쪽만 바꾸면 동작 불일치가 발생한다.
Phase 1에서 이 불일치를 먼저 없애야 Phase 2(A: Milvus 저장소 전환)로 안전하게 넘어갈 수 있다.

## 어떻게 진행하는가

1. 진입점(`index.js`)은 유지하고 `createEmbedder(config)` 분기만 확장한다.
2. 메인 경로(`lib/mrl-embedder.js`)와 워커 경로(`lib/embedding-worker.js`)에 동일한 Gemini 분기를 넣는다.
3. 설정(`lib/config.js`)에 Gemini provider/model/key/env를 추가한다.
4. 배치 전략은 "워커 병렬 과다 사용 금지 + 호출 단위 묶기"로 설계한다.
5. 기존 MCP 도구 계약과 출력 포맷은 유지한다.

---

## 기술 레퍼런스

### 변경 파일 매핑

| 파일 | 변경 유형 | 핵심 변경 |
| --- | --- | --- |
| `lib/gemini-embedder.js` | 신규 | Gemini embedder factory + 배치 호출 + 메타데이터(`modelName`, `dimension`, `device`) |
| `lib/mrl-embedder.js` | 수정 | `createEmbedder`에 `embeddingProvider=gemini` 분기 추가 |
| `lib/embedding-worker.js` | 수정 | workerData 기반 Gemini 초기화 경로 추가 |
| `features/index-codebase.js` | 수정 | workerData에 Gemini 설정 전달, 필요 시 worker 수 제한 |
| `lib/config.js` | 수정 | `SMART_CODING_EMBEDDING_PROVIDER`, `SMART_CODING_GEMINI_API_KEY`, `SMART_CODING_GEMINI_MODEL` 처리 |
| `package.json` | 수정 | Gemini SDK 의존성 추가 |

### 코드베이스 확인 스니펫 (현 상태)

```javascript
// index.js (현재 진입점)
// createEmbedder(config) 결과를 그대로 indexer/search에 주입한다.
embedder = await createEmbedder(config);
cache = new SQLiteCache(config);
indexer = new CodebaseIndexer(embedder, cache, config, server);
hybridSearch = new HybridSearch(embedder, cache, config, indexer);
```

```javascript
// lib/mrl-embedder.js (현재)
export async function createEmbedder(config) {
  const model = config.embeddingModel || 'nomic-ai/nomic-embed-text-v1.5';
  const dimension = config.embeddingDimension || 256;
  const device = config.device || 'cpu';

  if (model.includes('nomic')) {
    return await createMRLEmbedder(model, { dimension, device });
  }
  return await createLegacyEmbedder(model);
}
```

```javascript
// lib/embedding-worker.js (현재)
// worker는 mrl-embedder.js를 import하지 않고 자체 임베딩 초기화를 수행한다.
const modelName = workerData.embeddingModel || 'nomic-ai/nomic-embed-text-v1.5';
const isNomic = modelName.includes('nomic');
if (isNomic) {
  // nomic 경로
} else {
  // legacy 경로
}
```

```javascript
// features/index-codebase.js (현재 workerData 전달)
const worker = new Worker(workerPath, {
  workerData: {
    embeddingModel: this.config.embeddingModel,
    embeddingDimension: this.config.embeddingDimension,
    verbose: this.config.verbose
  }
});
```

```python
# mcp-markdown-rag/server.py (Gemini 레퍼런스)
embedding_fn = OpenAIEmbeddingFunction(
    model_name=os.getenv("EMBEDDING_MODEL", "gemini-embedding-001"),
    api_key=os.getenv("GEMINI_API_KEY"),
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    dimensions=EMBEDDING_DIM,
)
```

### 타깃 스니펫 (Phase 1 완료 상태)

```javascript
// lib/mrl-embedder.js (목표)
export async function createEmbedder(config) {
  const provider = (config.embeddingProvider || "").toLowerCase();
  const model = config.embeddingModel || "nomic-ai/nomic-embed-text-v1.5";
  const dimension = config.embeddingDimension || 256;
  const device = config.device || "cpu";

  if (provider === "gemini" || model.includes("gemini")) {
    const { createGeminiEmbedder } = await import("./gemini-embedder.js");
    return await createGeminiEmbedder(config);
  }

  if (model.includes("nomic")) {
    return await createMRLEmbedder(model, { dimension, device });
  }
  return await createLegacyEmbedder(model);
}
```

```javascript
// features/index-codebase.js (목표)
const worker = new Worker(workerPath, {
  workerData: {
    embeddingProvider: this.config.embeddingProvider,
    embeddingModel: this.config.embeddingModel,
    embeddingDimension: this.config.embeddingDimension,
    geminiApiKey: this.config.geminiApiKey,
    geminiModel: this.config.geminiModel,
    verbose: this.config.verbose
  }
});
```

```javascript
// lib/embedding-worker.js (목표)
if (workerData.embeddingProvider === "gemini") {
  const { createGeminiEmbedder } = await import("./gemini-embedder.js");
  embedder = await createGeminiEmbedder({
    geminiApiKey: workerData.geminiApiKey,
    geminiModel: workerData.geminiModel
  });
  return embedder;
}
```

```javascript
// lib/config.js (목표 env 예시)
if (process.env.SMART_CODING_EMBEDDING_PROVIDER) {
  config.embeddingProvider = process.env.SMART_CODING_EMBEDDING_PROVIDER.trim().toLowerCase();
}
if (process.env.SMART_CODING_GEMINI_API_KEY) {
  config.geminiApiKey = process.env.SMART_CODING_GEMINI_API_KEY.trim();
}
if (process.env.SMART_CODING_GEMINI_MODEL) {
  config.geminiModel = process.env.SMART_CODING_GEMINI_MODEL.trim();
}
```

### 검증 체크리스트 (Phase 1)

| 항목 | 성공 기준 |
| --- | --- |
| 부팅 | `embeddingProvider=gemini`에서 서버가 정상 기동한다 |
| 인덱싱 | `b_index_codebase` 실행 시 에러 없이 완료한다 |
| 검색 | `a_semantic_search`가 정상 결과를 반환한다 |
| 워커 | worker on/off 모두 동일 provider로 동작한다 |
| 회귀 | `embeddingProvider=local`에서 기존 동작이 유지된다 |

### 실행 커맨드 예시

```bash
cd 700_projects/smart-coding-mcp
npm install
SMART_CODING_EMBEDDING_PROVIDER=gemini SMART_CODING_GEMINI_API_KEY=YOUR_KEY SMART_CODING_GEMINI_MODEL=text-embedding-004 npm run dev -- --workspace /absolute/path/to/codebase
```

### Dev Log 기록 규칙

```text
YYYY-MM-DD HH:mm | phase | file | change | result | next
```

초기 기록:

- 2026-02-14 20:00 | phase1-plan | `devlog/phase1-plan.md` | 코드베이스 검토 기반 계획 문서 생성 | Phase 1 범위/스니펫/검증 기준 고정 | 구현 브랜치 작업 시작

## 변경 기록

- 2026-02-14: `phase1-plan.md` 신규 작성. 코드베이스 검토 스니펫과 Phase 1 검증 기준 추가.
- 2026-02-14 20:34 | phase1 | 구현 완료
  - `lib/gemini-embedder.js` 신규 추가 (micro-batch + retry + OpenAI-compatible Gemini endpoint)
  - `lib/mrl-embedder.js`에 `embeddingProvider=gemini` 분기 추가
  - `lib/embedding-worker.js`에 Gemini 분기 및 공통 embedder 재사용
  - `features/index-codebase.js` workerData에 Gemini 설정 전달 + Gemini safe mode(단일 스레드)
  - `lib/config.js`에 `SMART_CODING_EMBEDDING_PROVIDER`, `SMART_CODING_GEMINI_*` env 처리 추가
  - `features/get-status.js`에 provider-aware model metadata 추가
  - `README.md`, `config.json` 업데이트
  - 검증: `vitest` 6 files / 154 tests 통과, `SMART_CODING_EMBEDDING_PROVIDER=gemini` 서버 부팅 스모크 통과
