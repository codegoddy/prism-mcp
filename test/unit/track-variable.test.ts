import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import trackVariable from '../../src/tools/track_variable.js';
import { ParserFactory } from '../../src/parsers/factory.js';

describe('track_variable', () => {
  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  it('should distinguish declarations, assignments, and reads', async () => {
    const code = `
export let counter = 0; // Declaration

export function increment() {
  counter++; // Assignment
  counter = counter + 1; // Assignment (LHS) + Read (RHS)
}

export function logCounter() {
  console.log(counter); // Read
}
`;
    const fs = require('fs');
    const path = require('path');
    const testFile = path.join(process.cwd(), 'test_vars.ts');
    fs.writeFileSync(testFile, code);

    try {
      const result = await trackVariable({
        variableName: 'counter',
        filePath: testFile
      });

      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      
      expect(response.variableName).toBe('counter');
      
      // We expect:
      // 1. let counter = 0 (Declaration)
      // 2. counter++ (Assignment)
      // 3. counter = (Assignment)
      // 4. = counter + 1 (Read)
      // 5. console.log(counter) (Read)
      
      const declarations = response.usages.filter((u: any) => u.type === 'declaration');
      const assignments = response.usages.filter((u: any) => u.type === 'assignment');
      const reads = response.usages.filter((u: any) => u.type === 'read');
      
      expect(declarations).toHaveLength(1);
      expect(assignments).toHaveLength(2);
      expect(reads.length).toBeGreaterThanOrEqual(2);
    } finally {
      fs.unlinkSync(testFile);
    }
  });

  it('should handle destructuring and scopes', async () => {
    const code = `
function test() {
  const { config } = { config: { id: 1 } }; // Declaration
  console.log(config); // Read
  
  const x = { config: 2 }; // Not a usage of variable 'config' (property name)
}
`;
     const fs = require('fs');
    const path = require('path');
    const testFile = path.join(process.cwd(), 'test_vars_destructuring.ts');
    fs.writeFileSync(testFile, code);

    try {
      const result = await trackVariable({
        variableName: 'config',
        filePath: testFile
      });

      const response = JSON.parse(result.content[0].text);
      const declarations = response.usages.filter((u: any) => u.type === 'declaration');
      const reads = response.usages.filter((u: any) => u.type === 'read');
      
      expect(declarations).toHaveLength(1);
      expect(reads).toHaveLength(1);
      
      // Should NOT include the property name in 'const x = { config: 2 }'
      expect(response.usages.length).toBe(2);
    } finally {
      fs.unlinkSync(testFile);
    }
  });

  it('should handle function parameters as declarations', async () => {
      const code = `
function process(data) { // Declaration
  return data + 1; // Read
}
`;
    const fs = require('fs');
    const path = require('path');
    const testFile = path.join(process.cwd(), 'test_vars_params.ts');
    fs.writeFileSync(testFile, code);

    try {
      const result = await trackVariable({
        variableName: 'data',
        filePath: testFile
      });

      const response = JSON.parse(result.content[0].text);
      const declarations = response.usages.filter((u: any) => u.type === 'declaration');
      
      expect(declarations).toHaveLength(1);
      expect(response.usages.length).toBe(2);
    } finally {
      fs.unlinkSync(testFile);
    }
  });
});
