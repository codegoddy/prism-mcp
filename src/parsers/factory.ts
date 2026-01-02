import { ParserInterface, Language } from "./base.js";
import { TypeScriptParser } from "./typescript.js";
import { PythonParser } from "./python.js";
import { InvalidArgumentsError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { extname } from "path";

const EXTENSION_MAP: Record<string, Language> = {
  ".ts": Language.TypeScript,
  ".tsx": Language.TypeScript,
  ".js": Language.JavaScript,
  ".jsx": Language.JavaScript,
  ".mjs": Language.JavaScript,
  ".py": Language.Python,
  ".pyw": Language.Python
};

export class ParserFactory {
  private static parsers: Map<Language, ParserInterface> = new Map();

  static getParser(language: Language): ParserInterface {
    if (!this.parsers.has(language)) {
      this.parsers.set(language, this.createParser(language));
    }

    return this.parsers.get(language)!;
  }

  static getParserForFile(filePath: string): ParserInterface {
    const extension = extname(filePath).toLowerCase();

    if (!(extension in EXTENSION_MAP)) {
      throw new InvalidArgumentsError(`Unsupported file extension: ${extension}`);
    }

    const language = EXTENSION_MAP[extension];
    return this.getParser(language);
  }

  static detectLanguage(filePath: string): Language | null {
    const extension = extname(filePath).toLowerCase();
    return EXTENSION_MAP[extension] || null;
  }

  static getSupportedExtensions(): string[] {
    return Object.keys(EXTENSION_MAP);
  }

  private static createParser(language: Language): ParserInterface {
    logger.debug("Creating parser", { language });

    switch (language) {
      case Language.TypeScript:
        return new TypeScriptParser(Language.TypeScript);
      case Language.JavaScript:
        return new TypeScriptParser(Language.JavaScript);
      case Language.Python:
        return new PythonParser();
      default:
        throw new InvalidArgumentsError(`Unsupported language: ${language}`);
    }
  }

  static reset(): void {
    this.parsers.clear();
  }
}
