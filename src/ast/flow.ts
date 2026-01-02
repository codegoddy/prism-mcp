import type { ASTNode } from '../types/ast.js';

export interface BasicBlock {
  id: string;
  statements: ASTNode[];
  predecessors: string[];
  successors: string[];
  kind: 'entry' | 'exit' | 'normal' | 'condition';
  unreachable?: boolean;
}

export interface ControlFlowGraph {
  blocks: Map<string, BasicBlock>;
  entryBlockId: string;
  exitBlockId: string;
}

export class ControlFlowAnalyzer {
  calculateComplexity(node: ASTNode, language: string): number {
    let complexity = 1;
    
    const tsJsBranchNodes = new Set([
        'if_statement', 'for_statement', 'for_in_statement',
        'for_of_statement', 'while_statement', 'do_statement',
        'case_clause', 'catch_clause', 'ternary_expression',
        'binary_expression'
    ]);

    const pyBranchNodes = new Set([
        'if_statement', 'for_statement', 'while_statement',
        'elif_clause', 'except_clause', 'conditional_expression',
        'boolean_operator'
    ]);
    
    const branchNodes = language === 'python' ? pyBranchNodes : tsJsBranchNodes;

    const traverse = (n: ASTNode) => {
      if (branchNodes.has(n.type)) {
          if (n.type === 'binary_expression') { // TS/JS
              const operator = n.children[1]?.text;
              if (operator === '&&' || operator === '||') {
                  complexity++;
              }
          } else if (n.type === 'boolean_operator') { // Python
              const operator = n.children[1]?.text;
              if (operator === 'and' || operator === 'or') {
                  complexity++;
              }
          } else {
              complexity++;
          }
      }

      for (const child of n.children) {
        traverse(child);
      }
    };

    traverse(node);
    return complexity;
  }

  // Simplified CFG construction
  // This is a placeholder for a full CFG implementation which is quite complex
  // But we can detect some obvious dead code (statements after return/throw/break/continue)
  findDeadCode(node: ASTNode): ASTNode[] {
    const deadCode: ASTNode[] = [];

    const traverse = (n: ASTNode) => {
       if (n.type === 'block' || n.type === 'statement_block') {
           let foundTerminator = false;
           for (const stmt of n.namedChildren) {
               if (foundTerminator) {
                   deadCode.push(stmt);
                   continue;
               }
               
               if (this.isTerminator(stmt)) {
                   foundTerminator = true;
               }
           }
       }
       
       for (const child of n.namedChildren) {
           traverse(child);
       }
    };

    traverse(node);
    return deadCode;
  }

  private isTerminator(node: ASTNode): boolean {
      if (node.type === 'return_statement') return true;
      if (node.type === 'throw_statement') return true;
      if (node.type === 'break_statement') return true;
      if (node.type === 'continue_statement') return true;
      if (node.type === 'raise_statement') return true; // Python
      return false;
  }
}
