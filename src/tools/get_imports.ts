import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { logger } from '../utils/logger.js';
import type { ASTNode } from '../types/ast.js';

interface ImportItem {
  source: string;
  type: 'static' | 'dynamic' | 'require';
  specifiers?: string[];
  isTypeOnly?: boolean;
}

export default async function getImports(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath } = args;

  if (typeof filePath !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: filePath must be provided',
        },
      ],
      isError: true,
    };
  }

  try {
    logger.info('Analyzing imports', { filePath });

    const parser = ParserFactory.getParserForFile(filePath);
    const result = await parser.parseFile(filePath);
    const tree = result.tree;

    const imports: ImportItem[] = [];
    
    // Traverse AST for imports
    function traverse(node: ASTNode) {
        // 1. Static Imports
        if (node.type === 'import_statement') {
            imports.push(...processImportStatement(node));
        } 
        
        // 2. Dynamic Imports and Requires
        if (node.type === 'call_expression' || node.type === 'import_expression') {
            const isDynamicImport = node.children.some(c => c.type === 'import');
            if (isDynamicImport || node.type === 'import_expression') {
                 // dynamic import
                 // Check for string directly or inside arguments
                 let arg = node.namedChildren.find(c => c.type === 'string' || c.type === 'template_string');
                 
                 if (!arg) {
                     const args = node.namedChildren.find(c => c.type === 'arguments');
                     if (args) {
                         arg = args.namedChildren.find(c => c.type === 'string' || c.type === 'template_string');
                     }
                 }

                 if (arg) {
                     imports.push({
                         source: arg.text.replace(/['"]/g, ''),
                         type: 'dynamic',
                         specifiers: []
                     });
                 }
            } else {
                 // Check for require
                 const func = node.namedChildren[0]; 
                 if (func && func.text === 'require' && func.type === 'identifier') {
                      // CommonJS require
                      const argsNode = node.namedChildren.find(c => c.type === 'arguments');
                      if (argsNode) {
                          const arg = argsNode.namedChildren[0];
                          if (arg && arg.type === 'string') {
                              imports.push({
                                  source: arg.text.replace(/['"]/g, ''),
                                  type: 'require',
                                  specifiers: []
                              });
                          }
                      } else {
                          // Sometimes arguments are direct children depending on grammar
                          const arg = node.namedChildren[1]; 
                          if (arg && arg.type === 'string') {
                              imports.push({
                                  source: arg.text.replace(/['"]/g, ''),
                                  type: 'require',
                                  specifiers: []
                              });
                          }
                      }
                 }
            }
        }

        for (const child of node.namedChildren) {
            traverse(child);
        }
    }
    
    traverse(tree);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(imports, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to analyze imports', error as Error);
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

function processImportStatement(node: ASTNode): ImportItem[] {
    const items: ImportItem[] = [];
    const sourceNode = node.namedChildren.find(c => c.type === 'string');
    if (!sourceNode) return items; // Side-effect import might not have source if malformed? But import 'x' has source.

    const source = sourceNode.text.replace(/['"]/g, '');
    const isTypeOnly = node.children.some(c => c.text === 'type' && c.type !== 'string'); // simplistic type check

    const specifiers: string[] = [];
    
    // Import clause
    const clause = node.namedChildren.find(c => c.type === 'import_clause');
    if (clause) {
        // e.g. import default, { named } from ...
        // clause children: identifier (default), named_imports, namespace_import
        
        for (const child of clause.namedChildren) {
             if (child.type === 'identifier') {
                 specifiers.push(child.text); // Default
             } else if (child.type === 'named_imports') {
                 for (const imp of child.namedChildren) {
                      if (imp.type === 'import_specifier') {
                          // imported name or alias
                          // { x } or { x as y }
                          // If aliased, we want the imported name? Or the local name? 
                          // Usually for dependencies, we care about WHAT is being imported (e.g. useEffect).
                          // But imported symbol is what matters for dependency tracking.
                          // Let's get the imported name.
                          const nameNode = imp.namedChildren[0]; // identifier
                          if (nameNode) specifiers.push(nameNode.text);
                      }
                 }
             } else if (child.type === 'namespace_import') {
                 // * as ns
                 specifiers.push('*');
             }
        }
    } else {
        // Side-effect import import 'mod'
        // No specifiers
    }

    items.push({
        source,
        type: 'static',
        specifiers,
        isTypeOnly
    });

    return items;
}
