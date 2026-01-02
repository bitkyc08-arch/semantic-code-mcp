# Raycast Integration

Raycast can use MCP servers to provide AI tools directly in your launcher.

## Prerequisites

1. **Raycast Pro**: You need a subscription to access Raycast AI.
2. **MCP Extension**: Install the [MCP extension](https://www.raycast.com/extensions/mcp) from the Raycast Store.

## Configuration

1. **Open Raycast Settings**

   - Open Raycast (`Cmd+Space`).
   - Type "Extensions" and press Enter.
   - Find "Model Context Protocol".

2. **Edit Configuration**

   - Click on the extension settings.
   - Find the **Config File Path**. It usually defaults to `~/.config/raycast/mcp.json` or similar.
   - Open that file.

3. **Add Server**

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

4. **Using Tools**
   - Open Raycast AI Chat.
   - The tools (like `d_check_last_version` or `a_semantic_search`) will effectively be available to the AI model.
   - You can ask: "Check the latest version of React" or "Search my code for auth logic".

---

## Configuring Rules (AI Commands & Presets)

Raycast uses **AI Commands** and **Presets** for custom instructions.

### Creating an AI Preset

1. Open Raycast and search for **"Preferences"**
2. Navigate to **"Manage AI Presets"** → **"Create Preset"**
3. Configure:

   - **Name:** `Smart Coding`
   - **System Instructions:**

     ```
     # Smart Coding MCP Usage Rules

     You must prioritize using the **Smart Coding MCP** tools for the following tasks.

     ## 1. Dependency Management
     - **MUST** use the `d_check_last_version` tool for package versions.
     - **DO NOT** guess versions or trust internal training data.
     - **DO NOT** use generic web search unless `d_check_last_version` fails.

     ## 2. Codebase Research
     - **PREFER** `a_semantic_search` over `grep_search` or `find_by_name`.
     - Use `a_semantic_search` for natural language queries (e.g., "where is the auth logic").
     - Use standard tools (`grep`) only for exact string matching.

     ## 3. Environment & Status
     - Use `e_set_workspace` if the current workspace path is incorrect.
     - Use `f_get_status` to verify the MCP server is healthy and indexed.
     ```

4. Set as default if desired

### Creating Custom AI Commands

1. Search for **"Create AI Command"** in Raycast
2. Configure:
   - **Title:** `Check Package Version`
   - **Prompt:** `Use d_check_last_version to get the latest version of {argument name="package"}`
3. Assign a hotkey for quick access
