# OpenCode Integration

OpenCode is a powerful AI coding agent built for the terminal by SST.

## Configuration Location

Edit the configuration file located at:

- **Global:** `~/.config/opencode/opencode.json`
- **Project:** `opencode.json` in your project root

## MCP Configuration

Add the server to the `mcp` object in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "smart-coding-mcp": {
      "type": "local",
      "command": ["npx", "-y", "smart-coding-mcp", "--workspace", "/absolute/path/to/your/project"],
      "enabled": true
    }
  }
}
```

### With Environment Variables

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "smart-coding-mcp": {
      "type": "local",
      "command": ["npx", "-y", "smart-coding-mcp", "--workspace", "/path/to/project"],
      "environment": {
        "SMART_CODING_VERBOSE": "true",
        "SMART_CODING_MAX_RESULTS": "10"
      },
      "enabled": true
    }
  }
}
```

> **Note:** OpenCode does **NOT** support `${workspaceFolder}`. You must use absolute paths.

---

## Configuring Rules (AGENTS.md)

OpenCode uses `AGENTS.md` files for custom instructions, similar to `CLAUDE.md` or Cursor's rules.

### Rule Locations

| Scope       | Location                          |
| ----------- | --------------------------------- |
| **Global**  | `~/.config/opencode/AGENTS.md`    |
| **Project** | `AGENTS.md` in project root       |

### Creating a Rule

1. **Create an `AGENTS.md` file** in your project root:

   ```markdown
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

   - **MUST** use `a_semantic_search` as the FIRST tool for any codebase research
   - **DO NOT** use `Glob` or `Grep` for exploratory searches
   - Use `Grep` ONLY for exact literal string matching (e.g., finding a specific error message)
   - Use `Glob` ONLY when you already know the exact filename pattern

   ## 3. Environment & Status

   **Trigger:** When starting a session or debugging the environment.
   **Action:**

   - Use `e_set_workspace` if the current workspace path is incorrect.
   - Use `f_get_status` to verify the MCP server is healthy and indexed.
   ```

### Alternative: Using opencode.json Instructions Field

You can reference external instruction files using glob patterns:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    "AGENTS.md",
    "docs/guidelines.md",
    ".cursor/rules/*.md"
  ],
  "mcp": {
    "smart-coding-mcp": {
      "type": "local",
      "command": ["npx", "-y", "smart-coding-mcp", "--workspace", "/path/to/project"],
      "enabled": true
    }
  }
}
```

### Global Rules

For rules that apply to all projects, edit `~/.config/opencode/AGENTS.md`:

```markdown
# Global Agent Rules

- Always verify package versions before installing using `d_check_last_version`
- Prefer semantic search (`a_semantic_search`) when available
- Check MCP server status with `f_get_status` at session start
```

---

## MCP Management Commands

OpenCode provides CLI commands for managing MCP servers:

```bash
# List all configured MCP servers
opencode mcp list

# Authenticate with a server (if required)
opencode mcp auth smart-coding-mcp

# Remove credentials
opencode mcp logout smart-coding-mcp
```

---

## Verification

1. Start OpenCode in your project directory.
2. Run `opencode mcp list` to verify the server is connected.
3. Ask the AI: "Check the status of the smart coding MCP server" - it should use `f_get_status`.
