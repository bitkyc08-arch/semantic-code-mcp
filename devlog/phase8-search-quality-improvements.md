# Phase 8: Search Quality Improvements

**날짜**: 2026-02-15
**목표**: 테스트 파일 제외 + 워크스페이스 설정 개선으로 검색 노이즈 제거

---

## 배경

`smart-coding-mcp`가 `*.test.js`, `test/` 디렉토리 파일을 인덱싱하여 검색 결과에 테스트 코드가 실제 구현 코드보다 높은 관련도로 등장.
특히 `test/embedding-model.test.js` 같은 파일이 `describe`, `expect` 같은 키워드 밀도가 높아 시맨틱 검색에서 오탐 발생.

---

## 변경 사항

### 1. 테스트 패턴 추가 (`ignore-patterns.js`)

`IGNORE_PATTERNS.common` 섹션에 12개 테스트 패턴 추가:

```javascript
// Test files & directories (reduce search noise)
'**/test/**',
'**/tests/**',
'**/__tests__/**',
'**/*.test.js',
'**/*.test.ts',
'**/*.test.jsx',
'**/*.test.tsx',
'**/*.spec.js',
'**/*.spec.ts',
'**/*.test.py',
'**/test_*.py',
'**/*_test.go',
```

### 2. `loadConfig()` 패턴 적용 버그 수정 (`config.js`)

**문제**: `smartPatterns` (= `IGNORE_PATTERNS.common` 포함)가 `detectedTypes.length > 0` 조건 안에서만 적용됨.
`new/` 루트처럼 프로젝트 마커(`package.json`, `pyproject.toml`)가 없는 디렉토리에서는 `common` 패턴이 아예 빠짐.

**수정 전**:
```javascript
if (detectedTypes.length > 0) {
  const smartPatterns = detector.getSmartIgnorePatterns();
  config.excludePatterns = [...smartPatterns, ...userPatterns];
  // ...
} else {
  console.error("[Config] No project markers detected, using default patterns");
}
```

**수정 후**:
```javascript
const smartPatterns = detector.getSmartIgnorePatterns();
config.excludePatterns = [...DEFAULT_CONFIG.excludePatterns, ...smartPatterns];
config.excludePatterns = [...new Set(config.excludePatterns)]; // 중복 제거

if (detectedTypes.length > 0) {
  console.error(`[Config] Smart indexing: ${detectedTypes.join(', ')}`);
} else {
  console.error("[Config] No project markers detected, applying common smart patterns");
}
console.error(`[Config] Applied ${smartPatterns.length} smart ignore patterns`);
```

### 3. `discoverFiles()` 파일명 패턴 필터 추가 (`index-codebase.js`)

**문제**: `fdir`의 `.exclude()` 콜백은 디렉토리명만 체크. `**/*.test.js` 같은 파일명 패턴은 무시됨.

**수정**: glob 패턴에서 파일명 패턴을 regex로 변환하여 `fdir.filter()` 안에서 적용:

```javascript
// Extract file-level glob patterns like **/*.test.js, **/test_*.py
const fileMatch = pattern.match(/\*\*\/(\*[^/]+|[^/*]+\*[^/]*)$/);
if (fileMatch) {
  const glob = fileMatch[1];
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  excludeFilePatterns.push(new RegExp(`^${escaped}$`));
}
```

### 4. `fdir.exclude()` basename 방어 (`index-codebase.js`)

**문제**: `fdir.exclude((dirName) => ...)` 의 `dirName`이 basename이 아니라 전체/상대 경로로 전달되는 경우 `excludeDirs.has(dirName)` 실패.

**수정**: `isExcludedDirectory()` 함수로 교체:

```javascript
const isExcludedDirectory = (dirName) => {
  const normalized = dirName.replace(/[\\/]+$/g, "");
  if (excludeDirs.has(normalized)) return true;

  const segments = normalized.split(/[\\/]+/);
  if (segments.some((seg) => excludeDirs.has(seg))) return true;

  if (excludeDirs.has(path.basename(normalized))) return true;

  return false;
};
```

### 5. 시작 스크립트 워크스페이스 수정 (`start-smart-coding-mcp.sh`)

**문제**: `--workspace "$SMART_CODING_ROOT"` → `smart-coding-mcp/` 자체만 스캔. 다른 프로젝트 코드 미포함.

**수정**:
```bash
# Before
exec node "$SMART_CODING_ROOT/index.js" --workspace "$SMART_CODING_ROOT"

# After
exec node "$SMART_CODING_ROOT/index.js" --workspace '/Users/jun/Developer/new'
```

---

## 검증

| 메트릭         | 수정 전          | 수정 후     |
| -------------- | ---------------- | ----------- |
| totalFiles     | 123              | **100**     |
| testLike 파일  | 23               | **0**       |
| 검색 상위 결과 | `*.test.js` 출현 | 구현 코드만 |

### 100 vs 84 차이

`fd`로 `js/ts/py/jsx/tsx` 5개 확장자만 검색하면 84개이지만, `smart-coding-mcp`는 `.sh`, `.css`, `.toml`, `.yaml` 등 수십 개 확장자를 지원.
나머지 16개는 `sujong1`, `markdown-fastrag-mcp`, `.claude/.codex/.gemini` 설정, `001_ai-agents`, `300_permanent` 등 vault 전체에서 발견되는 비-테스트 코드 파일.

---

## 수정 파일 목록

| 파일                                     | 변경 내용                                   |
| ---------------------------------------- | ------------------------------------------- |
| `lib/ignore-patterns.js`                 | 12개 테스트 패턴 추가                       |
| `lib/config.js`                          | `smartPatterns` 항상 적용                   |
| `features/index-codebase.js`             | 파일명 regex 필터 + `isExcludedDirectory()` |
| `~/.codex/bin/start-smart-coding-mcp.sh` | `--workspace` → `new/` 전체                 |
