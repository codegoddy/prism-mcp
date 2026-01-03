import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import getImports from '../../src/tools/get_imports.js';
import { ParserFactory } from '../../src/parsers/factory.js';
import path from 'path';

describe('get_imports', () => {
  const fixturePath = path.join(process.cwd(), 'test/fixtures/import_test.ts');

  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  it('should extract static imports', async () => {
    const result = await getImports({ filePath: fixturePath });
    expect(result.isError).toBeFalsy();
    
    const imports = JSON.parse(result.content[0].text);
    
    // React
    const react = imports.find((i: any) => i.source === 'react');
    expect(react).toBeTruthy();
    expect(react.type).toBe('static');
    expect(react.specifiers).toContain('useState');
    expect(react.specifiers).toContain('React'); // Default import

    // Namespace
    const utils = imports.find((i: any) => i.source === './utils.js');
    expect(utils).toBeTruthy();
    expect(utils.specifiers).toContain('*');
  });

  it('should extract type-only imports', async () => {
    const result = await getImports({ filePath: fixturePath });
    const imports = JSON.parse(result.content[0].text);
    
    const types = imports.find((i: any) => i.source === './types.js');
     // Note: Tree-sitter might check 'type' keyword on import statement, ensuring logic covers it
    expect(types).toBeTruthy();
    expect(types.isTypeOnly).toBe(true);
  });

  it('should extract require calls', async () => {
    const result = await getImports({ filePath: fixturePath });
    const imports = JSON.parse(result.content[0].text);
    
    const legacy = imports.find((i: any) => i.source === './legacy.js');
    expect(legacy).toBeTruthy();
    expect(legacy.type).toBe('require');
    
    const pathMod = imports.find((i: any) => i.source === 'path');
    expect(pathMod).toBeTruthy();
    expect(pathMod.type).toBe('require');
  });
  
  it('should extract dynamic imports', async () => {
      const result = await getImports({ filePath: fixturePath });
      const imports = JSON.parse(result.content[0].text);
      
      const dynamic = imports.find((i: any) => i.source === './dynamic.js');
      expect(dynamic).toBeTruthy();
      expect(dynamic.type).toBe('dynamic');
  });
});
