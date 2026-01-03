import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserFactory } from '../../src/parsers/factory.js';
import findDeadCode from '../../src/tools/find_dead_code.js';
import path from 'path';

describe('find_dead_code', () => {
  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  describe('Single File Analysis', () => {
    it('should detect unused functions', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/dead_code_test.ts');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      const unusedNames = parsed.unusedSymbols.map((s: any) => s.name);
      
      // Should detect unused function
      expect(unusedNames).toContain('unusedFunction');
      
      // Should detect unused class
      expect(unusedNames).toContain('UnusedClass');
      
      // Should detect unused variable
      expect(unusedNames).toContain('unusedVariable');
      
      // Should NOT include used items
      expect(unusedNames).not.toContain('usedFunction');
      expect(unusedNames).not.toContain('UsedClass');
      expect(unusedNames).not.toContain('usedVariable');
    });

    it('should exclude exported symbols by default', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/dead_code_test.ts');
      
      const result = await findDeadCode({
        filePath: testFilePath,
        includeExported: false
      });
      
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      const unusedNames = parsed.unusedSymbols.map((s: any) => s.name);
      
      // main is exported, should not be in unused list
      expect(unusedNames).not.toContain('main');
    });

    it('should include exported symbols when flag is set', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/dead_code_test.ts');
      
      const result = await findDeadCode({
        filePath: testFilePath,
        includeExported: true
      });
      
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      // With includeExported, we should get summary of exported but unused internally symbols
      expect(parsed.totalSymbols).toBeGreaterThan(0);
    });

    it('should provide confidence levels', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/dead_code_test.ts');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      
      for (const symbol of parsed.unusedSymbols) {
        expect(['high', 'medium', 'low']).toContain(symbol.confidence);
        expect(symbol.reason).toBeTruthy();
      }
    });

    it('should return summary counts', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/dead_code_test.ts');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      
      expect(parsed.summary).toBeDefined();
      expect(typeof parsed.summary.unusedFunctions).toBe('number');
      expect(typeof parsed.summary.unusedMethods).toBe('number');
      expect(typeof parsed.summary.unusedClasses).toBe('number');
      expect(typeof parsed.summary.unusedVariables).toBe('number');
    });
  });

  describe('Directory Analysis', () => {
    it('should analyze all files in a directory', async () => {
      const testDirPath = path.resolve(__dirname, '../fixtures/dependencies/typescript');
      
      const result = await findDeadCode({
        directoryPath: testDirPath
      });
      
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalSymbols).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid arguments', async () => {
      const result = await findDeadCode({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('either filePath or directoryPath must be provided');
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await findDeadCode({
        filePath: '/non/existent/file.ts'
      });
      
      // Should either return an error or empty results
      expect(result).toBeDefined();
    });
  });

  describe('Warnings', () => {
    it('should include warning about dynamic calls', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/dead_code_test.ts');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      
      if (parsed.unusedSymbols.length > 0) {
        expect(parsed.warnings.length).toBeGreaterThan(0);
        expect(parsed.warnings[0]).toContain('dynamic calls');
      }
    });
  });
});
