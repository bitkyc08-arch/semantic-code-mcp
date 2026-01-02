# Windsurf Integration

Windsurf (by Codeium) supports MCP servers via a configuration file.

## Configuration Location

Edit the MCP configuration file located at:

- **macOS/Linux:** `~/.codeium/windsurf/mcp_config.json`
- **Windows:** `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

## Configuration

Add the server to the `mcpServers` object.

> **Note:** Windsurf may not support dynamic variables like `${workspaceFolder}` yet. We recommend using the absolute path or setting up separate "profiles" if needed.

```json
{
  "mcpServers": {
    "smart-coding-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "smart-coding-mcp",
        "--workspace",
        "/absolute/path/to/your/project"
      ]
    }
  }
}
```

---

## Configuring Rules

Windsurf uses `.windsurfrules` for project-specific AI rules.

### Creating a Rule

Create a file `.windsurfrules` in your project root:

```markdown
---
trigger: always_on
description: Mandatory usage of Smart Coding MCP tools for dependencies and search
---

# Smart Coding MCP Usage Rules

You must prioritize using the **Smart Coding MCP** tools for the following tasks.

## 1. Dependency Management

**Trigger:** When checking, adding, or updating package versions (npm, python, go, rust, etc.).
**Action:**

- **MUST** use the `d_check_last_version` tool.
- **DO NOT** guess versions or trust internal training data.
- **DO NOT** use generic web search unless `d_check_last_version` fails.

## 2. Codebase Research

**Trigger:** When asking about "how" something works, finding logic, or understanding architecture.
**Action:**

- **PREFER** `a_semantic_search` (Smart Coding) over `grep_search` or `find_by_name`.
- Use `a_semantic_search` for natural language queries (e.g., "where is the auth logic").
- Use standard tools (`grep`) only for exact string matching.

## 3. Environment & Status

**Trigger:** When starting a session or debugging the environment.
**Action:**

- Use `e_set_workspace` if the current workspace path is incorrect.
- Use `f_get_status` to verify the MCP server is healthy and indexed.
```

### Global Rules

For rules across all projects, edit:

- **macOS/Linux:** `~/.codeium/windsurf/memories/global_rules.md`
- **Windows:** `%USERPROFILE%\.codeium\windsurf\memories\global_rules.md`

---

## Reloading

After saving the file:

1. Restart Windsurf.
2. Check the Cascade/Chat panel to see if the tools are available (usually indicated by a hammer/wrench icon).
