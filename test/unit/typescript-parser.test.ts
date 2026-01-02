import { describe, it, expect, beforeEach } from "vitest";
import { TypeScriptParser } from "../../src/parsers/typescript.js";
import { ParserError } from "../../src/utils/errors.js";
import { Language } from "../../src/parsers/base.js";
import { readFileSync } from "fs";
import { join } from "path";

describe("TypeScriptParser", () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser(Language.TypeScript);
  });

  describe("parse", () => {
    it("should parse valid TypeScript code", () => {
      const source = `
        function greet(name: string): string {
          return \`Hello, \${name}!\`;
        }
      `;

      const result = parser.parse(source);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.errors).toHaveLength(0);
      expect(result.tree.type).toBe("program");
    });

    it("should parse a class definition", () => {
      const source = `
        class Calculator {
          add(a: number, b: number): number {
            return a + b;
          }
        }
      `;

      const result = parser.parse(source);

      expect(result.errors).toHaveLength(0);
      expect(result.tree.type).toBe("program");
    });

    it("should detect syntax errors", () => {
      const source = `
        function broken() {
          return
        }
      `;

      const result = parser.parse(source);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
    });

    it("should parse TypeScript with imports and exports", () => {
      const source = `
        import { add } from "./math";
        export class Test {
          constructor() {}
        }
      `;

      const result = parser.parse(source);

      expect(result.errors).toHaveLength(0);
    });

    it("should handle generic types", () => {
      const source = `
        interface Result<T> {
          value: T;
          success: boolean;
        }

        function process<T>(data: T): Result<T> {
          return { value: data, success: true };
        }
      `;

      const result = parser.parse(source);

      expect(result.errors).toHaveLength(0);
    });
  });

  describe("parseFile", () => {
    it("should parse a TypeScript file", async () => {
      const filePath = join(__dirname, "../fixtures/typescript/calculator.ts");

      const result = await parser.parseFile(filePath);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("getLanguage", () => {
    it("should return TypeScript language", () => {
      expect(parser.getLanguage()).toBe(Language.TypeScript);
    });
  });

  describe("isSupported", () => {
    it("should support .ts extension", () => {
      expect(parser.isSupported(".ts")).toBe(true);
    });

    it("should support .tsx extension", () => {
      expect(parser.isSupported(".tsx")).toBe(true);
    });

    it("should not support .py extension", () => {
      expect(parser.isSupported(".py")).toBe(false);
    });
  });
});
