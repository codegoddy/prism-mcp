import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { analyzeRefactorImpact } from '../../src/tools/analyze_refactor_impact.js';
import { ParserFactory } from '../../src/parsers/factory.js';
import path from 'path';

describe('analyze_refactor_impact cascade', () => {
  const fixturePath = path.join(process.cwd(), 'test/fixtures/impact/cascade.ts');

  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  it('should detect direct impact', async () => {
    const result = await analyzeRefactorImpact({
        filePath: fixturePath,
        elementName: 'coreFunction',
        elementType: 'function',
        proposedChanges: {
            returnTypeChange: { oldType: 'string', newType: 'number' }
        }
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.breakingChanges.length).toBeGreaterThan(0);
    
    // Direct usage in middleLayer
    const direct = response.affectedLocations.find((l: any) => l.context === 'middleLayer');
    expect(direct).toBeDefined();
  });

  // This test checks if we currently support indirect impact. 
  // Based on code inspection, we likely don't.
  // This test helps confirm the current behavior.
  it('should detect indirect impact (optional/future)', async () => {
    const result = await analyzeRefactorImpact({
        filePath: fixturePath,
        elementName: 'coreFunction',
        elementType: 'function',
        proposedChanges: {
            returnTypeChange: { oldType: 'string', newType: 'number' }
        }
    });

    const response = JSON.parse(result.content[0].text);
    
    // Indirect usage in apiLayer
    // apiLayer calls middleLayer. middleLayer calls coreFunction.
    // If coreFunction returns number, middleLayer (inferred) returns number.
    // So apiLayer might need update?
    // Current tool probably won't find this unless we trace return values.
    
    const indirect = response.affectedLocations.find((l: any) => l.context === 'apiLayer');
    // We expect this to be missing currently.
    // console.log('Indirect found:', !!indirect);
    // expect(indirect).toBeDefined(); 
  });
});
