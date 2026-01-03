import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserFactory } from '../../src/parsers/factory.js';
import { Language } from '../../src/parsers/base.js';
import { extractCode } from '../../src/tools/extract_code.js';

describe('extract_code', () => {
  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  describe('TypeScript', () => {
    it('should extract a specific function by name', async () => {
      const source = `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(x: number, y: number): number {
  return x * y;
}
`;

      // Write to a temp file for testing
      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_extract.ts');
      fs.writeFileSync(testFile, source);

      try {
        const result = await extractCode({
          filePath: testFile,
          elementName: 'add',
          elementType: 'function',
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);
        expect(response.code).toContain('export function add(a: number, b: number): number');
        expect(response.code).toContain('return a + b;');
        expect(response.metadata.elementName).toBe('add');
        expect(response.metadata.elementType).toBe('function');
      } finally {
        fs.unlinkSync(testFile);
      }
    });

    it('should extract a class by name', async () => {
      const source = `
export class Calculator {
  private result: number;

  constructor() {
    this.result = 0;
  }

  add(a: number, b: number): number {
    return a + b;
  }
}
`;

      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_extract_class.ts');
      fs.writeFileSync(testFile, source);

      try {
        const result = await extractCode({
          filePath: testFile,
          elementName: 'Calculator',
          elementType: 'class',
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);
        expect(response.code).toContain('export class Calculator');
        expect(response.code).toContain('add(a: number, b: number): number');
        expect(response.metadata.elementName).toBe('Calculator');
        expect(response.metadata.elementType).toBe('class');
      } finally {
        fs.unlinkSync(testFile);
      }
    });

    it('should extract code by line numbers', async () => {
      const source = `line 1
line 2
line 3
line 4
line 5`;

      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_extract_lines.ts');
      fs.writeFileSync(testFile, source);

      try {
        const result = await extractCode({
          filePath: testFile,
          startLine: 2,
          endLine: 4,
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);
        expect(response.code).toBe('line 2\nline 3\nline 4');
        expect(response.metadata.startLine).toBe(2);
        expect(response.metadata.endLine).toBe(4);
      } finally {
        fs.unlinkSync(testFile);
      }
    });

    it('should return error for non-existent element', async () => {
      const source = `
export function existingFunction(): void {
  console.log('exists');
}
`;

      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_extract_missing.ts');
      fs.writeFileSync(testFile, source);

      try {
        const result = await extractCode({
          filePath: testFile,
          elementName: 'nonExistentFunction',
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not found');
      } finally {
        fs.unlinkSync(testFile);
      }
    });
  });

  describe('Python', () => {
    it('should extract a Python function by name', async () => {
      const source = `
def calculate_sum(a: int, b: int) -> int:
    """Calculate the sum of two numbers."""
    result = a + b
    return result

def multiply(x: int, y: int) -> int:
    return x * y
`;

      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_extract_py.py');
      fs.writeFileSync(testFile, source);

      try {
        const result = await extractCode({
          filePath: testFile,
          elementName: 'calculate_sum',
          elementType: 'function',
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);
        expect(response.code).toContain('def calculate_sum(a: int, b: int) -> int:');
        expect(response.code).toContain('result = a + b');
        expect(response.code).toContain('return result');
        expect(response.metadata.elementName).toBe('calculate_sum');
        expect(response.metadata.elementType).toBe('function');
      } finally {
        fs.unlinkSync(testFile);
      }
    });

    it('should extract a Python class by name', async () => {
      const source = `
class DataProcessor:
    def __init__(self, data):
        self.data = data

    def process(self):
        return [item * 2 for item in self.data]

    def get_count(self):
        return len(self.data)
`;

      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_extract_py_class.py');
      fs.writeFileSync(testFile, source);

      try {
        const result = await extractCode({
          filePath: testFile,
          elementName: 'DataProcessor',
          elementType: 'class',
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);
        expect(response.code).toContain('class DataProcessor:');
        expect(response.code).toContain('def process(self):');
        expect(response.code).toContain('def get_count(self):');
        expect(response.metadata.elementName).toBe('DataProcessor');
        expect(response.metadata.elementType).toBe('class');
      } finally {
        fs.unlinkSync(testFile);
      }
    });
  });
});
