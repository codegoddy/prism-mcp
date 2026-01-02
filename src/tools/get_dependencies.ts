import path from 'path';
import fs from 'fs';
import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { extractSkeleton } from './get_skeleton.js';
import { logger } from '../utils/logger.js';
import type { ImportStatement, ASTNode } from '../types/ast.js';

export async function getDependencies(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath, directoryPath } = args;

  if (typeof filePath !== 'string' && typeof directoryPath !== 'string') {
    return {
      content: [{ type: 'text', text: 'Invalid arguments: either filePath or directoryPath must be provided' }],
      isError: true,
    };
  }

  try {
    const filesToProcess: string[] = [];
    const rootPath = (directoryPath as string) || path.dirname(filePath as string);

    if (directoryPath) {
       // Recursively find all supported files
       findAllFiles(directoryPath as string, filesToProcess);
    } else {
       filesToProcess.push(filePath as string);
    }

    const dependencyGraph: Record<string, string[]> = {};
    const allImports: Record<string, ImportStatement[]> = {};
    const unusedImports: Record<string, string[]> = {};

    for (const file of filesToProcess) {
      const parser = ParserFactory.getParserForFile(file);
      const result = await parser.parseFile(file);
      const language = parser.getLanguage();
      const skeleton = extractSkeleton(result.tree, file, language);
      
      allImports[file] = skeleton.imports;
      dependencyGraph[file] = [];

      for (const imp of skeleton.imports) {
        const resolved = resolveImport(file, imp.source);
        if (resolved && fs.existsSync(resolved)) {
           dependencyGraph[file].push(resolved);
        }
      }

      // Unused imports check
      const importedNames: string[] = [];
      for (const imp of skeleton.imports) {
          for (const item of imp.imported) {
              importedNames.push(item.alias || item.name);
          }
      }
      unusedImports[file] = identifyUnusedImports(result.tree, importedNames);
    }

    const circular = detectCircularDependencies(dependencyGraph);
    const topoSort = topologicalSort(dependencyGraph);

    const result = {
      dependencyGraph,
      circularDependencies: circular,
      topologicalOrder: topoSort,
      unusedImports,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    logger.error('Failed to get dependencies', error as Error);
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

function findAllFiles(dir: string, fileList: string[]): void {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
       if (file !== 'node_modules' && file !== '.git' && file !== 'build') {
         findAllFiles(name, fileList);
       }
    } else {
       if (/\.(ts|tsx|js|jsx|py)$/.test(file)) {
         fileList.push(name);
       }
    }
  }
}

function resolveImport(currentFile: string, importSource: string): string | null {
  const dir = path.dirname(currentFile);
  const candidates = [
    importSource,
    importSource + '.ts',
    importSource + '.tsx',
    importSource + '.js',
    importSource + '.jsx',
    importSource + '.py',
    path.join(importSource, 'index.ts'),
    path.join(importSource, 'index.js'),
  ];

  for (const cand of candidates) {
    const fullPath = path.resolve(dir, cand);
    if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
      return fullPath;
    }
  }
  return null;
}

function detectCircularDependencies(graph: Record<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string, path: string[]) {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    for (const neighbor of graph[node] || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (recStack.has(neighbor)) {
        const cycle = path.slice(path.indexOf(neighbor));
        cycles.push(cycle);
      }
    }

    recStack.delete(node);
  }

  for (const node in graph) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles;
}

function topologicalSort(graph: Record<string, string[]>): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const temp = new Set<string>();

  function visit(node: string) {
    if (temp.has(node)) return; // Cycle detected, handled elsewhere
    if (visited.has(node)) return;

    temp.add(node);
    for (const neighbor of graph[node] || []) {
      visit(neighbor);
    }
    temp.delete(node);
    visited.add(node);
    result.unshift(node);
  }

  for (const node in graph) {
    if (!visited.has(node)) {
      visit(node);
    }
  }

  return result;
}

function identifyUnusedImports(root: ASTNode, importedNames: string[]): string[] {
  if (importedNames.length === 0) return [];
  
  const usedNames = new Set<string>();
  
  function traverse(node: ASTNode) {
    // Skip checking in import/export statements themselves
    if (node.type.includes('import') || node.type.includes('export')) {
        // But we still want to traverse children if they are not the identifiers we are looking for?
        // Actually, if we are in an import statement, we don't want to count the identifier as a USE.
        return;
    }
    
    if (node.type === 'identifier' || node.type === 'type_identifier' || node.type === 'property_identifier') {
      usedNames.add(node.text);
    }
    
    for (const child of node.namedChildren) {
      traverse(child);
    }
  }
  
  // Also check nested bodies
  for (const child of root.namedChildren) {
      traverse(child);
  }
  
  return importedNames.filter(name => !usedNames.has(name));
}

export default getDependencies;
