# Semantic Code MCP

[![npm version](https://img.shields.io/npm/v/semantic-code-mcp.svg)](https://www.npmjs.com/package/semantic-code-mcp)
[![npm downloads](https://img.shields.io/npm/dm/semantic-code-mcp.svg)](https://www.npmjs.com/package/semantic-code-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

AI-powered semantic code search for coding agents. An MCP server that indexes your codebase with vector embeddings so AI assistants can find code by **meaning**, not just keywords.

> Ask *"where do we handle authentication?"* and find code that uses `login`, `session`, `verifyCredentials` — even when no file contains the word "authentication."

## Why

Traditional `grep` and keyword search break down when you don't know the exact terms used in the codebase. Semantic search bridges that gap:

- **Concept matching** — `"error handling"` finds `try/catch`, `onRejected`, `fallback` patterns
- **Typo-tolerant** — `"embeding modle"` still finds embedding model code
- **Context-aware chunking** — AST-based (Tree-sitter) or smart regex splitting preserves code structure
- **Fast** — progressive indexing lets you search while the codebase is still being indexed

Based on [Cursor's research](https://cursor.com/blog/semsearch) showing semantic search improves AI agent performance by 12.5%.

## Quick Start

```bash
npx -y semantic-code-mcp@latest --workspace /path/to/your/project
```

Recommended MCP config (portable, no local script dependency):

```json
{
  "mcpServers": {
    "semantic-code-mcp": {
      "command": "npx",
      "args": ["-y", "semantic-code-mcp@latest", "--workspace", "/path/to/your/project"]
    }
  }
}
```

Do not use machine-specific script paths such as `~/.codex/bin/start-smart-coding-mcp.sh` in shared documentation.

That's it. Your AI assistant now has semantic code search.

## Features

### Multi-Provider Embeddings

| Provider              | Model                   | Privacy    | Speed         |
| --------------------- | ----------------------- | ---------- | ------------- |
| **Local** (default)   | nomic-embed-text-v1.5   | 100% local | ~50ms/chunk   |
| **Gemini**            | gemini-embedding-001    | API call   | Fast, batched |
| **OpenAI**            | text-embedding-3-small  | API call   | Fast          |
| **OpenAI-compatible** | Any compatible endpoint | Varies     | Varies        |
| **Vertex AI**         | Google Cloud models     | GCP        | Fast          |

### Flexible Vector Storage

- **SQLite** (default) — zero-config, single-file `.smart-coding-cache/embeddings.db`
- **Milvus** — scalable ANN search for large codebases or shared team indexes

### Smart Code Chunking

Three modes to match your codebase:

- **`smart`** (default) — regex-based, language-aware splitting
- **`ast`** — Tree-sitter parsing for precise function/class boundaries
- **`line`** — simple fixed-size line chunks

### Resource Throttling

CPU capped at 50% during indexing. Your machine stays responsive.

## Tools

| Tool                   | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `a_semantic_search`    | Find code by meaning. Hybrid semantic + exact match scoring. |
| `b_index_codebase`     | Trigger manual reindex (normally automatic & incremental).   |
| `c_clear_cache`        | Reset embeddings cache entirely.                             |
| `d_check_last_version` | Look up latest package version from 20+ registries.          |
| `e_set_workspace`      | Switch project at runtime without restart.                   |
| `f_get_status`         | Server health: version, index progress, config.              |

## IDE Setup

| IDE / App          | Guide                                     | `${workspaceFolder}` |
| ------------------ | ----------------------------------------- | -------------------- |
| **VS Code**        | [Setup](docs/ide-setup/vscode.md)         | ✅                    |
| **Cursor**         | [Setup](docs/ide-setup/cursor.md)         | ✅                    |
| **Windsurf**       | [Setup](docs/ide-setup/windsurf.md)       | ❌                    |
| **Claude Desktop** | [Setup](docs/ide-setup/claude-desktop.md) | ❌                    |
| **OpenCode**       | [Setup](docs/ide-setup/opencode.md)       | ❌                    |
| **Raycast**        | [Setup](docs/ide-setup/raycast.md)        | ❌                    |
| **Antigravity**    | [Setup](docs/ide-setup/antigravity.md)    | ❌                    |

### Multi-Project

```json
{
  "mcpServers": {
    "code-frontend": {
      "command": "npx",
      "args": ["-y", "semantic-code-mcp@latest", "--workspace", "/path/to/frontend"]
    },
    "code-backend": {
      "command": "npx",
      "args": ["-y", "semantic-code-mcp@latest", "--workspace", "/path/to/backend"]
    }
  }
}
```

## Configuration

All settings via environment variables. Prefix: `SMART_CODING_`.

### Core

| Variable                        | Default   | Description                 |
| ------------------------------- | --------- | --------------------------- |
| `SMART_CODING_VERBOSE`          | `false`   | Detailed logging            |
| `SMART_CODING_MAX_RESULTS`      | `5`       | Search results returned     |
| `SMART_CODING_BATCH_SIZE`       | `100`     | Files per parallel batch    |
| `SMART_CODING_MAX_FILE_SIZE`    | `1048576` | Max file size (1MB)         |
| `SMART_CODING_CHUNK_SIZE`       | `25`      | Lines per chunk             |
| `SMART_CODING_CHUNKING_MODE`    | `smart`   | `smart` / `ast` / `line`    |
| `SMART_CODING_WATCH_FILES`      | `false`   | Auto-reindex on changes     |
| `SMART_CODING_AUTO_INDEX_DELAY` | `5000`    | Background index delay (ms) |
| `SMART_CODING_MAX_CPU_PERCENT`  | `50`      | CPU cap during indexing     |

### Embedding Provider

| Variable                           | Default                          | Description                                                    |
| ---------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| `SMART_CODING_EMBEDDING_PROVIDER`  | `local`                          | `local` / `gemini` / `openai` / `openai-compatible` / `vertex` |
| `SMART_CODING_EMBEDDING_MODEL`     | `nomic-ai/nomic-embed-text-v1.5` | Model name                                                     |
| `SMART_CODING_EMBEDDING_DIMENSION` | `128`                            | MRL dimension (64–768)                                         |
| `SMART_CODING_DEVICE`              | `auto`                           | `cpu` / `webgpu` / `auto`                                      |

### Gemini

| Variable                          | Default                | Description       |
| --------------------------------- | ---------------------- | ----------------- |
| `SMART_CODING_GEMINI_API_KEY`     | —                      | API key           |
| `SMART_CODING_GEMINI_MODEL`       | `gemini-embedding-001` | Model             |
| `SMART_CODING_GEMINI_DIMENSIONS`  | `768`                  | Output dimensions |
| `SMART_CODING_GEMINI_BATCH_SIZE`  | `24`                   | Micro-batch size  |
| `SMART_CODING_GEMINI_MAX_RETRIES` | `3`                    | Retry count       |

### OpenAI / Compatible

| Variable                          | Default | Description                |
| --------------------------------- | ------- | -------------------------- |
| `SMART_CODING_EMBEDDING_API_KEY`  | —       | API key                    |
| `SMART_CODING_EMBEDDING_BASE_URL` | —       | Base URL (compatible only) |

### Vertex AI

| Variable                       | Default       | Description    |
| ------------------------------ | ------------- | -------------- |
| `SMART_CODING_VERTEX_PROJECT`  | —             | GCP project ID |
| `SMART_CODING_VERTEX_LOCATION` | `us-central1` | Region         |

### Vector Store

| Variable                             | Default                   | Description         |
| ------------------------------------ | ------------------------- | ------------------- |
| `SMART_CODING_VECTOR_STORE_PROVIDER` | `sqlite`                  | `sqlite` / `milvus` |
| `SMART_CODING_MILVUS_ADDRESS`        | —                         | Milvus endpoint     |
| `SMART_CODING_MILVUS_TOKEN`          | —                         | Auth token          |
| `SMART_CODING_MILVUS_DATABASE`       | `default`                 | Database name       |
| `SMART_CODING_MILVUS_COLLECTION`     | `smart_coding_embeddings` | Collection          |

### Search Tuning

| Variable                         | Default | Description              |
| -------------------------------- | ------- | ------------------------ |
| `SMART_CODING_SEMANTIC_WEIGHT`   | `0.7`   | Semantic vs exact weight |
| `SMART_CODING_EXACT_MATCH_BOOST` | `1.5`   | Exact match multiplier   |

### Example with Gemini + Milvus

```json
{
  "mcpServers": {
    "semantic-code-mcp": {
      "command": "npx",
      "args": ["-y", "semantic-code-mcp@latest", "--workspace", "/path/to/project"],
      "env": {
        "SMART_CODING_EMBEDDING_PROVIDER": "gemini",
        "SMART_CODING_GEMINI_API_KEY": "YOUR_KEY",
        "SMART_CODING_VECTOR_STORE_PROVIDER": "milvus",
        "SMART_CODING_MILVUS_ADDRESS": "http://localhost:19530"
      }
    }
  }
}
```

## Architecture

```mermaid
graph TB
    subgraph MCP["MCP Server (index.js)"]
        direction TB
        CFG["config.js<br/>Configuration"]
    end

    subgraph Features
        SEARCH["hybrid-search.js<br/>Semantic + Exact Match"]
        INDEX["index-codebase.js<br/>File Discovery & Indexing"]
        STATUS["get-status.js<br/>Server Health"]
        WORKSPACE["set-workspace.js<br/>Runtime Switching"]
        VERSION["check-last-version.js<br/>Registry Lookup"]
        CLEAR["clear-cache.js<br/>Cache Reset"]
    end

    subgraph Embeddings["Embedding Providers"]
        LOCAL["mrl-embedder.js<br/>nomic-embed-text v1.5"]
        GEMINI["gemini-embedder.js<br/>Gemini / Vertex AI"]
        OAI["OpenAI / Compatible"]
    end

    subgraph Storage["Vector Storage"]
        SQLITE["cache.js<br/>SQLite (default)"]
        MILVUS["milvus-cache.js<br/>Milvus ANN"]
        FACTORY["cache-factory.js<br/>Provider Selection"]
    end

    subgraph Chunking["Code Chunking"]
        AST["ast-chunker.js<br/>Tree-sitter AST"]
        SMART["utils.js<br/>Smart Regex"]
    end

    MCP --> Features
    INDEX --> Chunking --> Embeddings --> FACTORY
    FACTORY --> SQLITE
    FACTORY --> MILVUS
    SEARCH --> Embeddings
    SEARCH --> FACTORY
```

## How It Works

```mermaid
flowchart LR
    A["📁 Source Files"] -->|glob + .gitignore| B["✂️ Smart/AST\nChunking"]
    B -->|language-aware| C["🧠 AI Embedding\n(Local or API)"]
    C -->|vectors| D["💾 SQLite / Milvus\nStorage"]
    D -->|incremental hash| D

    E["🔍 Search Query"] -->|embed| C
    C -->|cosine similarity| F["📊 Hybrid Scoring\nsemantic + exact match"]
    F --> G["🎯 Top N Results\nwith relevance scores"]

    style A fill:#2d3748,color:#e2e8f0
    style C fill:#553c9a,color:#e9d8fd
    style D fill:#2a4365,color:#bee3f8
    style G fill:#22543d,color:#c6f6d5
```

**Progressive indexing** — search works immediately while indexing continues in the background. Only changed files are re-indexed on subsequent runs.

## Privacy

- **Local mode**: everything runs on your machine. Code never leaves your system.
- **API mode**: code chunks are sent to the embedding API for vectorization. No telemetry beyond provider API calls.

## License

MIT License

Copyright (c) 2025 Omar Haris (original), bitkyc08 (modifications, 2026)

See [LICENSE](LICENSE) for full text.

### About

This project is a fork of [smart-coding-mcp](https://github.com/omarHaris/smart-coding-mcp) by Omar Haris, heavily extended for production use.

**Key additions over upstream**:
- Multi-provider embeddings (Gemini, Vertex AI, OpenAI, OpenAI-compatible)
- Milvus vector store with ANN search for large codebases
- AST-based code chunking via Tree-sitter
- Resource throttling (CPU cap at 50%)
- Runtime workspace switching (`e_set_workspace`)
- Package version checker across 20+ registries (`d_check_last_version`)
- Comprehensive IDE setup guides (VS Code, Cursor, Windsurf, Claude Desktop, Antigravity)
