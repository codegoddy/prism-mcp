import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserFactory } from '../../src/parsers/factory.js';
import findDeadCode from '../../src/tools/find_dead_code.js';
import path from 'path';

describe('find_dead_code False Positives Fix', () => {
  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  describe('Configuration String References', () => {
    it('should NOT flag classes referenced in config strings', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/config_references.py');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      const unusedNames = parsed.unusedSymbols.map((s: any) => s.name);
      
      // CorrelationFilter is referenced in LOGGING_CONFIG as 'app.core.logging_config.CorrelationFilter'
      // Should NOT be flagged
      expect(unusedNames).not.toContain('CorrelationFilter');
      
      // RegisteredMiddleware is referenced in MIDDLEWARE_CONFIG
      // Should NOT be flagged
      expect(unusedNames).not.toContain('RegisteredMiddleware');
      
      // AuthMiddleware is NOT referenced anywhere - SHOULD be flagged
      expect(unusedNames).toContain('AuthMiddleware');
      
      // cache_response decorator is never used - SHOULD be flagged
      expect(unusedNames).toContain('cache_response');
      
      // used_decorator is actually used - should NOT be flagged
      expect(unusedNames).not.toContain('used_decorator');
    });

    it('should report config references in warnings', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/config_references.py');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      
      // Should have found config references
      expect(parsed.configReferences.length).toBeGreaterThan(0);
      expect(parsed.configReferences).toContain('CorrelationFilter');
    });
  });

  describe('Middleware Lifecycle Methods', () => {
    it('should NOT flag dispatch methods in middleware classes', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/middleware_lifecycle.py');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      const unusedNames = parsed.unusedSymbols.map((s: any) => s.name);
      
      // dispatch is a framework lifecycle method - should NOT be flagged
      expect(unusedNames).not.toContain('dispatch');
      
      // __call__ is a Python magic method - should NOT be flagged
      expect(unusedNames).not.toContain('__call__');
      
      // process_request is a Django/middleware method - should NOT be flagged
      expect(unusedNames).not.toContain('process_request');
      
      // UnusedHelperClass is genuinely unused - SHOULD be flagged
      expect(unusedNames).toContain('UnusedHelperClass');
      
      // helper_method is in unused class - SHOULD be flagged
      expect(unusedNames).toContain('helper_method');
    });

    it('should correctly identify middleware classes', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/middleware_lifecycle.py');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      const unusedNames = parsed.unusedSymbols.map((s: any) => s.name);
      
      // LoggingMiddleware class should NOT be flagged (has Middleware in name)
      expect(unusedNames).not.toContain('LoggingMiddleware');
      
      // CustomFilter class should NOT be flagged (has Filter in name)
      expect(unusedNames).not.toContain('CustomFilter');
    });
  });

  describe('Confidence Levels', () => {
    it('should assign lower confidence to framework patterns', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/middleware_lifecycle.py');
      
      const result = await findDeadCode({
        filePath: testFilePath,
        includeExported: true
      });
      
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      
      // UnusedHelperClass should have high confidence
      const unusedHelper = parsed.unusedSymbols.find((s: any) => s.name === 'UnusedHelperClass');
      if (unusedHelper) {
        expect(unusedHelper.confidence).toBe('high');
      }
    });
  });
});
