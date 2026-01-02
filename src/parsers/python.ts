import { Parser } from "tree-sitter";
import * as Python from "tree-sitter-python";
import { BaseParser, Language, LanguageConfig } from "./base.js";
import type { ParseResult } from "../types/ast.js";
import { ParserError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

const PYTHON_CONFIG: LanguageConfig = {
  extensions: [".py", ".pyw"],
  grammarName: "python"
};

export class PythonParser extends BaseParser {
  constructor() {
    super(Language.Python, PYTHON_CONFIG);
    this.initializeParser();
  }

  private initializeParser(): void {
    this.parser = new Parser();
    this.parser.setLanguage(Python);

    logger.debug("Python parser initialized");
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
      throw new ParserError("Failed to parse Python file", {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
