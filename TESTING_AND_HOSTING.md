# Testing & Hosting Guide for Prism-MCP

This guide explains how to build, run, and "host" your Prism-MCP server to test it with AI clients.

## 1. The Concept of "Hosting"

For an MCP server like Prism that interacts with **local files** (AST analysis, finding code), "hosting" typically means **running it locally**.

If you host this on a remote server (like AWS or Vercel), it will only be able to analyze files *on that server*, not the files on your computer.

**The standard "Vibecoding" setup:**
- You run `prism-mcp` locally on your machine.
- Your AI Client (Claude Desktop, etc.) connects to it via stdio.
- The AI can now see and analyze your local code projects.

---

## 2. Quick Start (Local Testing)

### Prerequisites
- Node.js v20+
- `pnpm` installed (`npm install -g pnpm`)

### Build the Project
First, compile the TypeScript code:

```bash
pnpm install
pnpm run build
```

This creates a `build/index.js` file which is your server entry point.

### Verify it Runs
Run the server to ensure it starts (it will accept JSON-RPC on stdin, so it might look like it hangs—that's normal! Type `Ctrl+C` to exit):

```bash
node build/index.js
```

---

## 3. Connecting to Claude Desktop (MacOS/Windows)

To actually "test" it as an AI assistant, usually you use the **Claude Desktop App**.

1.  Open your Claude Desktop config file:
    *   **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
    *   **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

2.  Add Prism to the `mcpServers` object:

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/YOUR/prism-mcp/build/index.js"
      ]
    }
  }
}
```
*Replace the path with the actual absolute path to your project.*

3.  Restart Claude Desktop. You should see a plug icon indicating Prism is active.

---

## 4. Testing with the MCP Inspector (Web UI)

If you don't use Claude Desktop, you can use the official **MCP Inspector** web interface to test tools manually.

1.  Run the inspector pointing to your build:

```bash
pnpm dlx @modelcontextprotocol/inspector node build/index.js
```

2.  This will open a URL (e.g., `localhost:5173`).
3.  In the web UI, you can:
    *   See the list of tools (`find_callers`, `get_skeleton`, etc.).
    *   Manually execute them against files on your disk.
    *   See the raw JSON logs.

---

## 5. "Hosting" for Hackathons (Advanced)

If you want to show this off at a hackathon without making judges install it, you have two options:

### Option A: The "Demo Repo" Strategy (Recommended)
1.  Deploy Prism-MCP to a cloud VM (e.g., Railway, Render, or an EC2 instance).
2.  Clone a rigorous open-source project (like `react` or `fastapi`) onto that same VM.
3.  Expose Prism via **SSE (Server-Sent Events) Transport** instead of stdio (requires small code change to `src/server.ts`).
4.  Judges can connect their client to your URL (e.g., `https://my-prism-demo.railway.app/sse`).
5.  They can ask questions about the `react` repo hosted on your server.

### Option B: Local Demo Video
Record a screen capture of you using it in VS Code or Claude Desktop. This is often safer and more impactful for "vibecoding" demos as it shows the real developer workflow.

---

## 6. Context Isolation & Safety

One frequent question is: **"Does this tool leak context between different projects?"**

**Answer: No.** Prism-MCP is designed with strict isolation:

1.  **Absolute Path Caching**: The AST cache uses the full absolute path (e.g., `/Users/me/ProjectA/utils.ts`) as the key. Even if you have `utils.ts` in five different projects, they are stored as 5 separate entries.
2.  **Ephemeral Symbol Tables**: When you run a tool like `find_callers`, Prism builds a "Symbol Table" (a map of all functions/classes) *on the fly* for that specific request, scoped only to that folder. It does not maintain a persistent global graph that could accidentally link `Project A` to `Project B`.
3.  **No "Session" State**: The server is stateless regarding "projects". It relies entirely on the file paths sent by the client for each individual request.

---

## 7. Running with Docker

You can run Prism-MCP in a container to avoid installing Node.js locally.

### 1. Build the Image
```bash
docker build -t prism-mcp .
```

### 2. Run with Docker Compose (Recommended)
We provided a `docker-compose.yml` file. You **MUST** mount your local projects directory so the container can see them.

Edit `.env` or run directly:
```bash
# Mounts your current directory to /projects inside the container
export PROJECTS_DIR=$(pwd)
docker-compose up --build
```

### 3. Configure Claude or Clients
When using Docker, the file paths Prism sees are *inside the container* (e.g., `/projects/my-file.ts`).
**Note:** This adds complexity because your AI client (running on your host) sees `/Users/me/code/my-file.ts`, but Prism needs `/projects/my-file.ts`.

**Recommendation:** For the smoothest "Vibecoding" experience with a GUI client like Claude Desktop, **run Node.js locally** (Section 2). Use pnpm locally is significantly faster than npm.

---

## 8. Alternative Hosting & Remote Demos

If Docker is failing due to network/environment issues, or you want to "host" this permanently for others to see, here are your best bets:

### Option A: Railway (The "Instant VM" Strategy)
Railway is excellent for MCP servers because it gives you a real Linux box with persistent storage.
1.  **Repo Setup**: Put your Prism-MCP code on GitHub.
2.  **Deploy**: Connect Railway to your repo. It will detect the `package.json` and run `pnpm install`.
3.  **Demo Data**: Use a "Demo Project" by cloning another repo into the Railway volume or using a sub-module.
4.  **Access**: Use **SSE (Server-Sent Events) Transport**. You get a public URL like `prism.up.railway.app`.

### Option B: GitHub Codespaces (The "Cloud Workspace" Strategy)
If you want to demo Prism on a specific repo without judges installing anything:
1.  Open your project in a **GitHub Codespace**.
2.  Run Prism-MCP inside the Codespace terminal.
3.  Forward the port (if using SSE) or use the Codespace as the development environment.

### Option C: Smithery.ai (The "Community" Strategy)
You can publish your MCP server to [Smithery](https://smithery.ai/). 
- It provides a way for others to "one-click install" your server.
- It handles the plumbing so you don't have to worry about the hosting as much.

---

## 9. Remote Access via Ngrok (Local Hosting + Remote Access)
If you have Prism running locally but want a remote AI (like a cloud-hosted Claude) to see it:
1.  Switch Prism to **SSE Transport** (requires a small code change in `src/server.ts` to use `@modelcontextprotocol/sdk/server/sse.js`).
2.  Run `ngrok http 3000`.
3.  Provide the `ngrok` URL to your AI client.

### 4. Helper Scripts
We have included helper scripts to make this easier:

**Build:**
```bash
./docker-build.sh
```

**Run (Mounts current directory):**
```bash
./docker-run.sh
```

**Run (Mounts specific directory):**
```bash
./docker-run.sh /path/to/my/code
```
