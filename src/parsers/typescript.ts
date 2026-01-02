import treeSitter from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { parse as parseESTree } from '@typescript-eslint/parser';
import { BaseParser, Language, LanguageConfig } from './base.js';
import type { ParseResult } from '../types/ast.js';
import { ParserError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const Parser = treeSitter;

const TYPESCRIPT_CONFIG: LanguageConfig = {
  extensions: ['.ts', '.tsx'],
  grammarName: 'typescript',
};

const JAVASCRIPT_CONFIG: LanguageConfig = {
  extensions: ['.js', '.jsx', '.mjs'],
  grammarName: 'javascript',
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
      this.parser.setLanguage(TypeScript.typescript);
    }

    logger.debug('TypeScript parser initialized', { language: this.language });
  }

  parse(source: string, filePath?: string): ParseResult {
    this.ensureParserInitialized();

    const startTime = performance.now();

    try {
      const tree = this.parser!.parse(source);

      const errors = tree.rootNode.descendantsOfType('ERROR').map((node: any) => ({
        message: `Syntax error at line ${node.startPosition.row + 1}`,
        startPosition: node.startPosition,
        endPosition: node.endPosition,
      }));

      const rootAST = this.convertTreeToAST(tree.rootNode);

      const parseTime = performance.now() - startTime;

      logger.debug('File parsed successfully', {
        language: this.language,
        filePath,
        parseTime,
        errorCount: errors.length,
      });

      return {
        tree: rootAST,
        errors,
        parseTime,
      };
    } catch (error) {
      logger.error('Failed to parse source', error as Error, { filePath });
      throw new ParserError(`Failed to parse ${this.language} file`, {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  parseRich(source: string, filePath?: string) {
    const startTime = performance.now();
    const useJsx = filePath ? /\.[jt]sx$/.test(filePath) : false;

    try {
      const program = parseESTree(source, {
        sourceType: 'module',
        ecmaFeatures: {
          jsx: useJsx,
        },
        range: true,
        loc: true,
        filePath,
        comment: true,
        tokens: true,
      });

      const parseTime = performance.now() - startTime;
      logger.debug('File parsed with @typescript-eslint/parser', {
        filePath,
        parseTime,
      });

      return program;
    } catch (error) {
      logger.error('Failed to parse with @typescript-eslint/parser', error as Error, { filePath });
      throw new ParserError(`Failed to parse ${this.language} file with rich parser`, {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  extractTypeInfo(source: string, filePath?: string) {
    const program = this.parseRich(source, filePath);
    const info: any[] = [];
    
    // Simple helper to find functions
    const visit = (node: any) => {
        if (!node || typeof node !== 'object') return;
        
        if (node.type === 'FunctionDeclaration' && node.id) {
            const params = node.params.map((p: any) => ({
                name: p.name,
                type: p.typeAnnotation?.typeAnnotation?.type || 'unknown' // Simplified
            }));
            const returnType = node.returnType?.typeAnnotation?.type || 'unknown';
            
            info.push({
                name: node.id.name,
                params,
                returnType
            });
        }
        
        // Recurse (simplified for body)
        if (node.body) {
             if (Array.isArray(node.body)) node.body.forEach(visit);
             else visit(node.body);
        }
    };
    
    if (program.body) {
        program.body.forEach(visit);
    }
    
    return info;
  }
}
