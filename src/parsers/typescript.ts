import { Parser } from "tree-sitter";
import * as TypeScript from "tree-sitter-typescript";
import { BaseParser, Language, LanguageConfig } from "./base.js";
import type { ParseResult } from "../types/ast.js";
import { ParserError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

const TYPESCRIPT_CONFIG: LanguageConfig = {
  extensions: [".ts", ".tsx"],
  grammarName: "typescript"
};

const JAVASCRIPT_CONFIG: LanguageConfig = {
  extensions: [".js", ".jsx", ".mjs"],
  grammarName: "javascript"
};

export class TypeScriptParser extends BaseParser {
  constructor(language: Language = Language.TypeScript) {
    const config = language === Language.TypeScript ? TYPESCRIPT_CONFIG : JAVASCRIPT_CONFIG;
    super(language, config);
    this.initializeParser();
  }

  private initializeParser(): void {
    this.parser = new Parser();

    if (this.language === Language.TypeScript) {
      this.parser.setLanguage(TypeScript.typescript);
    } else {
      this.parser.setLanguage(TypeScript.javascript);
    }

    logger.debug("TypeScript parser initialized", { language: this.language });
  }

  parse(source: string, filePath?: string): ParseResult {
    this.ensureParserInitialized();

    const startTime = performance.now();

    try {
      const tree = this.parser!.parse(source);

      const errors = tree.rootNode
        .descendantsOfType("ERROR")
        .map((node: any) => ({
          message: `Syntax error at line ${node.startPosition.row + 1}`,
          startPosition: node.startPosition,
          endPosition: node.endPosition
        }));

      const rootAST = this.convertTreeToAST(tree.rootNode);

      const parseTime = performance.now() - startTime;

      logger.debug("File parsed successfully", {
        language: this.language,
        filePath,
        parseTime,
        errorCount: errors.length
      });

      return {
        tree: rootAST,
        errors,
        parseTime
      };
    } catch (error) {
      logger.error("Failed to parse source", error as Error, { filePath });
      throw new ParserError(`Failed to parse ${this.language} file`, {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
