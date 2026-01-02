import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ParserFactory } from "../../src/parsers/factory.js";
import { Language } from "../../src/parsers/base.js";
import { InvalidArgumentsError } from "../../src/utils/errors.js";

describe("ParserFactory", () => {
  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  describe("getParser", () => {
    it("should return TypeScript parser", () => {
      const parser = ParserFactory.getParser(Language.TypeScript);

      expect(parser).toBeDefined();
      expect(parser.getLanguage()).toBe(Language.TypeScript);
    });

    it("should return Python parser", () => {
      const parser = ParserFactory.getParser(Language.Python);

      expect(parser).toBeDefined();
      expect(parser.getLanguage()).toBe(Language.Python);
    });

    it("should return the same parser instance for same language", () => {
      const parser1 = ParserFactory.getParser(Language.TypeScript);
      const parser2 = ParserFactory.getParser(Language.TypeScript);

      expect(parser1).toBe(parser2);
    });
  });

  describe("getParserForFile", () => {
    it("should return TypeScript parser for .ts files", () => {
      const parser = ParserFactory.getParserForFile("test.ts");

      expect(parser.getLanguage()).toBe(Language.TypeScript);
    });

    it("should return JavaScript parser for .js files", () => {
      const parser = ParserFactory.getParserForFile("test.js");

      expect(parser.getLanguage()).toBe(Language.JavaScript);
    });

    it("should return Python parser for .py files", () => {
      const parser = ParserFactory.getParserForFile("test.py");

      expect(parser.getLanguage()).toBe(Language.Python);
    });

    it("should throw error for unsupported extensions", () => {
      expect(() => ParserFactory.getParserForFile("test.unknown")).toThrow(InvalidArgumentsError);
    });
  });

  describe("detectLanguage", () => {
    it("should detect TypeScript from .ts", () => {
      expect(ParserFactory.detectLanguage("file.ts")).toBe(Language.TypeScript);
    });

    it("should detect TypeScript from .tsx", () => {
      expect(ParserFactory.detectLanguage("file.tsx")).toBe(Language.TypeScript);
    });

    it("should detect JavaScript from .js", () => {
      expect(ParserFactory.detectLanguage("file.js")).toBe(Language.JavaScript);
    });

    it("should detect Python from .py", () => {
      expect(ParserFactory.detectLanguage("file.py")).toBe(Language.Python);
    });

    it("should return null for unknown extension", () => {
      expect(ParserFactory.detectLanguage("file.unknown")).toBeNull();
    });
  });

  describe("getSupportedExtensions", () => {
    it("should return all supported extensions", () => {
      const extensions = ParserFactory.getSupportedExtensions();

      expect(extensions).toContain(".ts");
      expect(extensions).toContain(".tsx");
      expect(extensions).toContain(".js");
      expect(extensions).toContain(".jsx");
      expect(extensions).toContain(".py");
      expect(extensions).toContain(".pyw");
    });
  });
});
