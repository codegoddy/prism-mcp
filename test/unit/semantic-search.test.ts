import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserFactory } from '../../src/parsers/factory.js';
import { Language } from '../../src/parsers/base.js';
import { performSearch } from '../../src/tools/semantic_search.js';
import type { SemanticQuery } from '../../src/types/ast.js';

describe('semantic_search', () => {
  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  describe('TypeScript', () => {
    it('should find functions with specific parameter types', async () => {
      const source = `
export function add(a: number, b: number): number {
  return a + b;
}

export function concat(s1: string, s2: string): string {
  return s1 + s2;
}

export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        parameters: [
          { name: 'a', type: 'number' },
          { name: 'b', type: 'number' },
        ],
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].name).toBe('add');
      expect(searchResults[0].parameters).toHaveLength(2);
      expect(searchResults[0].parameters[0].name).toBe('a');
      expect(searchResults[0].parameters[0].type).toBe('number');
    });

    it('should find classes implementing an interface', async () => {
      const source = `
interface Animal {
  speak(): void;
}

class Dog implements Animal {
  bark(): void {
    console.log("Woof!");
  }

  speak(): void {
    this.bark();
  }
}

class Cat implements Animal {
  meow(): void {
    console.log("Meow!");
  }

  speak(): void {
    this.meow();
  }
}

class Bird {
  fly(): void {
    console.log("Flying!");
  }
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'class',
        modifiers: ['implements'],
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults).toHaveLength(2);
      const names = searchResults.map((r) => r.name);
      expect(names).toContain('Dog');
      expect(names).toContain('Cat');
      expect(names).not.toContain('Bird');
    });

    it('should find async functions', async () => {
      const source = `
export function syncFunction(): number {
  return 42;
}

export async function asyncFunction(): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return 42;
}

export async function fetchData(url: string): Promise<any> {
  const response = await fetch(url);
  return response.json();
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        modifiers: ['async'],
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults).toHaveLength(2);
      const names = searchResults.map((r) => r.name);
      expect(names).toContain('asyncFunction');
      expect(names).toContain('fetchData');
      expect(names).not.toContain('syncFunction');
    });

    it('should find functions by name pattern (regex)', async () => {
      const source = `
export function getUserById(id: number): User {
  return db.users.find(u => u.id === id);
}

export function getUserByEmail(email: string): User {
  return db.users.find(u => u.email === email);
}

export function getUserCount(): number {
  return db.users.length;
}

export function deleteUser(id: number): void {
  db.users = db.users.filter(u => u.id !== id);
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        namePattern: 'get.*User',
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults).toHaveLength(3);
      const names = searchResults.map((r) => r.name);
      expect(names).toContain('getUserById');
      expect(names).toContain('getUserByEmail');
      expect(names).toContain('getUserCount');
      expect(names).not.toContain('deleteUser');
    });

    it('should find functions with specific return type', async () => {
      const source = `
export function getNumber(): number {
  return 42;
}

export function getString(): string {
  return "hello";
}

export function getUser(): User {
  return { id: 1, name: "John" };
}

export function getBool(): boolean {
  return true;
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        returnType: 'number',
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].name).toBe('getNumber');
    });

    it('should find exported functions', async () => {
      const source = `
export function publicFunction(): void {
  console.log("public");
}

function privateFunction(): void {
  console.log("private");
}

export const exported = () => {
  console.log("arrow function");
};

const notExported = () => {
  console.log("not exported");
};
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        modifiers: ['export'],
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults.length).toBeGreaterThan(0);
      const names = searchResults.map((r) => r.name);
      expect(names).toContain('publicFunction');
      expect(names).not.toContain('privateFunction');
    });

    it('should find static methods', async () => {
      const source = `
class Config {
  private static instance: Config;

  constructor() {}

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  reset(): void {
    Config.instance = new Config();
  }
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        modifiers: ['static'],
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].name).toBe('getInstance');
      expect(searchResults[0].type).toBe('method');
    });

    it('should find classes with specific name pattern', async () => {
      const source = `
export class UserController {
  getUsers(): User[] {
    return [];
  }
}

export class ProductController {
  getProducts(): Product[] {
    return [];
  }
}

export class UserService {
  getUser(id: number): User {
    return {} as User;
  }
}

export class Product {
  id: number;
  name: string;
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'class',
        namePattern: '.*Controller',
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults).toHaveLength(2);
      const names = searchResults.map((r) => r.name);
      expect(names).toContain('UserController');
      expect(names).toContain('ProductController');
      expect(names).not.toContain('UserService');
      expect(names).not.toContain('Product');
    });

    it('should find variables', async () => {
      const source = `
export const MAX_CONNECTIONS = 100;
export const API_URL = "https://api.example.com";
let count = 0;
const config = {
  debug: true,
};
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'variable',
        modifiers: ['const', 'export'],
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults.length).toBeGreaterThan(0);
      const names = searchResults.map((r) => r.name);
      expect(names).toContain('MAX_CONNECTIONS');
      expect(names).toContain('API_URL');
    });

    it('should find all functions when no specific criteria is provided', async () => {
      const source = `
export function func1(): void {}

export function func2(): void {}

class MyClass {
  method1(): void {}
}

const arrowFunc = () => {};
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults.length).toBeGreaterThanOrEqual(2);
      const names = searchResults.map((r) => r.name);
      expect(names).toContain('func1');
      expect(names).toContain('func2');
    });
  });

  describe('Python', () => {
    it('should find functions with decorators', async () => {
      const source = `
def regular_function():
    pass

@staticmethod
def static_method():
    pass

@classmethod
def class_method(cls):
    pass

@property
def my_property(self):
    pass

async def async_function():
    pass
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);

      const query1: SemanticQuery = {
        nodeType: 'function',
        modifiers: ['staticmethod'],
      };
      const searchResults1 = performSearch(result.tree, 'test.py', 'python', query1);
      expect(searchResults1.length).toBeGreaterThan(0);
      expect(searchResults1.map((r) => r.name)).toContain('static_method');

      const query2: SemanticQuery = {
        nodeType: 'function',
        modifiers: ['classmethod'],
      };
      const searchResults2 = performSearch(result.tree, 'test.py', 'python', query2);
      expect(searchResults2.length).toBeGreaterThan(0);
      expect(searchResults2.map((r) => r.name)).toContain('class_method');

      const query3: SemanticQuery = {
        nodeType: 'function',
        modifiers: ['property'],
      };
      const searchResults3 = performSearch(result.tree, 'test.py', 'python', query3);
      expect(searchResults3.length).toBeGreaterThan(0);
      expect(searchResults3.map((r) => r.name)).toContain('my_property');
    });

    it('should find classes inheriting from base class', async () => {
      const source = `
class Animal:
    def speak(self):
        pass

class Dog(Animal):
    def bark(self):
        print("Woof!")

class Cat(Animal):
    def meow(self):
        print("Meow!")

class Bird:
    def fly(self):
        print("Flying!")
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'class',
      };

      const searchResults = performSearch(result.tree, 'test.py', 'python', query);

      expect(searchResults).toHaveLength(4);
      expect(searchResults.find((r) => r.name === 'Animal')).toBeDefined();
      expect(searchResults.find((r) => r.name === 'Dog')).toBeDefined();
      expect(searchResults.find((r) => r.name === 'Cat')).toBeDefined();
      expect(searchResults.find((r) => r.name === 'Bird')).toBeDefined();

      const dog = searchResults.find((r) => r.name === 'Dog');
      const cat = searchResults.find((r) => r.name === 'Cat');
      const bird = searchResults.find((r) => r.name === 'Bird');

      expect(dog?.extends).toBe('Animal');
      expect(cat?.extends).toBe('Animal');
      expect(bird?.extends).toBeUndefined();
    });

    it('should find functions by name pattern', async () => {
      const source = `
def get_user_by_id(id: int) -> User:
    pass

def get_user_by_email(email: str) -> User:
    pass

def get_user_count() -> int:
    pass

def delete_user(id: int) -> None:
    pass
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        namePattern: 'get_.*',
      };

      const searchResults = performSearch(result.tree, 'test.py', 'python', query);

      expect(searchResults).toHaveLength(3);
      const names = searchResults.map((r) => r.name);
      expect(names).toContain('get_user_by_id');
      expect(names).toContain('get_user_by_email');
      expect(names).toContain('get_user_count');
      expect(names).not.toContain('delete_user');
    });

    it('should find async functions in Python', async () => {
      const source = `
def sync_function():
    pass

async def async_function():
    pass

async def fetch_data(url: str) -> dict:
    pass
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        modifiers: ['async'],
      };

      const searchResults = performSearch(result.tree, 'test.py', 'python', query);

      expect(searchResults.length).toBeGreaterThan(0);
      const names = searchResults.map((r) => r.name);
      expect(names).toContain('async_function');
      expect(names).toContain('fetch_data');
    });

    it('should find classes with decorators', async () => {
      const source = `
@dataclass
class User:
    id: int
    name: str

@dataclass
class Product:
    id: int
    name: str
    price: float

class RegularClass:
    pass
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'class',
      };

      const searchResults = performSearch(result.tree, 'test.py', 'python', query);

      expect(searchResults).toHaveLength(3);
      const user = searchResults.find((r) => r.name === 'User');
      expect(user?.modifiers).toContain('dataclass');
    });
  });

  describe('Combined Queries', () => {
    it('should find async functions with specific parameter types', async () => {
      const source = `
export async function fetchData(url: string): Promise<any> {
  const response = await fetch(url);
  return response.json();
}

export async function saveData(data: any): Promise<void> {
  await db.save(data);
}

export function syncProcess(data: string): void {
  console.log(data);
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        modifiers: ['async'],
        parameters: [{ type: 'string' }],
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].name).toBe('fetchData');
    });

    it('should find functions matching multiple criteria', async () => {
      const source = `
export function getUserById(id: number): User {
  return {} as User;
}

export function getUserByEmail(email: string): User {
  return {} as User;
}

export function deleteUser(id: number): void {
  console.log('deleted');
}

export function processUser(user: User): void {
  console.log(user);
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        namePattern: '.*User.*',
        returnType: 'User',
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults).toHaveLength(2);
      const names = searchResults.map((r) => r.name);
      expect(names).toContain('getUserById');
      expect(names).toContain('getUserByEmail');
      expect(names).not.toContain('deleteUser');
      expect(names).not.toContain('processUser');
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array when no matches found', async () => {
      const source = `
export function func1(): void {}
export function func2(): void {}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        namePattern: 'nonexistent',
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults).toHaveLength(0);
    });

    it('should handle empty source code', async () => {
      const source = '';
      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
      };

      const searchResults = performSearch(result.tree, 'test.ts', 'typescript', query);

      expect(searchResults).toHaveLength(0);
    });

    it('should handle invalid regex gracefully', async () => {
      const source = `export function test(): void {}`;
      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);

      const query: SemanticQuery = {
        nodeType: 'function',
        namePattern: '[invalid',
      };

      expect(() => {
        performSearch(result.tree, 'test.ts', 'typescript', query);
      }).toThrow();
    });
  });
});
