# Cursor (Cascade) Integration

Cursor's "Cascade" agent natively supports MCP servers.

## Configuration Steps

1. **Open Settings**

   - Press `Cmd+K` or click the gear icon to open **Cursor Settings**.
   - Navigate to **Features** > **MCP**.

2. **Add New Server**

   - Click the **+ Add New MCP Server** button.

3. **Enter Details**

   - **Name:** `smart-coding-mcp`
   - **Type:** `command`
   - **Command:** `npx -y smart-coding-mcp --workspace ${workspaceFolder}`

   > **Important:** The `${workspaceFolder}` variable allows Smart Coding MCP to dynamically index the project you are currently working on.

4. **Verify Connection**
   - Cursor should show a green "Connected" status.
   - You can now use tools like `semantic_search` in your Composer (`Cmd+I`) or Chat (`Cmd+L`) windows.

---

## Configuring Rules

Cursor uses `.cursor/rules/` for project-specific AI rules.

### Creating a Rule

1. **Create the rules directory**:

   ```bash
   mkdir -p .cursor/rules
   ```

2. **Create a rule file** `.cursor/rules/smart-mcp/RULE.md`:

   ```markdown
   ---
   description: Mandatory usage of Smart Coding MCP tools for dependencies and search
   alwaysApply: true
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

### Alternative: User Rules

For global rules across all projects:

1. Open **Cursor Settings** → **Rules, Commands**
2. Add your instructions in the User Rules section

---

## Troubleshooting

- **Error: "Variable not expanded"**: Ensure you used `${workspaceFolder}` exactly as shown.
- **Tools not showing**: Click the "Refresh" icon next to the MCP server list in settings.
