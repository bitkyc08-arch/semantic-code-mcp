# reindex.js: Shell 직접 실행 리인덱싱 스크립트

**Date**: 2026-02-15
**Status**: Complete

## 배경

MCP `b_index_codebase` 도구의 한계:
- AI가 실시간 로그를 볼 수 없음 (MCP는 최종 JSON만 반환)
- 대량 인덱싱 시 타임아웃 위험
- 에러 디버깅 어려움

→ markdown-rag의 `reindex.py`와 동일하게 shell 직접 실행 스크립트 작성

## 사용법

```bash
cd smart-coding-mcp

# 전체 재인덱싱
node reindex.js /path/to/workspace --force

# 증분 (변경 파일만)
node reindex.js /path/to/workspace

# 환경 변수 오버라이드
SMART_CODING_GEMINI_BATCH_SIZE=100 \
SMART_CODING_GEMINI_MAX_CONCURRENT_BATCHES=3 \
node reindex.js /path/to/workspace --force
```

## MCP 설정 변경 (전 에이전트 동기화)

| 설정                                         | Before | After    | 파일     |
| -------------------------------------------- | ------ | -------- | -------- |
| `SMART_CODING_GEMINI_BATCH_SIZE`             | 96     | **100**  | 4개 전부 |
| `SMART_CODING_GEMINI_MAX_CONCURRENT_BATCHES` | 50     | **3**    | 4개 전부 |
| `MARKDOWN_CHUNK_SIZE`                        | 2048   | **5000** | 4개 전부 |

대상 파일:
- `~/.gemini/antigravity/mcp_config.json`
- `~/.codex/config.toml`
- `~/Library/Application Support/Code/User/mcp.json`
- `~/.claude/settings.local.json`

## 변경 파일

- `reindex.js` — 신규 (smart-coding-mcp)
- `reindex.py` — 기존 (mcp-markdown-rag)
