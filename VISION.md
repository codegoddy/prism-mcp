💎 Prism-MCP
Deterministic Code-Lens for AI-Native Development

🚀 The Vision
Software engineering has entered the era of Vibe Coding, where developer velocity is limited only by the AI's ability to "see" the codebase. Current AI tools treat code as raw text, leading to context-stuffing, high token costs, and structural hallucinations.

Prism-MCP is a Model Context Protocol (MCP) server that provides a deterministic structural layer for LLMs. By exposing the Abstract Syntax Tree (AST) of a project, Prism-MCP allows AI agents to navigate code with the precision of a compiler, not the guesswork of a text search.

🛠 Features
Prism-MCP converts messy source code into structured "Semantic Anchors" that the AI can query surgically.

get_skeleton: Returns file outlines (classes, methods, signatures) without the "noise" of implementation logic.

find_callers: Uses AST-based reference tracking to show the AI every place a function is actually used, preventing breaking changes.

semantic_search: Locate specific code blocks (e.g., "Find all functions that take a User object as a parameter") without reading the whole file.

Multi-Language Support: High-fidelity parsing for TypeScript/TSX and Python.

🏗 Architectural Integrity
Built for the BridgeMind Vibeathon 2026, Prism-MCP follows a high-performance, low-latency architecture:

Language: TypeScript (Node.js >= 20)

Parsing Engine: tree-sitter (C bindings for maximum speed)

Protocol: Model Context Protocol (STDIO Transport)

Efficiency: Context pruning reduces token consumption by up to 85% compared to full-file reading.

⚡️ Quickstart

1. Installation
Bash

git clone <https://github.com/[YOUR-USERNAME]/prism-mcp.git>
cd prism-mcp
npm install
npm run build
2. Configure with Claude Desktop / Cursor
Add this to your claude_desktop_config.json or mcp.json:

JSON

{
  "mcpServers": {
    "prism-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/prism-mcp/build/index.js"]
    }
  }
}
🧠 Why This Wins
Most tools focus on writing code. Prism-MCP focuses on the bottleneck: Code Understanding. By moving from Probabilistic Retrieval (guessing where code is) to Deterministic Retrieval (knowing where code is via AST), we enable AI agents to perform complex refactors on massive files that would otherwise exceed the context window.

"Vibe coding is about intent. Prism-MCP provides the infrastructure to turn that intent into precise execution."

📅 Roadmap
[ ] Support for Rust and Go grammars.

[ ] Dependency Graph visualization tool.

[ ] Integration with ast-grep for structural search-and-replace.

📄 License
Licensed under the MIT License.
