# VS Code Integration

To use Smart Coding MCP in VS Code, you typically need an MCP-compatible extension like **Cline** (formerly Roo Code) or the official **Model Context Protocol** extension.

## Using Cline (Roo Code)

Cline is an autonomous coding agent extension for VS Code that supports MCP natively.

1. **Install the Extension**

   - Search for "Cline" in the VS Code Marketplace and install it.

2. **Open MCP Settings**

   - Click the **MCP Servers** icon in the Cline sidebar (or open Settings).
   - Click "Edit MCP Settings" to open the configuration file.

3. **Add Configuration**
   Add the `smart-coding-mcp` entry to the `mcpServers` object:

   ```json
   {
     "mcpServers": {
       "smart-coding-mcp": {
         "command": "npx",
         "args": ["-y", "smart-coding-mcp", "--workspace", "${workspaceFolder}"]
       }
     }
   }
   ```

   > **Note:** Cline supports the `${workspaceFolder}` variable, so the server will automatically index whichever project you currently have open.

## Using Official MCP Extension

1. **Install the Extension**

   - Install the "Model Context Protocol" extension from the VS Code Marketplace.

2. **Configure Settings**

   - Open VS Code Settings (`Cmd+,`).
   - Search for "MCP".
   - Edit the `configuration.json` equivalent.

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

---

## Configuring Rules (Cline)

Cline uses `.clinerules` files to control AI behavior.

### Creating a Rule

1. **Create a file** `.clinerules` or `.clinerules.md` in your project root:

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

2. **Or use a folder** `.clinerules/` with multiple files:
   ```
   .clinerules/
   ├── 01-smart-mcp.md
   └── 02-coding-style.md
   ```

Rules are version-controlled and automatically loaded by Cline.
