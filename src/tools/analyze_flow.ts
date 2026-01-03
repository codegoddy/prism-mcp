import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { ParserError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { buildSymbolTable, findSymbolDefinition, findReferences } from './find_callers.js';
import { findSourceFiles } from './find_callers.js';
import type {
  SymbolDefinition,
  SymbolReference,
  FlowAnalysis,
  FlowNode,
  FlowEdge,
} from '../types/ast.js';

export async function analyzeFlow(args: Record<string, unknown>): Promise<ToolResponse> {
  const { entryPoint, filePath, directoryPath, maxDepth = 5 } = args;

  if (
    typeof entryPoint !== 'string' &&
    typeof filePath !== 'string' &&
    typeof directoryPath !== 'string'
  ) {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: either entryPoint, filePath, or directoryPath must be provided',
        },
      ],
      isError: true,
    };
  }

  try {
    logger.info('Analyzing code flow', { entryPoint, filePath, directoryPath, maxDepth });

    let analysisScope: string[];

    if (directoryPath) {
      // Analyze entire directory
      analysisScope = findSourceFiles(directoryPath as string);
    } else if (filePath) {
      // Analyze single file
      analysisScope = [filePath as string];
    } else {
      // Find files containing the entry point
      const allFiles = findSourceFiles(process.cwd());
      const filesWithEntryPoint = [];

      for (const file of allFiles) {
        try {
          const parser = ParserFactory.getParserForFile(file);
          await parser.parseFile(file);
          const symbolTable = await buildSymbolTable([file]);
          const entrySymbol =
            findSymbolDefinition(symbolTable, file, entryPoint as string, false) ||
            findSymbolDefinition(symbolTable, file, entryPoint as string, true);

          if (entrySymbol) {
            filesWithEntryPoint.push(file);
          }
        } catch (e) {
          // Skip files that can't be parsed
        }
      }

      if (filesWithEntryPoint.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Entry point "${entryPoint}" not found in any source files`,
            },
          ],
          isError: true,
        };
      }

      analysisScope = filesWithEntryPoint;
    }

    // Build comprehensive symbol table
    const symbolTable = await buildSymbolTable(analysisScope);

    // Find entry points
    const entryPoints = await findEntryPoints(
      entryPoint as string | undefined,
      analysisScope,
      symbolTable
    );

    // Build flow graph
    const flowGraph = await buildFlowGraph(
      entryPoints,
      symbolTable,
      analysisScope,
      maxDepth as number
    );

    const analysis: FlowAnalysis = {
      entryPoints: entryPoints.map((ep) => ({
        name: ep.name,
        type: ep.type,
        filePath: ep.filePath,
        line: ep.startPosition.row + 1,
      })),
      flowGraph,
      analysisScope: analysisScope.length,
      maxDepth: maxDepth as number,
      totalNodes: flowGraph.nodes.length,
      totalEdges: flowGraph.edges.length,
    };

    logger.info('Flow analysis completed', {
      entryPoints: entryPoints.length,
      nodes: flowGraph.nodes.length,
      edges: flowGraph.edges.length,
      scope: analysisScope.length,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(analysis, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    logger.error('Failed to analyze flow', error as Error, { entryPoint, filePath, directoryPath });

    if (error instanceof ParserError) {
      return {
        content: [{ type: 'text', text: error.message }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function findEntryPoints(
  entryPointName: string | undefined,
  files: string[],
  symbolTable: Record<string, SymbolDefinition>
): Promise<SymbolDefinition[]> {
  const entryPoints: SymbolDefinition[] = [];

  if (entryPointName) {
    // Find specific entry point
    for (const file of files) {
      const symbol =
        findSymbolDefinition(symbolTable, file, entryPointName, false) ||
        findSymbolDefinition(symbolTable, file, entryPointName, true);

      if (symbol) {
        entryPoints.push(symbol);
      }
    }
  } else {
    // Find common entry points (main functions, route handlers, etc.)
    const commonEntryPatterns = [
      'main',
      'app',
      'server',
      'index',
      'start',
      'init',
      'bootstrap',
      'run',
    ];

    for (const symbol of Object.values(symbolTable)) {
      if (symbol.type === 'function' || symbol.type === 'method') {
        const name = symbol.name.toLowerCase();
        if (commonEntryPatterns.some((pattern) => name.includes(pattern))) {
          entryPoints.push(symbol);
        }
      }
    }

    // Also look for exported functions/classes as potential entry points
    for (const symbol of Object.values(symbolTable)) {
      if (symbol.isExported && (symbol.type === 'function' || symbol.type === 'class')) {
        if (!entryPoints.find((ep) => ep.id === symbol.id)) {
          entryPoints.push(symbol);
        }
      }
    }

    // Limit to top 10 most likely entry points
    entryPoints.splice(10);
  }

  return entryPoints;
}

async function buildFlowGraph(
  entryPoints: SymbolDefinition[],
  symbolTable: Record<string, SymbolDefinition>,
  files: string[],
  maxDepth: number
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const visited = new Set<string>();
  const nodeMap = new Map<string, FlowNode>();

  async function addNode(symbol: SymbolDefinition): Promise<FlowNode> {
    if (nodeMap.has(symbol.id)) {
      return nodeMap.get(symbol.id)!;
    }

    const node: FlowNode = {
      id: symbol.id,
      name: symbol.name,
      type: symbol.type,
      filePath: symbol.filePath,
      line: symbol.startPosition.row + 1,
      className: symbol.className,
      isExported: symbol.isExported,
    };

    nodes.push(node);
    nodeMap.set(symbol.id, node);
    return node;
  }

  async function traverseFlow(symbol: SymbolDefinition, depth: number): Promise<void> {
    if (depth >= maxDepth || visited.has(symbol.id)) {
      return;
    }

    visited.add(symbol.id);
    await addNode(symbol);

    // Find all references to this symbol (who calls it)
    const references = await findAllReferences(symbol, files);

    for (const ref of references) {
      // Find the caller symbol
      const callerSymbols = Object.values(symbolTable).filter(
        (s) =>
          s.filePath === ref.filePath &&
          s.startPosition.row <= ref.startPosition.row &&
          s.endPosition.row >= ref.endPosition.row
      );

      for (const caller of callerSymbols) {
        if (caller.id !== symbol.id) {
          await addNode(caller);

          const edge: FlowEdge = {
            from: caller.id,
            to: symbol.id,
            type: ref.context.callType,
            filePath: ref.filePath,
            line: ref.startPosition.row + 1,
          };

          edges.push(edge);

          // Continue traversal from caller
          await traverseFlow(caller, depth + 1);
        }
      }
    }
  }

  // Start traversal from entry points
  for (const entryPoint of entryPoints) {
    await traverseFlow(entryPoint, 0);
  }

  return { nodes, edges };
}

async function findAllReferences(
  symbol: SymbolDefinition,
  files: string[]
): Promise<SymbolReference[]> {
  const allReferences: SymbolReference[] = [];

  for (const file of files) {
    try {
      const parser = ParserFactory.getParserForFile(file);
      const result = await parser.parseFile(file);
      const references = findReferences(result.tree, file, symbol);
      allReferences.push(...references);
    } catch (error) {
      logger.warn(`Failed to find references in ${file}`, error as Record<string, unknown>);
    }
  }

  return allReferences;
}

export default analyzeFlow;
