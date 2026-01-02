import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserFactory } from '../../src/parsers/factory.js';
import { Language } from '../../src/parsers/base.js';
import type { ASTNode, SymbolDefinition } from '../../src/types/ast.js';
import {
  buildSymbolTable,
  findSymbolDefinition,
  findReferences,
} from '../../src/tools/find_callers.js';

describe('find_callers', () => {
  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  describe('Symbol Extraction', () => {
    it('should extract function definitions', async () => {
      const source = `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function calculate() {
  add(1, 2);
  multiply(3, 4);
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.ts');

      expect(symbols).toHaveLength(3);
      expect(symbols[0].name).toBe('add');
      expect(symbols[0].type).toBe('function');
      expect(symbols[1].name).toBe('multiply');
      expect(symbols[2].name).toBe('calculate');
    });

    it('should extract class definitions with methods', async () => {
      const source = `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  calculate(op: string): number {
    if (op === 'add') {
      return this.add(1, 2);
    }
    return this.subtract(3, 4);
  }
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.ts');

      const calculatorClass = symbols.find((s) => s.name === 'Calculator' && s.type === 'class');
      expect(calculatorClass).toBeDefined();

      const addMethod = symbols.find((s) => s.name === 'add' && s.type === 'method');
      expect(addMethod).toBeDefined();
      expect(addMethod?.className).toBe('Calculator');

      const subtractMethod = symbols.find((s) => s.name === 'subtract' && s.type === 'method');
      expect(subtractMethod).toBeDefined();

      const calculateMethod = symbols.find((s) => s.name === 'calculate' && s.type === 'method');
      expect(calculateMethod).toBeDefined();
    });

    it('should extract variable declarations', async () => {
      const source = `
const x = 10;
const y = 20;

export function sum() {
  return x + y;
}

export function getValue(val: number) {
  return x + val;
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.ts');

      const xVar = symbols.find((s) => s.name === 'x' && s.type === 'variable');
      expect(xVar).toBeDefined();
      expect(xVar?.type).toBe('variable');

      const yVar = symbols.find((s) => s.name === 'y' && s.type === 'variable');
      expect(yVar).toBeDefined();
    });
  });

  describe('Reference Finding', () => {
    it('should find direct function calls', async () => {
      const source = `
function helper() {
  console.log('helper called');
}

function main() {
  helper();
  helper();
  helper();
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.ts');
      const helperSymbol = symbols.find((s) => s.name === 'helper' && s.type === 'function');

      expect(helperSymbol).toBeDefined();

      const references = findReferences(result.tree, 'test.ts', helperSymbol as SymbolDefinition);

      expect(references).toHaveLength(3);
      expect(references[0].symbolId).toBe(helperSymbol?.id);
      expect(references[0].context.callType).toBe('direct');
      expect(references[0].context.parentFunction).toBe('main');
    });

    it('should find method calls', async () => {
      const source = `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}

class AdvancedCalculator extends Calculator {
  calculate(): number {
    return this.add(1, 2);
  }

  nested(): number {
    const calc = new Calculator();
    return calc.subtract(3, 4);
  }
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.ts');
      const addMethod = symbols.find((s) => s.name === 'add' && s.type === 'method');

      expect(addMethod).toBeDefined();

      const references = findReferences(result.tree, 'test.ts', addMethod as SymbolDefinition);

      expect(references.length).toBeGreaterThan(0);
      const methodCall = references.find((r) => r.context.callType === 'method');
      expect(methodCall).toBeDefined();
      expect(methodCall?.context.parentFunction).toBe('calculate');
    });

    it('should find callback references', async () => {
      const source = `
function processData(callback: (value: number) => void) {
  callback(42);
}

function logValue(value: number) {
  console.log(value);
}

function main() {
  processData(logValue);
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.ts');
      const logValueFunc = symbols.find((s) => s.name === 'logValue' && s.type === 'function');

      expect(logValueFunc).toBeDefined();

      const references = findReferences(result.tree, 'test.ts', logValueFunc as SymbolDefinition);

      expect(references.length).toBeGreaterThan(0);
      const callbackRef = references.find((r) => r.context.callType === 'callback');
      expect(callbackRef).toBeDefined();
      expect(callbackRef?.context.parentFunction).toBe('main');
    });

    it('should find variable references', async () => {
      const source = `
const MAX_VALUE = 100;

export function checkValue(value: number): boolean {
  if (value > MAX_VALUE) {
    return false;
  }
  return value >= 0;
}

export function normalize(value: number): number {
  const ratio = value / MAX_VALUE;
  return ratio;
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.ts');
      const maxVar = symbols.find((s) => s.name === 'MAX_VALUE' && s.type === 'variable');

      expect(maxVar).toBeDefined();

      const references = findReferences(result.tree, 'test.ts', maxVar as SymbolDefinition);

      expect(references.length).toBeGreaterThan(0);
      expect(references.some((r) => r.context.parentFunction === 'checkValue')).toBe(true);
      expect(references.some((r) => r.context.parentFunction === 'normalize')).toBe(true);
    });

    it('should handle method chaining', async () => {
      const source = `
class DataProcessor {
  transform(data: string): string {
    return data.toUpperCase();
  }

  validate(data: string): boolean {
    return data.length > 0;
  }
}

class Pipeline {
  process(input: string): string {
    const processor = new DataProcessor();
    const transformed = processor.transform(input);
    return processor.validate(transformed) ? transformed : '';
  }
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.ts');
      const transformMethod = symbols.find((s) => s.name === 'transform' && s.type === 'method');

      expect(transformMethod).toBeDefined();

      const references = findReferences(
        result.tree,
        'test.ts',
        transformMethod as SymbolDefinition
      );

      expect(references).toHaveLength(1);
      expect(references[0].context.callType).toBe('method');
      expect(references[0].context.parentFunction).toBe('process');
    });
  });

  describe('Python Support', () => {
    it('should extract Python class methods', async () => {
      const source = `
class Calculator:
    def add(self, a, b):
        return a + b

    def subtract(self, a, b):
        return a - b

    def calculate(self):
        return self.add(1, 2)
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.py');

      const calculatorClass = symbols.find((s) => s.name === 'Calculator' && s.type === 'class');
      expect(calculatorClass).toBeDefined();

      const addMethod = symbols.find((s) => s.name === 'add' && s.type === 'method');
      expect(addMethod).toBeDefined();
      expect(addMethod?.className).toBe('Calculator');
    });

    it('should find Python function calls', async () => {
      const source = `
def helper():
    print("helper called")

def main():
    helper()
    helper()
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.py');
      const helperFunc = symbols.find((s) => s.name === 'helper' && s.type === 'function');

      expect(helperFunc).toBeDefined();

      const references = findReferences(result.tree, 'test.py', helperFunc as SymbolDefinition);

      expect(references).toHaveLength(2);
      expect(references[0].symbolId).toBe(helperFunc?.id);
    });
  });

  describe('Edge Cases', () => {
    it('should handle functions with no callers', async () => {
      const source = `
export function unused(): void {
  console.log('This is never called');
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.ts');
      const unusedFunc = symbols.find((s) => s.name === 'unused' && s.type === 'function');

      expect(unusedFunc).toBeDefined();

      const references = findReferences(result.tree, 'test.ts', unusedFunc as SymbolDefinition);

      expect(references).toHaveLength(0);
    });

    it('should handle recursive function calls', async () => {
      const source = `
export function factorial(n: number): number {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.ts');
      const factorialFunc = symbols.find((s) => s.name === 'factorial' && s.type === 'function');

      expect(factorialFunc).toBeDefined();

      const references = findReferences(result.tree, 'test.ts', factorialFunc as SymbolDefinition);

      expect(references).toHaveLength(1);
      expect(references[0].context.parentFunction).toBe('factorial');
    });

    it('should handle overloaded methods (same name, different classes)', async () => {
      const source = `
class A {
  process(): void {
    console.log('A.process');
  }
}

class B {
  process(): void {
    console.log('B.process');
  }
}

class C extends A {
  process(): void {
    const b = new B();
    this.process();
    b.process();
  }
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const symbols = extractSymbolsFromTree(result.tree, 'test.ts');

      const aProcess = symbols.find((s) => s.name === 'process' && s.className === 'A');
      const bProcess = symbols.find((s) => s.name === 'process' && s.className === 'B');

      expect(aProcess).toBeDefined();
      expect(bProcess).toBeDefined();

      const aRefs = findReferences(result.tree, 'test.ts', aProcess as SymbolDefinition);
      const bRefs = findReferences(result.tree, 'test.ts', bProcess as SymbolDefinition);

      expect(aRefs.length).toBeGreaterThan(0);
      expect(bRefs.length).toBeGreaterThan(0);
    });
  });
});

// Helper function to extract symbols from a tree
function extractSymbolsFromTree(root: ASTNode, filePath: string): SymbolDefinition[] {
  const symbols: SymbolDefinition[] = [];

  function extractName(node: ASTNode): string {
    for (const child of node.namedChildren) {
      if (child.type === 'identifier' || child.type === 'property_identifier') {
        return child.text;
      }
    }
    return '';
  }

  function extractClassName(node: ASTNode): string {
    for (const child of node.namedChildren) {
      if (child.type === 'type_identifier' || child.type === 'identifier') {
        return child.text;
      }
    }
    return '';
  }

  function generateSymbolId(symbol: Partial<SymbolDefinition>, parentFunction?: string): string {
    const parts = [symbol.type, symbol.name];

    if (symbol.className) {
      parts.push(symbol.className);
    }

    if (parentFunction) {
      parts.push(parentFunction);
    }

    if (symbol.filePath) {
      parts.push(symbol.filePath);
    }

    return parts.join(':');
  }

  function traverse(node: ASTNode, parentClass?: string, parentFunction?: string): void {
    switch (node.type) {
      case 'function_declaration':
      case 'function_definition':
        const isMethod = parentClass !== undefined;
        symbols.push({
          id: generateSymbolId({
            name: extractName(node),
            className: parentClass,
            filePath,
            type: isMethod ? 'method' : 'function',
          }),
          name: extractName(node),
          type: isMethod ? 'method' : 'function',
          className: parentClass,
          filePath,
          startPosition: node.startPosition,
          endPosition: node.endPosition,
          isExported: node.children.some(
            (child) => child.type === 'export' || child.type === 'export_statement'
          ),
        });
        break;

      case 'method_definition':
        symbols.push({
          id: generateSymbolId({
            name: extractName(node),
            className: parentClass,
            filePath,
            type: 'method',
          }),
          name: extractName(node),
          type: 'method',
          className: parentClass,
          filePath,
          startPosition: node.startPosition,
          endPosition: node.endPosition,
        });
        break;

      case 'class_declaration':
      case 'class_definition': {
        const className = extractClassName(node);
        symbols.push({
          id: generateSymbolId({ name: className, filePath, type: 'class' }),
          name: className,
          type: 'class',
          filePath,
          startPosition: node.startPosition,
          endPosition: node.endPosition,
        });

        break;
      }

      case 'variable_declaration':
      case 'lexical_declaration':
        for (const declarator of node.namedChildren.filter(
          (n) => n.type === 'variable_declarator'
        )) {
          const varName = extractName(declarator);
          if (varName) {
            symbols.push({
              id: generateSymbolId({ name: varName, filePath, type: 'variable' }),
              name: varName,
              type: 'variable',
              filePath,
              startPosition: declarator.startPosition,
              endPosition: declarator.endPosition,
              isExported: declarator.children?.some(
                (c) => c.type === 'export' || c.type === 'export_statement'
              ),
            });
          }
        }
        break;

      case 'decorated_definition':
        for (const decChild of node.namedChildren) {
          traverse(decChild, parentClass, parentFunction);
        }
        break;
    }

    for (const child of node.namedChildren) {
      let nextParentClass = parentClass;
      if (node.type === 'class_declaration' || node.type === 'class_definition') {
        nextParentClass = extractClassName(node);
      }
      traverse(child, nextParentClass, parentFunction ?? extractName(node));
    }
  }

  traverse(root);
  return symbols;
}
