# Claude Desktop Integration

The official Claude Desktop app is the reference implementation for MCP.

## Configuration Location

Edit the configuration file located at:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

## Configuration

Open the file in any text editor (VS Code, TextEdit, Notepad) and add the server:

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

> **Important:** Claude Desktop does **NOT** support `${workspaceFolder}`. You must provide the absolute path to the directory you want to index.

---

## Configuring Rules (Project Instructions)

Claude Desktop uses **Projects** with custom instructions.

### Creating Project Instructions

1. **Create a new Project** in Claude Desktop
2. Click **"Set project instructions"**
3. Add your guidelines:

   ```
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

4. Click **"Save instructions"**

These instructions apply to all chats within that project.

---

## Verification

1. Restart Claude Desktop.
2. Look for the plug icon 🔌 in the top right of the chat interface.
3. Click it to see the list of connected servers. You should see `smart-coding-mcp` with status "Connected".
