import { describe, it, expect } from 'vitest';
import { TypeScriptParser } from '../../src/parsers/typescript.js';

describe('TypeScriptParser Rich Parsing', () => {
  const parser = new TypeScriptParser();

  it('should parse TypeScript code using parseRich', () => {
    const code = `
      interface User {
        id: number;
        name: string;
      }
      
      function greet(user: User): string {
        return "Hello " + user.name;
      }
    `;

    const ast = parser.parseRich(code, 'test.ts');
    
    expect(ast).toBeDefined();
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(2); // interface + function
    
    // Check InterfaceDeclaration
    const interfaceDecl = ast.body[0];
    expect(interfaceDecl.type).toBe('TSInterfaceDeclaration');
    expect(interfaceDecl.id.name).toBe('User');
    
    // Check FunctionDeclaration
    const funcDecl = ast.body[1];
    expect(funcDecl.type).toBe('FunctionDeclaration');
    expect(funcDecl.id.name).toBe('greet');
    
    // Check types
    expect(funcDecl.returnType).toBeDefined();
    expect(funcDecl.returnType.typeAnnotation.type).toBe('TSStringKeyword');
    
    const param = funcDecl.params[0];
    expect(param.name).toBe('user');
    expect(param.typeAnnotation).toBeDefined();
    expect(param.typeAnnotation.typeAnnotation.typeName.name).toBe('User');
  });

  it('should handle complex types', () => {
      const code = `
        type Callback<T> = (data: T) => void;
        const process = <T>(items: T[], cb: Callback<T>): void => {
            items.forEach(cb);
        }
      `;
      
      const ast = parser.parseRich(code);
      
      const typeAlias = ast.body[0];
      expect(typeAlias.type).toBe('TSTypeAliasDeclaration');
      expect(typeAlias.typeParameters.params[0].name.name).toBe('T');
      
      const func = ast.body[1].declarations[0].init;
      expect(func.type).toBe('ArrowFunctionExpression');
      expect(func.typeParameters.params[0].name.name).toBe('T');
  });

  it('should extract simplified type info', () => {
    const code = `
      function add(a: number, b: number): number {
        return a + b;
      }
    `;
    
    const info = parser.extractTypeInfo(code, 'math.ts');
    expect(info).toHaveLength(1);
    expect(info[0].name).toBe('add');
    expect(info[0].returnType).toBe('TSNumberKeyword');
    expect(info[0].params).toHaveLength(2);
    expect(info[0].params[0].type).toBe('TSNumberKeyword');
  });
});
