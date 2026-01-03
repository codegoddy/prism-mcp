import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { logger } from '../utils/logger.js';
import type { ASTNode } from '../types/ast.js';
import { readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

interface VariableUsage {
  type: 'declaration' | 'assignment' | 'read';
  filePath: string;
  line: number;
  column: number;
  context: string;
}

interface TrackVariableResult {
  variableName: string;
  usages: VariableUsage[];
  summary: {
    declarations: number;
    assignments: number;
    reads: number;
  };
}

export default async function trackVariable(args: Record<string, unknown>): Promise<ToolResponse> {
  const { variableName, filePath, directoryPath } = args;

  if (typeof variableName !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: variableName must be provided',
        },
      ],
      isError: true,
    };
  }

  if (typeof filePath !== 'string' && typeof directoryPath !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: either filePath or directoryPath must be provided',
        },
      ],
      isError: true,
    };
  }

  try {
    const targetPath = (directoryPath || filePath) as string;
    const isDirectory = typeof directoryPath === 'string';
    
    logger.info('Tracking variable usage', { variableName, targetPath, isDirectory });

    // Find all source files
    const files = isDirectory ? findSourceFiles(targetPath) : [targetPath];
    
    if (files.length === 0) {
      return {
        content: [{ type: 'text', text: 'No source files found to analyze' }],
        isError: true,
      };
    }

    const usages: VariableUsage[] = [];

    for (const file of files) {
      try {
        const parser = ParserFactory.getParserForFile(file);
        const result = await parser.parseFile(file);
        
        const fileUsages = findVariableUsages(result.tree, variableName, file);
        usages.push(...fileUsages);
      } catch (error) {
        logger.warn(`Failed to parse ${file}`, error as Record<string, unknown>);
      }
    }

    // Sort by file path and line number
    usages.sort((a, b) => {
      const fileCompare = a.filePath.localeCompare(b.filePath);
      if (fileCompare !== 0) return fileCompare;
      return a.line - b.line;
    });

    const result: TrackVariableResult = {
      variableName,
      usages,
      summary: {
        declarations: usages.filter(u => u.type === 'declaration').length,
        assignments: usages.filter(u => u.type === 'assignment').length,
        reads: usages.filter(u => u.type === 'read').length,
      },
    };

    logger.info('Variable tracking complete', {
      variableName,
      totalUsages: usages.length,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to track variable', error as Error);

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

function findSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.pyw'];

  try {
    const stats = statSync(dir);
    if (!stats.isDirectory()) {
      if (extensions.includes(extname(dir))) {
        return [dir];
      }
      return [];
    }
  } catch {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (
        entry.name !== 'node_modules' &&
        entry.name !== '.git' &&
        entry.name !== 'build' &&
        entry.name !== 'dist' &&
        !entry.name.startsWith('.')
      ) {
        files.push(...findSourceFiles(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = extname(fullPath);
      if (extensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function findVariableUsages(root: ASTNode, variableName: string, filePath: string): VariableUsage[] {
  const usages: VariableUsage[] = [];

  function traverse(node: ASTNode): void {
    // Check if node matches the variable name
    if (
      (node.type === 'identifier' || 
       node.type === 'shorthand_property_identifier_pattern') &&
      node.text === variableName
    ) {
      const usageType = determineUsageType(node);
      
      usages.push({
        type: usageType,
        filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        context: getLineContent(node),
      });
    }

    // Traverse children
    for (const child of node.namedChildren) {
      traverse(child);
    }
  }

  traverse(root);
  return usages;
}

function determineUsageType(node: ASTNode): 'declaration' | 'assignment' | 'read' {
  const parent = node.parent;
  if (!parent) return 'read';

  // Declaration contexts
  if (
    parent.type === 'variable_declarator' &&
    parent.namedChildren[0] === node
  ) {
    return 'declaration';
  }

  if (
    (parent.type === 'function_declaration' ||
     parent.type === 'function_definition' ||
     parent.type === 'method_definition') &&
    // First child is usually name, but tree-sitter structure varies slightly by language
    // Checking if it's the identifier naming the function
    getMethodNameNode(parent) === node
  ) {
    return 'declaration';
  }

  if (
    (parent.type === 'formal_parameters' || parent.type === 'parameters') || // Direct parameter
    (parent.type === 'required_parameter' && parent.namedChildren[0] === node) // Typed parameter (Python/TS)
  ) {
    return 'declaration';
  }
  
  // Assignment contexts
  if (
    parent.type === 'assignment_expression' ||
    parent.type === 'augmented_assignment_expression'
  ) {
    // LHS is assignment, RHS is read
    // e.g. x = y
    // node == x -> assignment
    // node == y -> read
    if (parent.namedChildren[0] === node) {
      return 'assignment';
    }
  }

  // Python assignment: x = 1 (x is declaration if at top level, assignment otherwise)
  // For tracking purposes, identifying where it is written is key
  if (parent.type === 'assignment') {
     const leftNode = parent.namedChildren.find(c => c.field === 'left');
     if (leftNode === node) {
        // If it's a top-level module assignment, it's effectively a declaration
        // Check for direct module parent or expression_statement wrapper (Python)
        if (parent.parent?.type === 'module' || parent.parent?.parent?.type === 'module') {
            return 'declaration';
        }
        return 'assignment';
     }
  }

  if (parent.type === 'update_expression') {
    // x++, --x
    return 'assignment';
  }

  // Destructuring: const { x } = obj
  // If the node itself is the shorthand pattern, it is a declaration
  if (node.type === 'shorthand_property_identifier_pattern') {
     return 'declaration';
  }

  // If the parent is the shorthand pattern (shouldn't happen if we visit the shorthand node directly, but good for safety)
  if (parent.type === 'shorthand_property_identifier_pattern') {
     return 'declaration';
  }
  
  if (parent.type === 'pair_pattern' && parent.namedChildren[1] === node) {
      // { key: value } in destructuring, value is the declaration
      return 'declaration';
  }

  return 'read';
}

function getMethodNameNode(node: ASTNode): ASTNode | null {
    return node.namedChildren.find(c => c.type === 'identifier' || c.type === 'property_identifier') || null;
}

function getLineContent(node: ASTNode): string {
    // This is a placeholder since ASTNode doesn't always have full source access
    // Ideally we would read the file line, but here we can return the parent's text context
    // or simply describe the parent type
    let context = node.parent?.text || node.text;
    if (context.length > 50) {
        context = context.substring(0, 50) + '...';
    }
    return context;
}
