# Antigravity (Gemini IDE) Integration

Antigravity is Google's AI-powered IDE built on VS Code with deep Gemini integration.

## MCP Configuration

Edit your MCP config file:

- **macOS:** `~/.gemini/antigravity/mcp_config.json`
- **Windows:** `%USERPROFILE%\.gemini\antigravity\mcp_config.json`

```json
{
  "mcpServers": {
    "smart-coding-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "smart-coding-mcp",
        "--workspace",
        "/absolute/path/to/project"
      ]
    }
  }
}
```

> **Note:** Antigravity does **NOT** support `${workspaceFolder}`. You must use absolute paths.

---

## Configuring Agent Rules

Antigravity supports powerful agent rules to control AI behavior.

### Rule Locations

| Scope               | Location                                  |
| ------------------- | ----------------------------------------- |
| **Global**          | `~/.gemini/GEMINI.md`                     |
| **Workspace**       | `.agent/rules/*.md`                       |
| **Project Context** | `GEMINI.md` or `AGENT.md` at project root |

### Creating a Rule to Use Smart Coding MCP

1. **Create the rules directory** in your project:

   ```bash
   mkdir -p .agent/rules
   ```

2. **Create a rule file** `.agent/rules/smart-mcp.md`:

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

### Activation Modes

| Mode             | Description                        |
| ---------------- | ---------------------------------- |
| `always_on`      | Rule is always applied             |
| `manual`         | Activated when mentioned in prompt |
| `model_decision` | AI decides based on description    |
| `glob`           | Applied to matching file patterns  |

### Global Rules

For rules that apply to all projects, edit `~/.gemini/GEMINI.md`:

```markdown
# Global Agent Rules

- Always verify package versions before installing
- Prefer semantic search when available
```
