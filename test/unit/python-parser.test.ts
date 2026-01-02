import { describe, it, expect, beforeEach } from "vitest";
import { PythonParser } from "../../src/parsers/python.js";
import { Language } from "../../src/parsers/base.js";
import { join } from "path";

describe("PythonParser", () => {
  let parser: PythonParser;

  beforeEach(() => {
    parser = new PythonParser();
  });

  describe("parse", () => {
    it("should parse valid Python code", () => {
      const source = `
        def greet(name: str) -> str:
            return f"Hello, {name}!"
      `;

      const result = parser.parse(source);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.errors).toHaveLength(0);
      expect(result.tree.type).toBe("module");
    });

    it("should parse a class definition", () => {
      const source = `
        class Calculator:
            def add(self, a: int, b: int) -> int:
                return a + b
      `;

      const result = parser.parse(source);

      expect(result.errors).toHaveLength(0);
      expect(result.tree.type).toBe("module");
    });

    it("should parse Python with decorators", () => {
      const source = `
        @property
        def name(self) -> str:
            return self._name
      `;

      const result = parser.parse(source);

      expect(result.errors).toHaveLength(0);
    });

    it("should parse Python with async functions", () => {
      const source = `
        async def fetch_data() -> dict:
            return {"data": "value"}
      `;

      const result = parser.parse(source);

      expect(result.errors).toHaveLength(0);
    });

    it("should parse Python with type hints", () => {
      const source = `
        from typing import List, Optional

        def process(items: List[int]) -> Optional[int]:
            return items[0] if items else None
      `;

      const result = parser.parse(source);

      expect(result.errors).toHaveLength(0);
    });
  });

  describe("parseFile", () => {
    it("should parse a Python file", async () => {
      const filePath = join(__dirname, "../fixtures/python/calculator.py");

      const result = await parser.parseFile(filePath);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("getLanguage", () => {
    it("should return Python language", () => {
      expect(parser.getLanguage()).toBe(Language.Python);
    });
  });

  describe("isSupported", () => {
    it("should support .py extension", () => {
      expect(parser.isSupported(".py")).toBe(true);
    });

    it("should support .pyw extension", () => {
      expect(parser.isSupported(".pyw")).toBe(true);
    });

    it("should not support .ts extension", () => {
      expect(parser.isSupported(".ts")).toBe(false);
    });
  });
});
