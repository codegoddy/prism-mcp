import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserFactory } from '../../src/parsers/factory.js';
import findDeadCode from '../../src/tools/find_dead_code.js';
import path from 'path';

describe('find_dead_code Framework Awareness', () => {
  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  describe('React Support', () => {
    it('should NOT flag React lifecycle methods as unused', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/react_dead_code.tsx');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      const unusedNames = parsed.unusedSymbols.map((s: any) => s.name);
      
      // Framework methods should NOT be in the list
      expect(unusedNames).not.toContain('constructor');
      expect(unusedNames).not.toContain('componentDidMount');
      expect(unusedNames).not.toContain('componentDidCatch');
      expect(unusedNames).not.toContain('render');
      
      // Internal unused should be flagged
      expect(unusedNames).toContain('unusedInternal');
      expect(unusedNames).toContain('unusedMethod');
    });

    it('should NOT flag shorthand property variables as unused', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/react_dead_code.tsx');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      const parsed = JSON.parse(result.content[0].text);
      const unusedNames = parsed.unusedSymbols.map((s: any) => s.name);
      
      // zIndex is used in { zIndex } shorthand
      expect(unusedNames).not.toContain('zIndex');
    });
  });

  describe('Python Support', () => {
    it('should NOT flag Python magic methods as unused', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/python_dead_code.py');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      const unusedNames = parsed.unusedSymbols.map((s: any) => s.name);
      
      // Magic methods should NOT be in the list
      expect(unusedNames).not.toContain('__init__');
      expect(unusedNames).not.toContain('__str__');
      expect(unusedNames).not.toContain('__repr__');
      
      // Internal unused should be flagged
      expect(unusedNames).toContain('unused_method');
      
      // Used should not be flagged
      expect(unusedNames).not.toContain('used_method');
      expect(unusedNames).not.toContain('main');
    });
  });
});
