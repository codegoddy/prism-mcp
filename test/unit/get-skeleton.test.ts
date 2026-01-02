import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserFactory } from '../../src/parsers/factory.js';
import { Language } from '../../src/parsers/base.js';
import { extractSkeleton } from '../../src/tools/get_skeleton.js';

describe('get_skeleton', () => {
  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  describe('TypeScript', () => {
    it('should extract class definitions with properties and methods', async () => {
      const source = `
export class Calculator {
  private result: number;

  constructor() {
    this.result = 0;
  }

  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.ts', 'typescript');

      expect(skeleton.exports.classes).toHaveLength(1);
      const calculator = skeleton.exports.classes[0];
      expect(calculator.name).toBe('Calculator');
      expect(calculator.properties).toHaveLength(1);
      expect(calculator.properties[0].name).toBe('result');
      expect(calculator.properties[0].visibility).toBe('private');
      expect(calculator.properties[0].type).toBe('number');
      expect(calculator.methods).toHaveLength(2);
      expect(calculator.methods[0].name).toBe('add');
      expect(calculator.methods[0].parameters).toHaveLength(2);
      expect(calculator.methods[0].parameters[0].name).toBe('a');
      expect(calculator.methods[0].parameters[0].type).toBe('number');
      expect(calculator.methods[0].returnType).toBe('number');
    });

    it('should extract function definitions', async () => {
      const source = `
export function factorial(n: number): number {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

export async function fetchData(url: string): Promise<any> {
  const response = await fetch(url);
  return response.json();
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.ts', 'typescript');

      expect(skeleton.exports.functions).toHaveLength(2);
      expect(skeleton.exports.functions[0].name).toBe('factorial');
      expect(skeleton.exports.functions[0].isExported).toBe(true);
      expect(skeleton.exports.functions[0].parameters).toHaveLength(1);
      expect(skeleton.exports.functions[0].parameters[0].name).toBe('n');
      expect(skeleton.exports.functions[0].parameters[0].type).toBe('number');
      expect(skeleton.exports.functions[0].returnType).toBe('number');

      expect(skeleton.exports.functions[1].name).toBe('fetchData');
      expect(skeleton.exports.functions[1].isAsync).toBe(true);
      expect(skeleton.exports.functions[1].returnType).toBe('Promise');
    });

    it('should extract imports', async () => {
      const source = `
import { useState, useEffect } from 'react';
import axios from 'axios';
import * as utils from './utils';

class MyClass {}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.ts', 'typescript');

      expect(skeleton.imports).toHaveLength(3);
      expect(skeleton.imports[0].source).toBe('react');
      expect(skeleton.imports[0].imported).toHaveLength(2);
      expect(skeleton.imports[0].imported[0].name).toBe('useState');
      expect(skeleton.imports[0].imported[1].name).toBe('useEffect');

      expect(skeleton.imports[1].source).toBe('axios');
      expect(skeleton.imports[1].isDefault).toBe(true);

      expect(skeleton.imports[2].source).toBe('./utils');
      expect(skeleton.imports[2].isNamespace).toBe(true);
    });

    it('should extract interface definitions', async () => {
      const source = `
export interface User {
  id: number;
  name: string;
  email?: string;
  getFullName(): string;
}

export interface Admin extends User {
  permissions: string[];
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.ts', 'typescript');

      expect(skeleton.exports.interfaces).toHaveLength(2);
      const user = skeleton.exports.interfaces[0];
      expect(user.name).toBe('User');
      expect(user.properties).toHaveLength(3);
      expect(user.properties[0].name).toBe('id');
      expect(user.properties[0].type).toBe('number');
      expect(user.properties[2].name).toBe('email');
      expect(user.methods).toHaveLength(1);
      expect(user.methods[0].name).toBe('getFullName');

      const admin = skeleton.exports.interfaces[1];
      expect(admin.name).toBe('Admin');
      expect(admin.extends).toContain('User');
    });

    it('should extract enum definitions', async () => {
      const source = `
export enum Color {
  Red,
  Green,
  Blue
}

export enum Direction {
  Up = "UP",
  Down = "DOWN",
  Left = "LEFT",
  Right = "RIGHT"
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.ts', 'typescript');

      expect(skeleton.exports.enums).toHaveLength(2);
      expect(skeleton.exports.enums[0].name).toBe('Color');
      expect(skeleton.exports.enums[0].members).toHaveLength(3);
      expect(skeleton.exports.enums[0].members[0].name).toBe('Red');

      expect(skeleton.exports.enums[1].name).toBe('Direction');
      expect(skeleton.exports.enums[1].members).toHaveLength(4);
      expect(skeleton.exports.enums[1].members[0].name).toBe('Up');
      expect(skeleton.exports.enums[1].members[0].value).toBe('UP');
    });

    it('should extract class inheritance and implementation', async () => {
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

class GoldenRetriever extends Dog {
  color: string;

  constructor(color: string) {
    super();
    this.color = color;
  }
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.ts', 'typescript');

      expect(skeleton.exports.classes).toHaveLength(2);
      const dog = skeleton.exports.classes[0];
      expect(dog.name).toBe('Dog');
      expect(dog.implements).toContain('Animal');
      expect(dog.methods).toHaveLength(2);

      const golden = skeleton.exports.classes[1];
      expect(golden.name).toBe('GoldenRetriever');
      expect(golden.extends).toBe('Dog');
      expect(golden.properties[0].name).toBe('color');
    });

    it('should extract static and readonly properties', async () => {
      const source = `
class Config {
  static readonly MAX_CONNECTIONS = 100;
  private static instance: Config;
  public apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config("https://api.example.com");
    }
    return Config.instance;
  }
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.ts', 'typescript');

      const config = skeleton.exports.classes[0];
      expect(config.properties).toHaveLength(3);

      const maxConnections = config.properties.find((p) => p.name === 'MAX_CONNECTIONS');
      expect(maxConnections?.isReadonly).toBe(true);
      expect(maxConnections?.isStatic).toBe(true);

      const instance = config.properties.find((p) => p.name === 'instance');
      expect(instance?.visibility).toBe('private');
      expect(instance?.isStatic).toBe(true);

      const getInstance = config.methods.find((m) => m.name === 'getInstance');
      expect(getInstance?.isStatic).toBe(true);
    });
  });

  describe('JavaScript', () => {
    it('should extract class definitions', async () => {
      const source = `
export class Calculator {
  constructor() {
    this.result = 0;
  }

  add(a, b) {
    return a + b;
  }
}
`;

      const parser = ParserFactory.getParser(Language.JavaScript);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.js', 'javascript');

      expect(skeleton.exports.classes).toHaveLength(1);
      const calculator = skeleton.exports.classes[0];
      expect(calculator.name).toBe('Calculator');
      expect(calculator.methods).toHaveLength(1);
      expect(calculator.methods[0].name).toBe('add');
      expect(calculator.methods[0].parameters).toHaveLength(2);
      expect(calculator.methods[0].parameters[0].name).toBe('a');
    });
  });

  describe('Python', () => {
    it('should extract class definitions with methods', async () => {
      const source = `
class Calculator:
    def __init__(self):
        self.result = 0

    def add(self, a: int, b: int) -> int:
        return a + b

    def subtract(self, a: int, b: int) -> int:
        return a - b
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.py', 'python');

      expect(skeleton.exports.classes).toHaveLength(1);
      const calculator = skeleton.exports.classes[0];
      expect(calculator.name).toBe('Calculator');
      expect(calculator.methods).toHaveLength(3);
      expect(calculator.methods[0].name).toBe('__init__');
      expect(calculator.methods[1].name).toBe('add');
      expect(calculator.methods[1].parameters).toHaveLength(2);
      expect(calculator.methods[1].parameters[0].name).toBe('a');
      expect(calculator.methods[1].parameters[0].type).toBe('int');
      expect(calculator.methods[1].returnType).toBe('int');
    });

    it('should extract function definitions', async () => {
      const source = `
def factorial(n: int) -> int:
    if n <= 1:
        return 1
    return n * factorial(n - 1)

async def fetch_data(url: str) -> dict:
    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.json()
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.py', 'python');

      expect(skeleton.exports.functions).toHaveLength(2);
      expect(skeleton.exports.functions[0].name).toBe('factorial');
      expect(skeleton.exports.functions[0].parameters).toHaveLength(1);
      expect(skeleton.exports.functions[0].parameters[0].name).toBe('n');
      expect(skeleton.exports.functions[0].parameters[0].type).toBe('int');
      expect(skeleton.exports.functions[0].returnType).toBe('int');
    });

    it('should extract imports', async () => {
      const source = `
import os
import sys
from typing import List, Optional, Dict
from collections import defaultdict
from numpy import array as np_array

class MyClass:
    pass
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.py', 'python');

      expect(skeleton.imports).toHaveLength(5);
      expect(skeleton.imports[0].source).toBe('os');
      expect(skeleton.imports[0].imported[0].name).toBe('os');

      expect(skeleton.imports[1].source).toBe('sys');
      expect(skeleton.imports[1].imported[0].name).toBe('sys');

      expect(skeleton.imports[2].source).toBe('typing');
      expect(skeleton.imports[2].imported).toHaveLength(3);
      expect(skeleton.imports[2].imported[0].name).toBe('List');

      expect(skeleton.imports[3].source).toBe('collections');
      expect(skeleton.imports[3].imported[0].name).toBe('defaultdict');

      expect(skeleton.imports[4].source).toBe('numpy');
      expect(skeleton.imports[4].imported[0].name).toBe('array');
      expect(skeleton.imports[4].imported[0].alias).toBe('np_array');

      expect(skeleton.imports[4].source).toBe('numpy');
      expect(skeleton.imports[4].imported[0].name).toBe('array');
      expect(skeleton.imports[4].imported[0].alias).toBe('np_array');
    });

    it('should extract class inheritance', async () => {
      const source = `
class Animal:
    def speak(self):
        pass

class Dog(Animal):
    def bark(self):
        print("Woof!")

    def speak(self):
        self.bark()

class GoldenRetriever(Dog):
    def __init__(self, color):
        self.color = color
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.py', 'python');

      expect(skeleton.exports.classes).toHaveLength(3);
      const dog = skeleton.exports.classes[1];
      expect(dog.name).toBe('Dog');
      expect(dog.extends).toBe('Animal');

      const golden = skeleton.exports.classes[2];
      expect(golden.name).toBe('GoldenRetriever');
      expect(golden.extends).toBe('Dog');
    });

    it('should extract decorators', async () => {
      const source = `
class MyClass:
    @staticmethod
    def static_method():
        return "static"

    @classmethod
    def class_method(cls):
        return "class"

    @property
    def my_property(self):
        return "property"

    @property
    def my_property_with_setter(self):
        return self._value

    @my_property_with_setter.setter
    def my_property_with_setter(self, value):
        self._value = value
`;

      const parser = ParserFactory.getParser(Language.Python);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.py', 'python');

      const myClass = skeleton.exports.classes[0];
      expect(myClass.methods).toHaveLength(5);
      expect(myClass.methods[0].decorators).toContain('staticmethod');
      expect(myClass.methods[0].isStatic).toBe(true);
      expect(myClass.methods[1].decorators).toContain('classmethod');
      expect(myClass.methods[1].isStatic).toBe(true);
      expect(myClass.methods[2].decorators).toContain('property');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty files', async () => {
      const source = '';
      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.ts', 'typescript');

      expect(skeleton.exports.classes).toHaveLength(0);
      expect(skeleton.exports.functions).toHaveLength(0);
      expect(skeleton.imports).toHaveLength(0);
    });

    it('should handle files with only comments', async () => {
      const source = `
// This is a comment
// Another comment
`;
      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.ts', 'typescript');

      expect(skeleton.exports.classes).toHaveLength(0);
      expect(skeleton.exports.functions).toHaveLength(0);
    });

    it('should handle nested classes', async () => {
      const source = `
export class Outer {
  innerValue: number;

  constructor() {
    this.innerValue = 42;
  }

  getInner() {
    return new Inner();
  }
}

class Inner {
  value: string;
}
`;

      const parser = ParserFactory.getParser(Language.TypeScript);
      const result = parser.parse(source);
      const skeleton = extractSkeleton(result.tree, 'test.ts', 'typescript');

      expect(skeleton.exports.classes).toHaveLength(2);
      expect(skeleton.exports.classes[0].name).toBe('Outer');
    });
  });
});
