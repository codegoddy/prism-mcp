import treeSitter from 'tree-sitter';
import type { ASTNode, ParseResult } from '../types/ast.js';
import { ParserError } from '../utils/errors.js';

export enum Language {
  TypeScript = 'typescript',
  JavaScript = 'javascript',
  Python = 'python',
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
  protected parser: InstanceType<typeof treeSitter> | null = null;
  protected language: Language;
  protected config: LanguageConfig;

  constructor(language: Language, config: LanguageConfig) {
    this.language = language;
    this.config = config;
  }

  protected ensureParserInitialized(): void {
    if (this.parser === null) {
      throw new ParserError('Parser not initialized');
    }
  }

  abstract parse(source: string, filePath?: string): ParseResult;

  async parseFile(filePath: string): Promise<ParseResult> {
    const { readFileSync } = await import('fs');
    const source = readFileSync(filePath, 'utf-8');
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
    const astNode: ASTNode = {
      type: rootNode.type,
      text: rootNode.text,
      startPosition: rootNode.startPosition,
      endPosition: rootNode.endPosition,
      children: [],
      namedChildren: [],
      parent,
    };

    for (let i = 0; i < rootNode.childCount; i++) {
      const child = rootNode.child(i);
      const astChild = this.convertTreeToAST(child, astNode);
      astChild.field = rootNode.fieldNameForChild(i) || undefined;
      astNode.children.push(astChild);
      if (child.isNamed) {
        astNode.namedChildren.push(astChild);
      }
    }

    return astNode;
  }
}
