import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { logger } from '../utils/logger.js';
import type { ASTNode } from '../types/ast.js';

interface ExportItem {
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'type' | 're-export' | 'unknown';
  signature?: string;
  members?: string[]; // For classes/interfaces
  source?: string; // For re-exports
  isDefault?: boolean;
}

export default async function getPublicSurface(args: Record<string, unknown>): Promise<ToolResponse> {
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
    logger.info('Analyzing public surface', { filePath });

    const parser = ParserFactory.getParserForFile(filePath);
    const result = await parser.parseFile(filePath);
    const tree = result.tree;

    const exports: ExportItem[] = [];
    
    // Traverse top-level nodes for exports
    for (const node of tree.namedChildren) {
        if (node.type === 'export_statement') {
            exports.push(...processExportStatement(node));
        } else if (node.type === 'export_clause') {
            // Note: export declaration usually wraps export clause in tree-sitter?
            // "export { x }" is an export_statement containing an export_clause in some grammars
            // Checking structure:
            // export_statement -> export_clause
        } 
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(exports, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to analyze public surface', error as Error);
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

function processExportStatement(node: ASTNode): ExportItem[] {
    const items: ExportItem[] = [];
    
    // Check if it's a default export
    const isDefault = node.children.some(c => c.text === 'default');

    // 1. Re-exports: export * from 'mod' or export { x } from 'mod'
    const sourceNode = node.namedChildren.find(c => c.type === 'string');
    if (sourceNode) {
        // It's a re-export from another module
        const isAll = node.children.some(c => c.text === '*');
        if (isAll) {
            items.push({
                name: '*',
                type: 're-export',
                source: sourceNode.text.replace(/['"]/g, ''),
            });
        } else {
            // export { x } from 'mod'
            const clause = node.namedChildren.find(c => c.type === 'export_clause');
            if (clause) {
                for (const specifier of clause.namedChildren) {
                     if (specifier.type === 'export_specifier') {
                         const children = specifier.namedChildren;
                         let name = specifier.text;
                         if (children.length >= 2 && children[1]) {
                             name = children[1].text; // exported name
                         }
                         items.push({
                             name,
                             type: 're-export',
                             source: sourceNode.text.replace(/['"]/g, ''),
                         });
                     }
                }
            }
        }
        return items;
    }

    // 2. Named structure exports: export class C {}, export function f() {}
    const declaration = node.namedChildren.find(c => 
        c.type === 'class_declaration' || 
        c.type === 'function_declaration' || 
        c.type === 'interface_declaration' || 
        c.type === 'type_alias_declaration' ||
        c.type === 'variable_declaration' ||
        c.type === 'lexical_declaration' // const/let
    );
    
    if (declaration) {
         items.push(...processDeclaration(declaration, isDefault));
         return items;
    }
    
    // 3. Export clauses: export { x, y }
    const clause = node.namedChildren.find(c => c.type === 'export_clause');
    if (clause) {
         for (const specifier of clause.namedChildren) {
             if (specifier.type === 'export_specifier') {
                 // name or { original as exported }
                 const children = specifier.namedChildren;
                 let name = specifier.text;
                 if (children.length >= 2 && children[1]) {
                     name = children[1].text; // exported name
                 }
                 items.push({
                     name,
                     type: 'variable', // Assumed, could be anything
                     signature: 'unknown'
                 });
             }
         }
         return items;
    }
    
    // 4. Default export expression: export default expression;
    if (isDefault) {
        // Can be declaration or expression
        // We already handled declarations above if they matched the types
        // So this block handles expressions (e.g. export default 123;)
        const child = node.namedChildren.find(c => c.type !== 'comment');
        if (child) {
             // Expression export
             items.push({
                name: 'default',
                type: 'unknown',
                isDefault: true,
                signature: child.text.substring(0, 50)
             });
        }
        return items;
    }

    return items;
}

function processDeclaration(node: ASTNode, isDefault: boolean): ExportItem[] {
    const items: ExportItem[] = [];

    if (node.type === 'variable_declaration' || node.type === 'lexical_declaration') {
        for (const decl of node.namedChildren) {
            if (decl.type === 'variable_declarator') {
                 const nameNode = decl.namedChildren[0];
                 if (nameNode) {
                    items.push({
                        name: nameNode.text,
                        type: 'variable',
                        isDefault
                    });
                 }
            }
        }
    } else if (node.type === 'function_declaration') {
        const nameNode = node.namedChildren.find(c => c.type === 'identifier');
        items.push({
            name: nameNode?.text || 'default',
            type: 'function',
            isDefault,
            signature: extractSignature(node)
        });
    } else if (node.type === 'class_declaration') {
        const nameNode = node.namedChildren.find(c => c.type === 'type_identifier' || c.type === 'identifier');
        items.push({
            name: nameNode?.text || 'default',
            type: 'class',
            isDefault,
            members: extractClassMembers(node)
        });
    } else if (node.type === 'interface_declaration') {
         const nameNode = node.namedChildren.find(c => c.type === 'type_identifier');
         items.push({
            name: nameNode?.text || 'default',
            type: 'interface',
            isDefault,
            members: extractClassMembers(node) // Similar structure usually
        });
    } else if (node.type === 'type_alias_declaration') {
        const nameNode = node.namedChildren.find(c => c.type === 'type_identifier');
        items.push({
            name: nameNode?.text || 'default',
            type: 'type',
            isDefault
        });
    }
    
    return items;
}

function extractSignature(node: ASTNode): string {
    // Reconstruct signature from params and return type
    const params = node.namedChildren.find(c => c.type === 'formal_parameters');
    const returnType = node.namedChildren.find(c => c.type === 'type_annotation'); // TS
    return `(${params?.text || ''})${returnType ? returnType.text : ''}`;
}

function extractClassMembers(node: ASTNode): string[] {
    const members: string[] = [];
    const body = node.namedChildren.find(c => c.type === 'class_body' || c.type === 'interface_body');
    if (!body) return members;

    for (const member of body.namedChildren) {
        // Filter private
        if (member.type === 'method_definition' || member.type === 'public_field_definition') {
             // Check modifiers
             const accessibility = member.children.find(c => c.type === 'accessibility_modifier');
             if (accessibility && accessibility.text !== 'public') continue;
             if (member.text.startsWith('#')) continue; // Private field

             const nameNode = member.namedChildren.find(c => c.type === 'property_identifier' || c.type === 'identifier');
             if (nameNode) {
                 members.push(nameNode.text);
             }
        }
    }
    return members;
}
