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

- [ ] `lib/gemini-embedder.js` 작성
- [ ] `lib/mrl-embedder.js`에 `embeddingProvider=gemini` 분기
- [ ] `lib/embedding-worker.js`에 동일 분기 추가
- [ ] `package.json` 의존성 추가
- [ ] `lib/config.js` env 키 추가

### Milvus A

- [ ] `lib/milvus-cache.js` 작성
- [ ] `index.js`에서 `SQLiteCache|MilvusCache` 분기
- [ ] `features/index-codebase.js`에서 `getVectorStore()` 의존 최소화
- [ ] `features/get-status.js`에서 통계 수집 방식 정리

### 검증

- [ ] index/search/clear smoke test
- [ ] 증분 인덱싱 회귀 테스트
- [ ] 결과 포맷 호환성 확인

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
