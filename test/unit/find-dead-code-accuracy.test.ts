import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserFactory } from '../../src/parsers/factory.js';
import findDeadCode from '../../src/tools/find_dead_code.js';
import path from 'path';

describe('find_dead_code accuracy', () => {
  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  describe('Python (FastAPI & Pydantic)', () => {
    it('should NOT flag decorated functions as unused', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/framework_usage.py');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      const content = result.content[0];
      if (!content || !('text' in content) || !content.text) {
        throw new Error('No content in result');
      }
      const parsed = JSON.parse(content.text);
      const unusedNames = parsed.unusedSymbols.map((s: any) => s.name);
      
      // get_users and create_user should NOT be flagged (they have decorators)
      expect(unusedNames).not.toContain('get_users');
      expect(unusedNames).not.toContain('create_user');
      
      // unused_internal_function SHOULD be flagged
      expect(unusedNames).toContain('unused_internal_function');
      
      // used_function should NOT be flagged
      expect(unusedNames).not.toContain('used_function');
    });

    it('should NOT flag Pydantic Config classes as unused', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/framework_usage.py');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      const content = result.content[0];
      if (!content || !('text' in content) || !content.text) {
        throw new Error('No content in result');
      }
      const parsed = JSON.parse(content.text);
      const unusedNames = parsed.unusedSymbols.map((s: any) => s.name);
      
      // Config class should NOT be flagged
      expect(unusedNames).not.toContain('Config');
    });
  });

  describe('React (JSX)', () => {
    it('should NOT flag handlers used in JSX attributes as unused', async () => {
      const testFilePath = path.resolve(__dirname, '../fixtures/framework_usage.tsx');
      
      const result = await findDeadCode({
        filePath: testFilePath
      });
      
      expect(result.isError).toBeFalsy();
      const content = result.content[0];
      if (!content || !('text' in content) || !content.text) {
        throw new Error('No content in result');
      }
      const parsed = JSON.parse(content.text);
      const unusedNames = parsed.unusedSymbols.map((s: any) => s.name);
      
      // handleButtonClick is used in JSX, should NOT be flagged
      expect(unusedNames).not.toContain('handleButtonClick');
      
      // MyComponent is used as a JSX element, should NOT be flagged
      expect(unusedNames).not.toContain('MyComponent');
      
      // unusedHandler SHOULD be flagged
      expect(unusedNames).toContain('unusedHandler');
    });
  });
});
