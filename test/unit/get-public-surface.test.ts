import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import getPublicSurface from '../../src/tools/get_public_surface.js';
import { ParserFactory } from '../../src/parsers/factory.js';
import path from 'path';

describe('get_public_surface', () => {
  const fixturePath = path.join(process.cwd(), 'test/fixtures/public_api_test.ts');

  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  it('should extract named exports', async () => {
    const result = await getPublicSurface({ filePath: fixturePath });
    expect(result.isError).toBeFalsy();
    
    const exports = JSON.parse(result.content[0].text);
    
    // Check const version
    const version = exports.find((e: any) => e.name === 'version');
    expect(version).toBeTruthy();
    expect(version.type).toBe('variable');

    // Check function add
    const add = exports.find((e: any) => e.name === 'add');
    expect(add).toBeTruthy();
    expect(add.type).toBe('function');
  });

  it('should extract class public members', async () => {
    const result = await getPublicSurface({ filePath: fixturePath });
    const exports = JSON.parse(result.content[0].text);
    
    const calculator = exports.find((e: any) => e.name === 'Calculator');
    expect(calculator).toBeTruthy();
    expect(calculator.type).toBe('class');
    
    // Should have 'result' and 'add'
    expect(calculator.members).toContain('result');
    expect(calculator.members).toContain('add');
    
    // Should NOT have 'cache' or 'internalMethod'
    expect(calculator.members).not.toContain('cache');
    expect(calculator.members).not.toContain('internalMethod');
  });

  it('should handle default exports', async () => {
    const result = await getPublicSurface({ filePath: fixturePath });
    const exports = JSON.parse(result.content[0].text);
    
    const def = exports.find((e: any) => e.isDefault);
    expect(def).toBeTruthy();
    expect(def.type).toBe('function');
  });
  
  it('should handle re-exports and aliases', async () => {
      const result = await getPublicSurface({ filePath: fixturePath });
      const exports = JSON.parse(result.content[0].text);
      
      const sum = exports.find((e: any) => e.name === 'sum');
      expect(sum).toBeTruthy();
      
      const wild = exports.find((e: any) => e.type === 're-export' && e.name === '*');
      expect(wild).toBeTruthy();
      expect(wild.source).toBe('./other_module');
  });
});
