# Phase 6: Fix Submodule File Indexing

## Date: 2025-02-15

## Problem
Only **22 of 59** sujong1 submodule files were being indexed. The entire `core/` directory (37 files including all pipelines, config, shared modules) was silently excluded.

## Root Cause

### 1. `**/core` Pattern in `ignore-patterns.js`
Line 268 had the pattern `**/core` intended for Unix core dump files. However, the `discoverFiles()` regex extracted `core` as a **directory name** to exclude via fdir, blocking all `core/` directories project-wide.

### 2. `setWorkspace()` Config Persistence Bug
When switching workspaces via `e_set_workspace`, only `searchDirectory` and `cacheDirectory` were updated. The `excludePatterns` and `fileExtensions` from the **original startup workspace** persisted because `loadConfig()` was never re-run. This meant stale smart-indexing patterns (including `**/core` from `IGNORE_PATTERNS.common`) carried over to new workspaces.

## Changes

### `lib/ignore-patterns.js`
- Removed `**/core` pattern (line 268)
- `**/*.core` already covers `.core` extension files

### `features/set-workspace.js`
- Added `import { loadConfig }` 
- `setWorkspace()` now calls `loadConfig(newPath)` to rebuild excludePatterns for the new workspace
- Runtime overrides (API keys, embedding provider, Milvus config, etc.) are preserved across workspace switches

## Result
- **84 → 120 files** indexed (+36 from `sujong1/core/`)
- **376 → 539 chunks** (+163)
- Semantic search now returns `core/blog/content_writer.py`, `core/ichoo/manager.py`, `core/shared/chrome_manager.py` etc.
