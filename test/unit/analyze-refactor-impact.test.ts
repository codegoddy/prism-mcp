import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserFactory } from '../../src/parsers/factory.js';
import { Language } from '../../src/parsers/base.js';
import { analyzeRefactorImpact } from '../../src/tools/analyze_refactor_impact.js';

describe('analyze_refactor_impact', () => {
  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  describe('Function signature changes', () => {
    it('should analyze return type change impact', async () => {
      const source = `
export function authenticateUser(credentials: LoginCredentials): User {
  // Authenticate user logic
  return { id: 1, name: 'John', email: 'john@example.com' };
}

export function handleLogin(req: Request, res: Response): void {
  const user = authenticateUser(req.body.credentials);
  res.json({ user });
}

export function processUser(user: User): string {
  return \`Processing user: \${user.name}\`;
}
`;

      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_refactor_impact.ts');
      fs.writeFileSync(testFile, source);

      try {
        const result = await analyzeRefactorImpact({
          filePath: testFile,
          elementName: 'authenticateUser',
          elementType: 'function',
          proposedChanges: {
            returnTypeChange: {
              oldType: 'User',
              newType: '{ user: User; token: string }',
            },
          },
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);

        expect(response.targetElement.name).toBe('authenticateUser');
        expect(response.totalReferences).toBeGreaterThan(0);
        expect(response.breakingChanges).toContain(
          'Return type changed from User to { user: User; token: string } - callers expecting User will break'
        );
        expect(response.riskLevel).toBe('medium');
        expect(response.affectedLocations.length).toBeGreaterThan(0);
      } finally {
        fs.unlinkSync(testFile);
      }
    });

    it('should analyze parameter removal impact', async () => {
      const source = `
export function calculateTotal(items: Item[], taxRate: number): number {
  return items.reduce((sum, item) => sum + item.price, 0) * (1 + taxRate);
}

export function processOrder(): void {
  const items = [{ price: 10 }, { price: 20 }];
  const total = calculateTotal(items, 0.08);
  console.log(\`Total: \${total}\`);
}

export function generateInvoice(orderId: string): void {
  const items = [{ price: 50 }];
  const total = calculateTotal(items, 0.1);
  // ... generate invoice
}
`;

      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_param_removal.ts');
      fs.writeFileSync(testFile, source);

      try {
        const result = await analyzeRefactorImpact({
          filePath: testFile,
          elementName: 'calculateTotal',
          elementType: 'function',
          proposedChanges: {
            parameterChanges: [
              {
                name: 'taxRate',
                removed: true,
              },
            ],
          },
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);

        expect(response.breakingChanges).toContain(
          'Parameter "taxRate" removed - all callers must be updated'
        );
        expect(response.riskLevel).toBe('critical');
        expect(response.affectedLocations.length).toBeGreaterThan(0);

        // Check that all affected locations mention removing the taxRate argument
        for (const location of response.affectedLocations) {
          expect(location.requiredChanges.some((change: string) => change.includes('taxRate'))).toBe(true);
        }
      } finally {
        fs.unlinkSync(testFile);
      }
    });

    it('should analyze function rename impact', async () => {
      const source = `
export function oldFunctionName(): string {
  return 'hello';
}

export function caller1(): void {
  const result = oldFunctionName();
  console.log(result);
}

export function caller2(): void {
  oldFunctionName();
}
`;

      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_rename.ts');
      fs.writeFileSync(testFile, source);

      try {
        const result = await analyzeRefactorImpact({
          filePath: testFile,
          elementName: 'oldFunctionName',
          elementType: 'function',
          proposedChanges: {
            rename: {
              oldName: 'oldFunctionName',
              newName: 'newFunctionName',
            },
          },
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);

        expect(response.breakingChanges).toContain(
          'Function renamed from "oldFunctionName" to "newFunctionName"'
        );
        expect(response.riskLevel).toBe('critical');
        expect(response.suggestedUpdates).toContain(
          'Update all call sites to use new name "newFunctionName"'
        );
      } finally {
        fs.unlinkSync(testFile);
      }
    });

    it('should analyze async/await changes', async () => {
      const source = `
export function syncFunction(): User {
  return { id: 1, name: 'John' };
}

export function caller1(): void {
  const user = syncFunction();
  console.log(user.name);
}
`;

      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_async.ts');
      fs.writeFileSync(testFile, source);

      try {
        const result = await analyzeRefactorImpact({
          filePath: testFile,
          elementName: 'syncFunction',
          elementType: 'function',
          proposedChanges: {
            returnTypeChange: {
              oldType: 'User',
              newType: 'Promise<User>',
            },
          },
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);

        expect(response.breakingChanges).toContain(
          'Return type changed from non-Promise to Promise - callers not using await will break'
        );
        expect(response.affectedLocations[0].requiredChanges).toContain(
          'Add await keyword or handle Promise'
        );
      } finally {
        fs.unlinkSync(testFile);
      }
    });

    it('should handle low-risk changes', async () => {
      const source = `
export function add(a: number, b: number): number {
  return a + b;
}

export function calculate(): void {
  const result = add(1, 2);
}
`;

      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_low_risk.ts');
      fs.writeFileSync(testFile, source);

      try {
        const result = await analyzeRefactorImpact({
          filePath: testFile,
          elementName: 'add',
          elementType: 'function',
          proposedChanges: {
            parameterChanges: [
              {
                name: 'a',
                oldType: 'number',
                newType: 'number', // Same type, no change
              },
            ],
          },
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);

        expect(response.riskLevel).toBe('low');
        expect(response.breakingChanges.length).toBe(0);
      } finally {
        fs.unlinkSync(testFile);
      }
    });
  });

  describe('Error handling', () => {
    it('should return error for non-existent element', async () => {
      const source = `export function existingFunction(): void {}`;

      const fs = require('fs');
      const path = require('path');
      const testFile = path.join(process.cwd(), 'test_nonexistent.ts');
      fs.writeFileSync(testFile, source);

      try {
        const result = await analyzeRefactorImpact({
          filePath: testFile,
          elementName: 'nonExistentFunction',
          elementType: 'function',
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not found');
      } finally {
        fs.unlinkSync(testFile);
      }
    });
  });
});
