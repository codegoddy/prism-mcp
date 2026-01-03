import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import detectFeatures from '../../src/tools/detect_features.js';
import { ParserFactory } from '../../src/parsers/factory.js';
import path from 'path';

describe('detect_features', () => {
  const fixturePath = path.join(process.cwd(), 'test/fixtures/feature_flag_test.ts');

  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  it('should detect process.env checks', async () => {
    const result = await detectFeatures({ filePath: fixturePath, patterns: ['process.env'] });
    expect(result.isError).toBeFalsy();
    
    const features = JSON.parse(result.content[0].text);
    // Expected: 
    // 1. if (process.env.NODE_ENV === 'production') (consequent and alternate)
    // 2. process.env.DEBUG ? ... (consequent and alternate)
    // 3. process.env.ENABLE_LOGGING && setupLogging() (consequent)
    
    // Total should be 5 hits (2 for if/else, 2 for ternary, 1 for binary)
    // Actually, detect_features pushes one entry per block.
    // So 1 feature for if, 1 feature for else, etc.
    // If logic is correct:
    // checkCondition called for consequent -> push
    // checkCondition called for alternate -> push
    
    const envFeatures = features.filter((f: any) => f.name === 'process.env');
    expect(envFeatures.length).toBeGreaterThanOrEqual(3);
    
    const prodCheck = envFeatures.find((f: any) => f.condition.includes('NODE_ENV') && f.gatedBlock.type === 'consequent');
    expect(prodCheck).toBeTruthy();
    expect(prodCheck.gatedBlock.range).toBeDefined();

    const devCheck = envFeatures.find((f: any) => f.condition.includes('NODE_ENV') && f.gatedBlock.type === 'alternate');
    expect(devCheck).toBeTruthy();
  });

  it('should detect custom flags', async () => {
    const result = await detectFeatures({ filePath: fixturePath, patterns: ['FLAGS', 'isUIEnabled'] });
    const features = JSON.parse(result.content[0].text);
    
    const flagFeatures = features.filter((f: any) => f.name === 'isUIEnabled');
    expect(flagFeatures).toHaveLength(1);
    expect(flagFeatures[0].gatedBlock.type).toBe('consequent');
  });

  it('should handle ternary expressions', async () => {
      const result = await detectFeatures({ filePath: fixturePath, patterns: ['process.env'] });
      const features = JSON.parse(result.content[0].text);
      
      const ternary = features.find((f: any) => f.condition.includes('DEBUG'));
      expect(ternary).toBeTruthy();
      // Should have consequent and alternate
      const ternaryConsequent = features.find((f: any) => f.condition.includes('DEBUG') && f.gatedBlock.type === 'consequent');
      const ternaryAlternate = features.find((f: any) => f.condition.includes('DEBUG') && f.gatedBlock.type === 'alternate');
      expect(ternaryConsequent).toBeTruthy();
      expect(ternaryAlternate).toBeTruthy();
  });
  
  it('should handle binary guards', async () => {
       const result = await detectFeatures({ filePath: fixturePath, patterns: ['process.env'] });
       const features = JSON.parse(result.content[0].text);
       
       const guard = features.find((f: any) => f.condition.includes('ENABLE_LOGGING'));
       expect(guard).toBeTruthy();
       expect(guard.gatedBlock.type).toBe('consequent');
  });
});
