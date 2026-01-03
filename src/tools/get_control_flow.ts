import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { logger } from '../utils/logger.js';
import type { ASTNode } from '../types/ast.js';

interface CFGNode {
  id: string;
  type: 'entry' | 'exit' | 'normal' | 'condition' | 'loop' | 'exception';
  label: string;
  statements: string[];
}

interface CFGEdge {
  from: string;
  to: string;
  label?: string; // e.g., 'true', 'false', 'exception'
}

interface ControlFlowGraph {
  nodes: CFGNode[];
  edges: CFGEdge[];
}

export default async function getControlFlow(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath, functionName } = args;

  if (typeof filePath !== 'string' || typeof functionName !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: filePath and functionName must be provided',
        },
      ],
      isError: true,
    };
  }

  try {
    logger.info('Analyzing control flow', { filePath, functionName });

    const parser = ParserFactory.getParserForFile(filePath);
    const result = await parser.parseFile(filePath);

    const functionNode = findFunctionNode(result.tree, functionName);

    if (!functionNode) {
      return {
        content: [
          {
            type: 'text',
            text: `Function '${functionName}' not found in ${filePath}`,
          },
        ],
        isError: true,
      };
    }

    const cfg = buildCFG(functionNode, filePath);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(cfg, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to analyze control flow', error as Error);
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

function findFunctionNode(root: ASTNode, name: string): ASTNode | null {
  let found: ASTNode | null = null;

  function traverse(node: ASTNode) {
    if (found) return;

    if (
        (node.type === 'function_declaration' ||
         node.type === 'function_definition' ||
         node.type === 'method_definition')
    ) {
        // Check name
        const nameNode = node.namedChildren.find(c => c.type === 'identifier' || c.type === 'property_identifier');
        if (nameNode && nameNode.text === name) {
            found = node;
            return;
        }
    }
    
    // Also check variable declarations: const f = () => {}
    if (node.type === 'variable_declarator') {
        const nameNode = node.namedChildren[0]; // identifier
        const valueNode = node.namedChildren[1]; // arrow_function, function expression
        
        if (nameNode && nameNode.text === name && valueNode) {
             if (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression') {
                 found = valueNode;
                 return;
             }
        }
    }

    for (const child of node.namedChildren) {
      traverse(child);
    }
  }

  traverse(root);
  return found;
}

function buildCFG(functionNode: ASTNode, _filePath?: string): ControlFlowGraph {
  const nodes: CFGNode[] = [];
  const edges: CFGEdge[] = [];
  let nodeIdCounter = 0;

  function createNode(type: CFGNode['type'], label = ''): CFGNode {
    const id = `block_${nodeIdCounter++}`;
    const node: CFGNode = { id, type, label, statements: [] };
    nodes.push(node);
    return node;
  }

  function addEdge(from: CFGNode, to: CFGNode, label?: string) {
    edges.push({ from: from.id, to: to.id, label });
  }

  const entryNode = createNode('entry', 'Start');
  const exitNode = createNode('exit', 'End');

  // Find the body block
  const bodyNode = functionNode.namedChildren.find(c => c.type === 'statement_block' || c.type === 'block'); 
  
  if (!bodyNode) {
      // Expression body (e.g. arrow function without block)
      const exprBody = functionNode.namedChildren.find(c => c.type !== 'identifier' && c.type !== 'formal_parameters');
      if (exprBody) {
          const bodyBlock = createNode('normal', 'Body');
          addEdge(entryNode, bodyBlock);
          bodyBlock.statements.push(exprBody.text);
          addEdge(bodyBlock, exitNode);
      } else {
          addEdge(entryNode, exitNode);
      }
      return { nodes, edges };
  }

  // Recursive construction
  // Returns the node(s) that 'exit' this structure and should connect to the NEXT structure
  function processBlock(astNodes: ASTNode[], entry: CFGNode): CFGNode[] {
      let currentBlock = entry;

      for (let i = 0; i < astNodes.length; i++) {
          const stmt = astNodes[i];
          if (!stmt) continue;
          
          if (stmt.type === 'if_statement') {
              // Finish current block
              // Create condition block
              const conditionBlock = createNode('condition', 'If Condition');
              // Condition node usually gets the condition expression text
              const parenExpr = stmt.namedChildren.find(c => c.type === 'parenthesized_expression');
              const condition = parenExpr?.namedChildren[0]?.text || parenExpr?.text || 'condition';
              conditionBlock.label = condition;
              
              addEdge(currentBlock, conditionBlock);
              
              const consequent = stmt.namedChildren.find(c => c.type === 'statement_block' || (c.type !== 'parenthesized_expression' && c.type !== 'else_clause'));
              const alternative = stmt.namedChildren.find(c => c.type === 'else_clause');

              // Process Then
              const thenStart = createNode('normal', 'Then');
              addEdge(conditionBlock, thenStart, 'true');
              
              // Handle block vs single statement
              let thenEnd: CFGNode[] = [];
              if (consequent?.type === 'statement_block') {
                  thenEnd = processBlock(consequent.namedChildren, thenStart);
              } else if (consequent) {
                  // Single statement
                  thenStart.statements.push(consequent.text);
                   // If it's a return/throw, it might not connect to join
                   if (consequent.type === 'return_statement' || consequent.type === 'throw_statement') {
                        processControlStatement(consequent, thenStart);
                        thenEnd = [];
                   } else {
                        thenEnd = [thenStart];
                   }
              }

              // Process Else
              let elseEnd: CFGNode[] = [];
              if (alternative) {
                   const elseStart = createNode('normal', 'Else');
                   addEdge(conditionBlock, elseStart, 'false');
                   
                   const elseBody = alternative.namedChildren.find(c => c.type === 'statement_block' || c.type === 'if_statement') || alternative.namedChildren[0]; // simplistic finding
                   
                   if (elseBody?.type === 'statement_block') {
                       elseEnd = processBlock(elseBody.namedChildren, elseStart);
                   } else if (elseBody) {
                       // Single statement or if chain
                       if (elseBody.type === 'if_statement') {
                           // chained if/else if
                           elseEnd = processBlock([elseBody], elseStart);
                       } else {
                           elseStart.statements.push(elseBody.text);
                            if (elseBody.type === 'return_statement' || elseBody.type === 'throw_statement') {
                                processControlStatement(elseBody, elseStart);
                                elseEnd = [];
                            } else {
                                elseEnd = [elseStart];
                            }
                       }
                   }
              } else {
                  // Connect false directly to join
                  elseEnd = [conditionBlock]; // Special case: condition false goes to join
              }

              // Create Join block for next statements
              const joinBlock = createNode('normal', 'Join');
              
              [...thenEnd, ...elseEnd].forEach(node => {
                  // if elseEnd contains conditionBlock (no else case), label is false
                  if (node === conditionBlock) {
                      addEdge(node, joinBlock, 'false');
                  } else {
                      addEdge(node, joinBlock);
                  }
              });

              currentBlock = joinBlock;

          } else if (stmt.type === 'return_statement') {
              currentBlock.statements.push(stmt.text);
              addEdge(currentBlock, exitNode);
              return []; // Control flow ends here (dead code follows if any)
          } else if (stmt.type === 'throw_statement') {
              currentBlock.statements.push(stmt.text);
              const exceptionNode = createNode('exception', 'Throw');
              addEdge(currentBlock, exceptionNode);
              addEdge(exceptionNode, exitNode, 'exception'); // Connect to exit for now, could find catch
              return [];
          } else {
              // Normal statement
              currentBlock.statements.push(stmt.text);
          }
      }
      
      return [currentBlock];
  }
  
  function processControlStatement(stmt: ASTNode, block: CFGNode) {
      if (stmt.type === 'return_statement') {
          addEdge(block, exitNode);
      } else if (stmt.type === 'throw_statement') {
          const ex = createNode('exception');
          addEdge(block, ex);
          addEdge(ex, exitNode, 'exception');
      }
  }

  const startBlock = createNode('normal', 'Body Start');
  addEdge(entryNode, startBlock);
  
  const endBlocks = processBlock(bodyNode.namedChildren, startBlock);
  endBlocks.forEach(block => addEdge(block, exitNode));

  return { nodes, edges };
}
