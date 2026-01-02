# Prism-MCP Implementation Plan

## Overview

Building a high-performance Model Context Protocol (MCP) server that exposes deterministic AST-based code understanding for JavaScript/TypeScript and Python.

**Core Philosophy:** AST-first, deterministic, zero ambiguity.

---

## Technology Stack

### Core Runtime
- **Language:** TypeScript (Node.js >= 20)
- **Build Tool:** tsup or esbuild
- **Package Manager:** npm

### Parsing Engine
- **Primary:** tree-sitter (C bindings via tree-sitter-wasm or native bindings)
- **Fallback/Supplement:** @typescript-eslint/parser (TypeScript)
  - Provides richer type information where tree-sitter is insufficient

### MCP Protocol
- **Transport:** STDIO
- **SDK:** @modelcontextprotocol/sdk
- **Implementation:** Custom server with typed interfaces

### Performance Critical Components
- **C++ Addons:** For computationally intensive operations
  - Reference graph traversal
  - AST node queries
  - Cross-file indexing
- **Node.js FFI:** For interfacing with C++ components

### Language Grammars
- **TypeScript/TSX:** tree-sitter-typescript
- **JavaScript:** tree-sitter-javascript (embedded in typescript)
- **Python:** tree-sitter-python

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Client (Claude/Cursor)                │
└────────────────────────────┬────────────────────────────────┘
                             │ STDIO
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server (TypeScript)                   │
├─────────────────────────────────────────────────────────────┤
│  Tool Registry & Request Router                             │
│  ├─ get_skeleton()                                           │
│  ├─ find_callers()                                           │
│  ├─ semantic_search()                                        │
│  └─ get_dependencies() (future)                              │
├─────────────────────────────────────────────────────────────┤
│  AST Cache Manager                                           │
│  ├─ In-memory LRU cache                                      │
│  ├─ File watching (hot reload)                               │
│  └─ Incremental parsing                                     │
├─────────────────────────────────────────────────────────────┤
│  Reference Graph Engine (C++)                                │
│  ├─ Build call graphs                                        │
│  ├─ Track symbol definitions & references                    │
│  ├─ Cross-file reference resolution                          │
│  └─ Index queries                                            │
└─────────────┬───────────────────────────────────────┬───────┘
              │                                       │
              ▼                                       ▼
┌──────────────────────────┐           ┌──────────────────────────┐
│  tree-sitter Parsers     │           │  Type Information Layer  │
│  ├─ TypeScript/TSX       │           │  ├─ TypeScript Language   │
│  ├─ JavaScript           │           │  ├─ Python (type stubs)  │
│  └─ Python               │           │  └─ Optional type server │
└──────────────────────────┘           └──────────────────────────┘
              │                                       │
              ▼                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    File System                                   │
│  Source Code (TS/TSX/JS/PY)                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
prism-mcp/
├── src/
│   ├── index.ts                 # MCP server entry point
│   ├── server.ts                # MCP server implementation
│   ├── tools/                   # Tool implementations
│   │   ├── get_skeleton.ts
│   │   ├── find_callers.ts
│   │   └── semantic_search.ts
│   ├── parsers/                # Language-specific parsers
│   │   ├── base.ts             # Abstract parser interface
│   │   ├── typescript.ts       # TS/TSX/JS parser
│   │   └── python.ts           # Python parser
│   ├── ast/
│   │   ├── cache.ts            # AST caching
│   │   └── indexer.ts          # Cross-file indexing
│   ├── graph/                  # Reference graph
│   │   ├── builder.ts          # Graph construction
│   │   ├── query.ts            # Graph queries
│   │   └── native/             # C++ native module
│   │       ├── binding.cc      # Node.js C++ bindings
│   │       ├── graph.cc        # Reference graph impl
│   │       └── binding.gyp     # Build config
│   ├── types/
│   │   ├── ast.ts              # AST node types
│   │   ├── graph.ts            # Graph types
│   │   └── mcp.ts              # MCP protocol types
│   └── utils/
│       ├── logger.ts
│       └── config.ts
├── test/
│   ├── fixtures/               # Sample code files
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   └── benchmark/              # Performance benchmarks
├── grammars/                   # Compiled tree-sitter grammars
│   ├── typescript.wasm
│   ├── javascript.wasm
│   └── python.wasm
├── build/                      # Compiled output
│   ├── index.js
│   └── native/
│       └── graph.node         # Compiled C++ module
├── package.json
├── tsconfig.json
├── binding.gyp                # C++ build config
└── README.md
```

---

## Phase 1: Foundation (Weeks 1-2)

### 1.1 Project Setup
- [ ] Initialize TypeScript project with tsconfig
- [ ] Set up build pipeline (esbuild/tsup)
- [ ] Configure testing (Jest or Vitest)
- [ ] Set up linting (ESLint, Prettier)
- [ ] Create basic MCP server skeleton

### 1.2 MCP Server Infrastructure
- [ ] Implement stdio transport
- [ ] Register basic "health" tool
- [ ] Error handling and logging infrastructure
- [ ] Configuration management

### 1.3 tree-sitter Integration
- [ ] Install tree-sitter and language grammars
- [ ] Create parser interface (TypeScript, Python)
- [ ] Implement basic file parsing
- [ ] Unit tests for parser correctness

**Deliverable:** Working MCP server that can parse TS/Python files and return AST objects.

---

## Phase 2: Core Tools (Weeks 3-5)

### 2.1 get_skeleton Implementation
**File:** `src/tools/get_skeleton.ts`

- [ ] Extract class definitions with:
  - Class name, extends, implements
  - Methods (name, parameters, return type, visibility)
  - Properties (name, type, visibility, readonly)
  - Constructor signature

- [ ] Extract function definitions:
  - Name, parameters, return type
  - Async/generator modifiers
  - Export status

- [ ] Extract imports/exports
- [ ] Filter out implementation details (function bodies)
- [ ] Return structured JSON

**Tests:**
- [ ] Verify skeleton accuracy for sample files
- [ ] Test with nested classes
- [ ] Test with exported vs private members
- [ ] Test Python classes, functions, decorators

### 2.2 find_callers Implementation
**File:** `src/tools/find_callers.ts`

- [ ] Implement symbol extraction:
  - Function/method definitions
  - Variable/function declarations
  - Parameter names

- [ ] Implement reference matching:
  - Direct calls: `func()`, `obj.method()`
  - Method chaining: `obj.method().another()`
  - Callback references: `someCallback(func)`

- [ ] Cross-file reference tracking:
  - Build symbol table per file
  - Resolve import statements
  - Track re-exports

- [ ] Return complete call sites with:
  - File path, line number
  - Call context (parent function)
  - Call type (direct, indirect)

**Tests:**
- [ ] Find all callers of a simple function
- [ ] Handle overloads (same name, different signatures)
- [ ] Handle class method calls
- [ ] Cross-file references
- [ ] Python: method calls, class methods, static methods

### 2.3 semantic_search Implementation
**File:** `src/tools/semantic_search.ts`

- [ ] Define query DSL:
  ```typescript
  interface SemanticQuery {
    nodeType?: "function" | "class" | "variable";
    parameters?: { name: string; type: string }[];
    returnType?: string;
    modifiers?: string[];
    namePattern?: string;
  }
  ```

- [ ] Query AST based on semantic criteria
- [ ] Support regex for name patterns
- [ ] Type matching (exact, supertype, subtype)
- [ ] Return matching nodes with metadata

**Tests:**
- [ ] Find functions with specific parameter types
- [ ] Find classes implementing an interface
- [ ] Find async functions
- [ ] Python: find functions with decorators
- [ ] Python: find classes inheriting from base class

**Deliverable:** Three fully functional MCP tools with comprehensive test coverage.

---

## Phase 3: Performance & Caching (Weeks 6-7)

### 3.1 AST Cache Manager
**File:** `src/ast/cache.ts`

- [ ] Implement in-memory LRU cache
- [ ] Cache parsed ASTs per file
- [ ] Cache invalidation:
  - File watcher (chokidar)
  - Manual refresh
- [ ] Cache size limits (configurable)

### 3.2 Reference Graph Engine (C++)
**Why C++:** Building and querying reference graphs for large codebases is computationally expensive. C++ provides 10-50x speedup.

**File:** `src/graph/native/binding.cc`

- [ ] Create Node.js C++ addon using N-API
- [ ] Data structures:
  - Symbol: `{ id, name, type, file, line }`
  - Reference: `{ fromSymbol, toSymbol, type }`
  - File: `{ path, symbols[], imports[] }`

- [ ] Graph operations (C++):
  ```cpp
  class ReferenceGraph {
    void addSymbol(Symbol s);
    void addReference(Reference r);
    vector<Reference> findCallers(symbolId);
    vector<Reference> findCallees(symbolId);
    bool isSymbolUsed(symbolId);
    void rebuild();
  }
  ```

- [ ] Node.js bindings:
  - Expose graph methods to TypeScript
  - Handle memory management
  - Efficient data transfer

**File:** `binding.gyp`
```json
{
  "targets": [
    {
      "target_name": "graph",
      "sources": ["src/graph/native/binding.cc", "src/graph/native/graph.cc"],
      "include_dirs": ["<!(node -e \"require('nan')\")"]
    }
  ]
}
```

**Tests:**
- [ ] Correctness: match TypeScript implementation
- [ ] Performance benchmarks (graph building, queries)
- [ ] Memory leak tests
- [ ] Stress tests with large codebases

**Deliverable:** C++ native module integrated with TypeScript, 10x+ performance improvement.

---

## Phase 4: Type Information Layer (Weeks 8-9)

### 4.1 TypeScript Type System Integration
**File:** `src/parsers/typescript.ts`

- [ ] Use @typescript-eslint/parser for rich types
- [ ] Extract type information:
  - Parameter types
  - Return types
  - Generic constraints
  - Union/intersection types

- [ ] Optional: Integrate TypeScript Language Server
  - Provides full type checking
  - Requires TypeScript project (tsconfig.json)

### 4.2 Python Type Information
**File:** `src/parsers/python.py`

- [ ] Extract type hints (PEP 484)
- [ ] Stub-based type inference
- [ ] Optional: mypy integration

**Deliverable:** Enhanced semantic queries with type awareness.

---

## Phase 5: Advanced Features (Weeks 10-12)

### 5.1 Dependency Graph
**File:** `src/tools/get_dependencies.ts`

- [ ] Build module dependency graph
- [ ] Detect circular dependencies
- [ ] Identify unused imports
- [ ] Return topological sort order

### 5.2 Control Flow Analysis
**File:** `src/ast/flow.ts`

- [ ] Extract control flow graphs
- [ ] Identify all paths to a statement
- [ ] Find dead code paths
- [ ] Calculate cyclomatic complexity

### 5.3 Refactor Suggestions
**File:** `src/tools/suggest_refactors.ts`

- [ ] Find similar code blocks
- [ ] Identify extractable functions
- [ ] Suggest variable renaming
- [ ] Detect common patterns

**Deliverable:** Advanced analysis tools for complex refactors.

---

## Phase 6: Testing & Optimization (Weeks 13-14)

### 6.1 Comprehensive Testing
- [ ] Unit tests (80%+ coverage)
- [ ] Integration tests (end-to-end MCP scenarios)
- [ ] Performance benchmarks:
  - Parse time per 1000 lines
  - Query latency (p50, p95, p99)
  - Memory usage for 10k LOC project
- [ ] Edge cases:
  - Malformed code
  - Extremely large files
  - Circular dependencies
  - Dynamic imports

### 6.2 Performance Optimization
- [ ] Profile hot paths
- [ ] Optimize C++ graph algorithms
- [ ] Reduce memory allocations
- [ ] Parallelize independent operations
- [ ] Cache invalidation improvements

### 6.3 Documentation
- [ ] API documentation (TSDoc)
- [ ] Usage examples
- [ ] Configuration guide
- [ ] Troubleshooting guide

**Deliverable:** Production-ready MCP server with documentation.

---

## Phase 7: Release Preparation (Week 15)

### 7.1 Packaging
- [ ] Build for multiple platforms:
  - Linux (x64, arm64)
  - macOS (x64, arm64)
  - Windows (x64)
- [ ] Pre-compiled C++ modules
- [ ] NPM package with proper binaries

### 7.2 CI/CD
- [ ] GitHub Actions workflow
- [ ] Automated tests on all platforms
- [ ] Automated releases
- [ ] Versioning strategy

### 7.3 Distribution
- [ ] NPM package publishing
- [ ] Claude Desktop integration guide
- [ ] Cursor integration guide
- [ ] Demo project

**Deliverable:** Public release of Prism-MCP.

---

## Performance Targets

### Metrics
| Metric | Target | Benchmark |
|--------|--------|-----------|
| File parsing (1000 LOC) | < 50ms | tree-sitter baseline |
| get_skeleton (cached) | < 10ms | Memory read |
| find_callers (single file) | < 20ms | Graph query |
| find_callers (10k LOC) | < 100ms | C++ graph |
| semantic_search | < 50ms | AST traversal |
| Memory (10k LOC project) | < 100MB | Efficient caching |
| Warm start (no cache) | < 5s | Initial indexing |
| Cache hit rate | > 90% | Working set locality |

### Optimization Strategies
1. **AST Memoization:** Cache parsed trees
2. **Incremental Parsing:** Only reparse changed files
3. **Lazy Indexing:** Build reference graph on demand
4. **C++ Hot Paths:** Graph operations in native code
5. **Binary Serialization:** Faster cache storage/retrieval
6. **Worker Threads:** Parallel file parsing

---

## Testing Strategy

### Unit Tests
```bash
# Run unit tests
npm test

# With coverage
npm test -- --coverage
```

### Integration Tests
```bash
# Test MCP protocol
npm run test:integration
```

### Benchmarking
```bash
# Performance benchmarks
npm run benchmark

# Compare C++ vs TypeScript
npm run benchmark:compare
```

### Test Fixtures
`test/fixtures/`
- `typescript/` - Various TS patterns
- `python/` - Various Python patterns
- `large-project/` - Simulated large codebase
- `edge-cases/` - Malformed/unusual code

---

## Risk Mitigation

### Risk 1: C++ Cross-Platform Compilation
**Mitigation:**
- Use node-gyp for all platforms
- Test on Linux, macOS, Windows in CI
- Fallback to TypeScript if C++ build fails
- Provide pre-compiled binaries

### Risk 2: tree-sitter Grammar Limitations
**Mitigation:**
- Supplement with TypeScript Language Server for types
- Implement custom AST transformations
- Document known limitations

### Risk 3: Large Codebase Memory Usage
**Mitigation:**
- LRU cache with configurable size
- Streaming AST processing
- Disk-backed cache for very large projects
- Out-of-core graph algorithms

### Risk 4: Breaking Changes in MCP Protocol
**Mitigation:**
- Versioned API
- Compatibility layer
- Monitor MCP SDK updates
- Extensive integration tests

---

## Future Enhancements (Post-MVP)

### Additional Languages
- [ ] Rust support
- [ ] Go support
- [ ] Java/Kotlin support

### Advanced Analysis
- [ ] Data flow analysis
- [ ] Taint analysis (security)
- [ ] Code smell detection
- [ ] Technical debt scoring

### Visualization
- [ ] Dependency graph UI
- [ ] Call tree visualization
- [ ] Heatmap of complexity
- [ ] Interactive code explorer

### Integration
- [ ] GitHub Copilot integration
- [ ] VS Code extension
- [ ] Web-based dashboard
- [ ] CLI tool

---

## Success Criteria

- [ ] All three core tools implemented and tested
- [ ] Performance targets met
- [ ] Zero false positives in reference tracking
- [ ] < 5% memory overhead compared to base Node.js
- [ ] Compatible with Claude Desktop and Cursor
- [ ] Public npm package published
- [ ] Documentation and examples provided
- [ ] Winner of BridgeMind Vibeathon 2026 🏆

---

## Development Workflow

### Branch Strategy
```
main          - Production releases
develop       - Integration branch
feature/*     - Feature branches
bugfix/*      - Bug fixes
perf/*        - Performance optimizations
```

### Commit Convention
```
feat: implement get_skeleton tool
fix: resolve reference matching for overloaded methods
perf: optimize C++ graph query algorithm
test: add integration tests for Python parser
docs: update README with installation instructions
```

### Code Review
- All PRs require review
- CI must pass
- Tests must pass
- No regressions in benchmarks

---

## Resource Requirements

### Development
- Node.js 20+
- TypeScript 5+
- C++ compiler (GCC/Clang/MSVC)
- Python 3.9+ (for testing Python parser)
- Git

### Dependencies
```json
{
  "tree-sitter": "^0.21.0",
  "@modelcontextprotocol/sdk": "^1.0.0",
  "nan": "^2.19.0",
  "chokidar": "^3.5.0"
}
```

### Hardware (Recommended for Development)
- 16GB RAM
- SSD for file operations
- 4+ CPU cores (for parallel testing)

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 1. Foundation | 2 weeks | Basic MCP server, tree-sitter parsers |
| 2. Core Tools | 3 weeks | get_skeleton, find_callers, semantic_search |
| 3. Performance | 2 weeks | Caching, C++ reference graph |
| 4. Type Layer | 2 weeks | Enhanced type information |
| 5. Advanced | 3 weeks | Dependency graph, control flow, refactor suggestions |
| 6. Testing | 2 weeks | Comprehensive tests, optimization |
| 7. Release | 1 week | Packaging, documentation, publishing |

**Total:** 15 weeks (~3.5 months)

---

## Next Steps

1. **Initialize repository** with project structure
2. **Set up development environment** and CI/CD
3. **Begin Phase 1:** Foundation implementation
4. **Weekly progress reviews** and milestone tracking

Let's build the future of AI-native development! 🚀
