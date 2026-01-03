import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TypeScriptParser } from '../../src/parsers/typescript.js';
import {
  TypeResolver,
  analyzeTypeNarrowing,
  extractTypeParametersFromFunction,
} from '../../src/ast/type-resolution.js';
import type { TypeResolutionContext, GenericTypeParameter } from '../../src/types/ast.js';

describe('Advanced TypeScript Type Features', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  describe('Generic Type Resolution', () => {
    it('should extract generic type parameters from function', () => {
      const code = `
        function identity<T>(arg: T): T {
          return arg;
        }
        
        function map<K, V>(key: K, value: V): Map<K, V> {
          return new Map([[key, value]]);
        }
        
        function withConstraint<T extends string>(arg: T): T {
          return arg;
        }
      `;

      const info = parser.extractTypeInfo(code);

      const identityFunc = info.find((f: any) => f.name === 'identity');
      expect(identityFunc).toBeDefined();
      expect(identityFunc.typeParameters).toHaveLength(1);
      expect(identityFunc.typeParameters[0].name).toBe('T');

      const mapFunc = info.find((f: any) => f.name === 'map');
      expect(mapFunc).toBeDefined();
      expect(mapFunc.typeParameters).toHaveLength(2);
      expect(mapFunc.typeParameters[0].name).toBe('K');
      expect(mapFunc.typeParameters[1].name).toBe('V');

      const constraintFunc = info.find((f: any) => f.name === 'withConstraint');
      expect(constraintFunc).toBeDefined();
      expect(constraintFunc.typeParameters[0].name).toBe('T');
      expect(constraintFunc.typeParameters[0].constraint).toBe('string');
    });

    it('should extract generic type aliases', () => {
      const code = `
        type Container<T> = {
          value: T;
        };
        
        type Pair<K, V> = {
          key: K;
          value: V;
        };
        
        type Maybe<T> = T | null;
      `;

      const info = parser.extractTypeInfo(code);

      const container = info.find((t: any) => t.name === 'Container');
      expect(container).toBeDefined();
      expect(container.type).toBe('type_alias');
      expect(container.typeParameters).toHaveLength(1);
      expect(container.typeDefinition).toBe('{ value: T }');

      const pair = info.find((t: any) => t.name === 'Pair');
      expect(pair).toBeDefined();
      expect(pair.typeParameters).toHaveLength(2);
    });

    it('should resolve generic types with TypeResolver', () => {
      const context: TypeResolutionContext = {
        filePath: 'test.ts',
        typeParameters: new Map(),
        typeAliases: new Map(),
        interfaces: new Map(),
        symbols: new Map(),
      };

      const resolver = new TypeResolver(context);

      const mapResult = resolver.resolveGenericType('Map', ['string', 'number']);
      expect(mapResult).toBeDefined();
      expect(mapResult?.name).toBe('Map');
      expect(mapResult?.typeArguments).toEqual(['string', 'number']);
      expect(mapResult?.resolvedType).toBe('Map<string, number>');

      const arrayResult = resolver.resolveGenericType('Array', ['User']);
      expect(arrayResult).toBeDefined();
      expect(arrayResult?.typeArguments).toEqual(['User']);
      expect(arrayResult?.resolvedType).toBe('Array<User>');
    });

    it('should handle built-in generic types', () => {
      const context: TypeResolutionContext = {
        filePath: 'test.ts',
        typeParameters: new Map(),
        typeAliases: new Map(),
        interfaces: new Map(),
        symbols: new Map(),
      };

      const resolver = new TypeResolver(context);

      const promiseResult = resolver.resolveGenericType('Promise', ['string']);
      expect(promiseResult?.resolvedType).toBe('Promise<string>');

      const recordResult = resolver.resolveGenericType('Record', ['string', 'number']);
      expect(recordResult?.resolvedType).toBe('Record<string, number>');

      const partialResult = resolver.resolveGenericType('Partial', ['User']);
      expect(partialResult?.resolvedType).toBe('Partial<User>');
    });
  });

  describe('Conditional Types', () => {
    it('should extract conditional type aliases', () => {
      const code = `
        type If<T, Then, Else> = T extends true ? Then : Else;
        
        type IsString<T> = T extends string ? 'yes' : 'no';
        
        type NonNullable<T> = T extends null | undefined ? never : T;
      `;

      const info = parser.extractTypeInfo(code);

      const ifType = info.find((t: any) => t.name === 'If');
      expect(ifType).toBeDefined();
      expect(ifType.advancedTypeInfo?.conditionalType).toBeDefined();
      expect(ifType.advancedTypeInfo?.conditionalType?.checkType).toBe('T');
      expect(ifType.advancedTypeInfo?.conditionalType?.extendsType).toBe('true');
      expect(ifType.advancedTypeInfo?.conditionalType?.trueType).toBe('Then');
      expect(ifType.advancedTypeInfo?.conditionalType?.falseType).toBe('Else');

      const nonNullable = info.find((t: any) => t.name === 'NonNullable');
      expect(nonNullable).toBeDefined();
      expect(nonNullable.advancedTypeInfo?.conditionalType?.extendsType).toBe('null | undefined');
      expect(nonNullable.advancedTypeInfo?.conditionalType?.trueType).toBe('never');
    });

    it('should resolve conditional types with TypeResolver', () => {
      const context: TypeResolutionContext = {
        filePath: 'test.ts',
        typeParameters: new Map([['T', 'string']]),
        typeAliases: new Map(),
        interfaces: new Map(),
        symbols: new Map(),
      };

      const resolver = new TypeResolver(context);

      const conditionalResult = resolver.resolveConditionalType('string', 'string', 'yes', 'no');
      expect(conditionalResult).toBeDefined();
      expect(conditionalResult?.inferredType).toBe('yes');

      const falseResult = resolver.resolveConditionalType('number', 'string', 'yes', 'no');
      expect(falseResult?.inferredType).toBe('no');
    });

    it('should handle infer in conditional types', () => {
      const code = `
        type ReturnType<T> = T extends (...args: any[]) => infer R ? R : any;
        
        type First<T extends any[]> = T extends [infer F, ...any[]] ? F : never;
      `;

      const info = parser.extractTypeInfo(code);

      const returnType = info.find((t: any) => t.name === 'ReturnType');
      expect(returnType).toBeDefined();
      expect(returnType.typeDefinition).toContain('?');
      expect(returnType.typeDefinition).toContain(':');
    });
  });

  describe('Template Literal Types', () => {
    it('should extract template literal types', () => {
      const code = `
        type Greeting = \`Hello, \${string}!\`;
        
        type EventName = \`on\${string}\`;
        
        type CSSProperty = \`--\${string}\`;
      `;

      const info = parser.extractTypeInfo(code);

      const greeting = info.find((t: any) => t.name === 'Greeting');
      expect(greeting).toBeDefined();
      expect(greeting.typeDefinition).toBeTruthy();
    });

    it('should resolve template literal types with TypeResolver', () => {
      const context: TypeResolutionContext = {
        filePath: 'test.ts',
        typeParameters: new Map(),
        typeAliases: new Map(),
        interfaces: new Map(),
        symbols: new Map(),
      };

      const resolver = new TypeResolver(context);

      const templateLiteral = resolver.resolveType('`prefix-${number}`');
      expect(templateLiteral).toBeDefined();

      const complexTemplate = resolver.resolveType('`\${string}-\${number}`');
      expect(complexTemplate).toBeDefined();
    });

    it('should build template literal types from parts', () => {
      const code = `
        type Path = \`/users/\${string}/posts/\${string}\`;
      `;

      const info = parser.extractTypeInfo(code);

      const path = info.find((t: any) => t.name === 'Path');
      expect(path).toBeDefined();
    });
  });

  describe('Type Narrowing', () => {
    it('should extract type narrowing from if statements', () => {
      const code = `
        function processValue(value: string | null) {
          if (value !== null) {
            return value.length;
          }
          return 0;
        }
        
        function checkType(input: unknown) {
          if (typeof input === 'string') {
            return input.toUpperCase();
          }
          return null;
        }
      `;

      const info = parser.extractTypeInfo(code);

      const processFunc = info.find((f: any) => f.name === 'processValue');
      expect(processFunc).toBeDefined();
      expect(processFunc.params[0].type).toBeTruthy();
    });

    it('should analyze type narrowing with analyzeTypeNarrowing', () => {
      const context: TypeResolutionContext = {
        filePath: 'test.ts',
        typeParameters: new Map(),
        typeAliases: new Map(),
        interfaces: new Map(),
        symbols: new Map(),
      };

      const nullNarrowing = analyzeTypeNarrowing(
        {
          type: 'if_statement',
          text: '',
          startPosition: { row: 1, column: 0 },
          endPosition: { row: 1, column: 20 },
          children: [],
          namedChildren: [],
          parent: null,
        },
        context
      );

      expect(nullNarrowing).toBeNull();
    });

    it('should handle instanceof narrowing', () => {
      const context: TypeResolutionContext = {
        filePath: 'test.ts',
        typeParameters: new Map(),
        typeAliases: new Map(),
        interfaces: new Map(),
        symbols: new Map(),
      };

      const instanceNarrowing = analyzeTypeNarrowing(
        {
          type: 'call_expression',
          text: 'obj instanceof Array',
          startPosition: { row: 1, column: 0 },
          endPosition: { row: 1, column: 25 },
          children: [],
          namedChildren: [],
          parent: null,
        },
        context
      );

      expect(instanceNarrowing).toBeDefined();
      expect(instanceNarrowing?.variableName).toBe('obj');
      expect(instanceNarrowing?.narrowedType).toBe('Array');
      expect(instanceNarrowing?.narrowingReason.type).toBe('instanceof');
    });

    it('should handle Array.isArray narrowing', () => {
      const context: TypeResolutionContext = {
        filePath: 'test.ts',
        typeParameters: new Map(),
        typeAliases: new Map(),
        interfaces: new Map(),
        symbols: new Map(),
      };

      const arrayNarrowing = analyzeTypeNarrowing(
        {
          type: 'call_expression',
          text: 'Array.isArray(items)',
          startPosition: { row: 1, column: 0 },
          endPosition: { row: 1, column: 25 },
          children: [],
          namedChildren: [],
          parent: null,
        },
        context
      );

      expect(arrayNarrowing).toBeDefined();
      expect(arrayNarrowing?.variableName).toBe('items');
      expect(arrayNarrowing?.narrowedType).toBe('unknown[]');
      expect(arrayNarrowing?.narrowingReason.detail).toContain('Array.isArray()');
    });
  });

  describe('Union and Intersection Types', () => {
    it('should extract union types', () => {
      const code = `
        type Status = 'pending' | 'approved';
        
        type Numeric = number | bigint;
        
        type Mixed = string | number;
      `;

      const info = parser.extractTypeInfo(code);

      const status = info.find((t: any) => t.name === 'Status');
      expect(status).toBeDefined();
      expect(status.advancedTypeInfo?.unionTypes).toBeDefined();
      expect(status.advancedTypeInfo?.unionTypes?.length).toBe(2);
    });

    it('should extract intersection types', () => {
      const code = `
        type Combined = TypeA & TypeB;
        
        type Extended = Base & {
          extra: string;
        };
      `;

      const info = parser.extractTypeInfo(code);

      const combined = info.find((t: any) => t.name === 'Combined');
      expect(combined).toBeDefined();
      expect(combined.advancedTypeInfo?.intersectionTypes).toBeDefined();
      expect(combined.advancedTypeInfo?.intersectionTypes).toEqual(['TypeA', 'TypeB']);
    });
  });

  describe('Complex Generic Interfaces', () => {
    it('should extract generic interfaces with methods', () => {
      const code = `
        interface Repository<T, ID> {
          findById(id: ID): Promise<T | null>;
          findAll(): Promise<T[]>;
          save(entity: T): Promise<T>;
          delete(id: ID): Promise<void>;
        }
      `;

      const info = parser.extractTypeInfo(code);

      const repo = info.find((i: any) => i.name === 'Repository');
      expect(repo).toBeDefined();
      expect(repo.type).toBe('interface');
      expect(repo.typeParameters).toHaveLength(2);
      expect(repo.properties).toHaveLength(4);
    });

    it('should handle interfaces with call and construct signatures', () => {
      const code = `
        interface Callable {
          (x: number): string;
          (x: string): string;
        }
        
        interface Constructible {
          new (x: number): MyClass;
        }
      `;

      const info = parser.extractTypeInfo(code);

      const callable = info.find((i: any) => i.name === 'Callable');
      expect(callable).toBeDefined();
      expect(callable.properties.some((p: any) => p.name === '[call]')).toBe(true);

      const constructible = info.find((i: any) => i.name === 'Constructible');
      expect(constructible).toBeDefined();
      expect(constructible.properties.some((p: any) => p.name === '[new]')).toBe(true);
    });
  });

  describe('Advanced Type Operations', () => {
    it('should resolve keyof types', () => {
      const context: TypeResolutionContext = {
        filePath: 'test.ts',
        typeParameters: new Map(),
        typeAliases: new Map(),
        interfaces: new Map(),
        symbols: new Map(),
      };

      const resolver = new TypeResolver(context);

      const keyofResult = resolver.resolveType('keyof User');
      expect(keyofResult).toBe('keyof User');
    });

    it('should resolve typeof types', () => {
      const context: TypeResolutionContext = {
        filePath: 'test.ts',
        typeParameters: new Map(),
        typeAliases: new Map(),
        interfaces: new Map(),
        symbols: new Map(),
      };

      const resolver = new TypeResolver(context);

      const typeofResult = resolver.resolveType('typeof myFunction');
      expect(typeofResult).toBe('typeof myFunction');
    });

    it('should get advanced type info for complex types', () => {
      const context: TypeResolutionContext = {
        filePath: 'test.ts',
        typeParameters: new Map(),
        typeAliases: new Map(),
        interfaces: new Map(),
        symbols: new Map(),
      };

      const resolver = new TypeResolver(context);

      const advancedInfo = resolver.getAdvancedTypeInfo('Map<string, number>');
      expect(advancedInfo.genericResolution).toBeDefined();
      expect(advancedInfo.genericResolution?.name).toBe('Map');
      expect(advancedInfo.genericResolution?.typeArguments).toEqual(['string', 'number']);
    });
  });

  describe('Type Parameter Extraction from Functions', () => {
    it('should extract type parameters from various function types', () => {
      const code = `
        async function fetchData<T>(url: string): Promise<T> {
          const response = await fetch(url);
          return response.json();
        }
        
        const arrowFn = <U, V>(a: U, b: V): [U, V] => [a, b];
        
        function withDefault<T = string>(): T {
          return '' as T;
        }
      `;

      const info = parser.extractTypeInfo(code);

      const fetchData = info.find((f: any) => f.name === 'fetchData');
      expect(fetchData).toBeDefined();
      expect(fetchData.typeParameters).toHaveLength(1);
      expect(fetchData.typeParameters[0].name).toBe('T');
    });
  });
});

import { ParserFactory } from '../../src/parsers/factory.js';
