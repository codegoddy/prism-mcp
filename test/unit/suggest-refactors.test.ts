import { describe, it, expect } from 'vitest';
import suggestRefactors from '../../src/tools/suggest_refactors.js';
import path from 'path';
import type { RefactorSuggestion } from '../../src/types/ast.js';

describe('suggestRefactors', () => {
  it('should find duplicate code blocks', async () => {
    const filePath = path.resolve('test/fixtures/refactors/duplicates.ts');
    const result = await suggestRefactors({ filePath });

    expect(result.isError).toBeUndefined();
    const suggestions = JSON.parse(result.content[0].text) as RefactorSuggestion[];
    
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('extract_function');
    expect(suggestions[0].locations).toHaveLength(2);
  });
});
