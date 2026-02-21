# Phase 13: Cache Directory Rename (.smart-coding-cache → .semantic-code-cache)

> **Status**: ✅ Complete
> **Date**: 2026-02-21
> **Priority**: Low (naming consistency)
> **Difficulty**: MLB 30 (Routine)
> **Prereq**: None

---

## 배경

프로젝트가 `smart-coding-mcp`에서 `semantic-code-mcp`로 이름이 바뀌었지만, 캐시 디렉토리는 원 프로젝트의 `.smart-coding-cache` 이름을 그대로 사용하고 있었다. 실제로 워크스페이스에 레거시 `.semantic-code-cache` 폴더(Milvus 전환 전 SQLite 사용 시절)와 현행 `.smart-coding-cache` 폴더가 공존하여 혼란을 유발했다.

프로젝트 이름과 캐시 디렉토리 이름을 일치시켜 직관성을 높이고, 레거시 폴더와의 혼동을 제거한다.

## 변경 사항

### `lib/config.js`

- `DEFAULT_CONFIG.excludePatterns`: `"**/.smart-coding-cache/**"` → `"**/.semantic-code-cache/**"`
- `DEFAULT_CONFIG.cacheDirectory`: `"./.smart-coding-cache"` → `"./.semantic-code-cache"`
- `loadConfig()`: `path.join(baseDir, ".smart-coding-cache")` → `".semantic-code-cache"`

### `config.json`

- `excludePatterns`, `cacheDirectory` 모두 변경

### `features/set-workspace.js`

- 워크스페이스 전환 시 캐시 디렉토리 경로 변경

### `features/index-codebase.js`

- `discoverFiles()` 내 캐시 디렉토리 하드코딩 제외 경로 변경

### `scripts/clear-cache.js`

- 기본 캐시 경로 변경

### `docs/milvus-setup.md`

- SQLite 경로 예시 변경

### 테스트

- `cache-factory.test.js`, `get-status.test.js`, `index-codebase.test.js` — 테스트 픽스처의 캐시 경로 변경

## 마이그레이션

기존 사용자는 캐시 폴더를 수동 리네임하거나, 서버 재시작 시 새 디렉토리가 자동 생성되며 증분 인덱싱이 실행된다:

```bash
mv .smart-coding-cache .semantic-code-cache
```

## 운영

- 인덱스 재구성 불필요 (폴더 리네임만으로 전환)
- 서버 재시작만으로 적용
- 총 8개 파일, 13곳 변경
