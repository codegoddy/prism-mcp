import { describe, it, expect } from 'vitest';
import { ControlFlowAnalyzer } from '../../src/ast/flow.js';
import { TypeScriptParser } from '../../src/parsers/typescript.js';
import { PythonParser } from '../../src/parsers/python.js';

describe('ControlFlowAnalyzer', () => {
  const analyzer = new ControlFlowAnalyzer();
  const tsParser = new TypeScriptParser();
  const pyParser = new PythonParser();

  describe('Cyclomatic Complexity', () => {
    it('should calculate complexity for TS function', () => {
      const code = `
        function test(x) {
          if (x > 0) {
            return x;
          } else if (x < 0) {
            return -x;
          }
          return 0;
        }
      `;
      const result = tsParser.parse(code);
      const complexity = analyzer.calculateComplexity(result.tree, 'typescript');
      // Base = 1, if = +1, else if (nested if) = +1 -> Total 3
      // Wait, 'else if' in TS is usually nested 'if_statement' in 'else_clause' or just chained.
      // Tree-sitter-typescript structure:
      // if_statement -> consequence, alternative (else_clause -> if_statement)
      expect(complexity).toBe(3);
    });

    it('should calculate complexity for Python function', () => {
      const code = `
def test(x):
    if x > 0:
        return x
    elif x < 0:
        return -x
    else:
        return 0
      `;
      const result = pyParser.parse(code);
      const complexity = analyzer.calculateComplexity(result.tree, 'python');
      // Base 1, if +1, elif +1 -> 3
      expect(complexity).toBe(3);
    });
    
    it('should handle boolean operators', () => {
        const code = `
        if (a && b || c) {}
        `;
        const result = tsParser.parse(code);
        const complexity = analyzer.calculateComplexity(result.tree, 'typescript');
        // Base 1, if +1, && +1, || +1 -> 4
        expect(complexity).toBe(4);
    });
  });

  describe('Dead Code Detection', () => {
      it('should find dead code after return in TS', () => {
          const code = `
          function test() {
              return;
              const x = 1;
              console.log(x);
          }
          `;
          const result = tsParser.parse(code);
          const dead = analyzer.findDeadCode(result.tree);
          expect(dead).toHaveLength(2);
          expect(dead[0].text).toContain('const x = 1');
      });

      it('should find dead code after raise in Python', () => {
          const code = `
def test():
    raise ValueError("error")
    print("unreachable")
          `;
          const result = pyParser.parse(code);
          const dead = analyzer.findDeadCode(result.tree);
          expect(dead).toHaveLength(1);
          expect(dead[0].text).toContain('print');
      });
  });
});
