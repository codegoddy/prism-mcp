import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mapTests from '../../src/tools/map_tests.js';
import { ParserFactory } from '../../src/parsers/factory.js';
import path from 'path';

describe('map_tests', () => {
  const sourcePath = path.join(process.cwd(), 'test/fixtures/mapping/source.ts');
  const testPath = path.join(process.cwd(), 'test/fixtures/mapping/source.test.ts');

  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  it('should map tests to exported functions', async () => {
    const result = await mapTests({ filePath: sourcePath });
    expect(result.isError).toBeFalsy();
    
    const mapping = JSON.parse(result.content[0].text);
    
    expect(mapping.sourceFile).toBe(sourcePath);
    expect(mapping.testFiles).toContain(testPath);
    
    // Check coverage for funcA
    const coverA = mapping.coverage['funcA'];
    expect(coverA).toBeDefined();
    expect(coverA.length).toBeGreaterThan(0);
    expect(coverA[0].testFile).toBe(testPath);
    expect(coverA[0].testName).toContain('should test funcA');
    
    // Check coverage for funcB
    const coverB = mapping.coverage['funcB'];
    expect(coverB).toBeDefined();
    expect(coverB.length).toBeGreaterThan(0);
    expect(coverB[0].testName).toContain('should test funcB');
  });
});
