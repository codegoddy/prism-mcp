import { Parser as TreeParser } from "tree-sitter";
import type { ASTNode, ParseResult } from "../types/ast.js";
import { ParserError } from "../utils/errors.js";

export enum Language {
  TypeScript = "typescript",
  JavaScript = "javascript",
  Python = "python"
}

export interface LanguageConfig {
  extensions: string[];
  grammarName: string;
}

export interface ParserInterface {
  parse(source: string, filePath?: string): ParseResult;
  parseFile(filePath: string): Promise<ParseResult>;
  getLanguage(): Language;
  getConfig(): LanguageConfig;
  isSupported(fileExtension: string): boolean;
}

export abstract class BaseParser implements ParserInterface {
  protected parser: TreeParser | null = null;
  protected language: Language;
  protected config: LanguageConfig;

  constructor(language: Language, config: LanguageConfig) {
    this.language = language;
    this.config = config;
  }

  protected ensureParserInitialized(): void {
    if (this.parser === null) {
      throw new ParserError("Parser not initialized");
    }
  }

  abstract parse(source: string, filePath?: string): ParseResult;

  async parseFile(filePath: string): Promise<ParseResult> {
    const { readFileSync } = await import("fs");
    const source = readFileSync(filePath, "utf-8");
    return this.parse(source, filePath);
  }

  getLanguage(): Language {
    return this.language;
  }

  getConfig(): LanguageConfig {
    return this.config;
  }

  isSupported(fileExtension: string): boolean {
    return this.config.extensions.includes(fileExtension);
  }

  protected convertTreeToAST(rootNode: any, parent: ASTNode | null = null): ASTNode {
    return {
      type: rootNode.type,
      text: rootNode.text,
      startPosition: rootNode.startPosition,
      endPosition: rootNode.endPosition,
      children: rootNode.children.map((child: any) => this.convertTreeToAST(child, null)),
      namedChildren: rootNode.namedChildren.map((child: any) => this.convertTreeToAST(child, null)),
      parent
    };
  }
}
