import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { logger } from '../utils/logger.js';
import type { ASTNode } from '../types/ast.js';

interface DetectedFeature {
  name: string;
  condition: string;
  range: {
      start: { line: number, column: number };
      end: { line: number, column: number };
  };
  gatedBlock: {
      type: 'consequent' | 'alternate';
      range: {
          start: { line: number, column: number };
          end: { line: number, column: number };
      };
  };
}

export default async function detectFeatures(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath, patterns = ['process.env'] } = args;

  if (typeof filePath !== 'string') {
    return {
      content: [{ type: 'text', text: 'Invalid arguments: filePath is required' }],
      isError: true,
    };
  }
  
  const searchPatterns = Array.isArray(patterns) ? patterns : [patterns as string];

  try {
    logger.info('Detecting features', { filePath, patterns: searchPatterns });

    const parser = ParserFactory.getParserForFile(filePath);
    const result = await parser.parseFile(filePath);
    const tree = result.tree;

    const features: DetectedFeature[] = [];

    function checkCondition(conditionNode: ASTNode, blockType: 'consequent' | 'alternate', blockNode: ASTNode) {
        // Check if condition contains any of the search patterns
        const conditionText = conditionNode.text;
        
        for (const pattern of searchPatterns) {
            if (conditionText.includes(pattern)) {
                features.push({
                    name: pattern,
                    condition: conditionText,
                    range: {
                        start: { line: conditionNode.startPosition.row + 1, column: conditionNode.startPosition.column + 1 },
                        end: { line: conditionNode.endPosition.row + 1, column: conditionNode.endPosition.column + 1 }
                    },
                    gatedBlock: {
                        type: blockType,
                        range: {
                            start: { line: blockNode.startPosition.row + 1, column: blockNode.startPosition.column + 1 },
                            end: { line: blockNode.endPosition.row + 1, column: blockNode.endPosition.column + 1 }
                        }
                    }
                });
                break; 
            }
        }
    }

    function traverse(node: ASTNode) {
        if (node.type === 'if_statement') {
            // ... (structure detection logic)
            // condition, consequent, alternate
            // condition is usually wrapped in parenthesized_expression
            
            let conditionNode: ASTNode | undefined;
            let consequentNode: ASTNode | undefined;
            let alternateNode: ASTNode | undefined;
            
            // Try to find named children first
            const parenExpr = node.namedChildren.find(c => c.type === 'parenthesized_expression');
            if (parenExpr) {
                conditionNode = parenExpr.namedChildren[0] || parenExpr.children[1]; // children[0] is '('
            }

            // If not found via namedChildren, traverse children
            if (!conditionNode) {
                 const p = node.children.find(c => c.type === 'parenthesized_expression');
                 if (p) conditionNode = p.namedChildren[0];
            }

            // Find consequent (first statement after condition)
            // It is usually the named child after the parenthesized expression
            // OR if logic above failed, just use index.
            // if (cond) cons else alt
            // 0: paren
            // 1: cons
            // 2: else clause (optional)
            
            if (node.namedChildren.length >= 2) {
                 // re-evaluate based on indices for reliability
                 const c = node.namedChildren[0]!;
                 if (c.type === 'parenthesized_expression') {
                     conditionNode = c.namedChildren[0];
                     consequentNode = node.namedChildren[1];
                     
                     if (node.namedChildren.length > 2) {
                         const third = node.namedChildren[2];
                         if (third && third.type === 'else_clause') {
                             alternateNode = third.namedChildren[0];
                         }
                     }
                 }
            }
            
            if (conditionNode && consequentNode) {
                checkCondition(conditionNode, 'consequent', consequentNode);
            }
            if (conditionNode && alternateNode) {
                checkCondition(conditionNode, 'alternate', alternateNode);
            }

        } else if (node.type === 'ternary_expression') {
            const convert = node.namedChildren;
            if (convert.length >= 3) {
                const ternaryCondition = convert[0]!; // Avoid variable shadowing
                const consequent = convert[1]!;
                const alternate = convert[2]!;
                
                checkCondition(ternaryCondition, 'consequent', consequent);
                checkCondition(ternaryCondition, 'alternate', alternate);
            }
        } else if (node.type === 'binary_expression') {
             // left && right
             const operator = node.children.find(c => c.type === '&&' || c.text === '&&');
             if (operator) {
                 const left = node.namedChildren[0];
                 const right = node.namedChildren[1];
                 if (left && right) {
                     checkCondition(left, 'consequent', right);
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
          text: JSON.stringify(features, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to detect features', error as Error);
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
