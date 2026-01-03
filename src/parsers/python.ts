import treeSitter from 'tree-sitter';
import Python from 'tree-sitter-python';
import { BaseParser, Language, LanguageConfig } from './base.js';
import type { ParseResult } from '../types/ast.js';
import { ParserError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const Parser = treeSitter;

const PYTHON_CONFIG: LanguageConfig = {
  extensions: ['.py', '.pyw'],
  grammarName: 'python',
};

export class PythonParser extends BaseParser {
  constructor() {
    super(Language.Python, PYTHON_CONFIG);
    this.initializeParser();
  }

  private initializeParser(): void {
    this.parser = new Parser();
    this.parser.setLanguage(Python);

    logger.debug('Python parser initialized');
  }

  override parse(source: string, filePath?: string): ParseResult {
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
      throw new ParserError('Failed to parse Python file', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  extractTypeInfo(source: string, _filePath?: string) {
    this.ensureParserInitialized();
    const tree = this.parser!.parse(source);

    const functions: any[] = [];
    const variables: any[] = [];

    const traverse = (node: any) => {
      if (node.type === 'function_definition') {
        const nameNode = node.childForFieldName('name');
        const returnTypeNode = node.childForFieldName('return_type');
        const paramsNode = node.childForFieldName('parameters');

        const params: any[] = [];
        if (paramsNode) {
          for (const param of paramsNode.children) {
            if (['typed_parameter', 'typed_default_parameter'].includes(param.type)) {
              const pName = param.childForFieldName('name')?.text || param.children[0]?.text;
              const pType = param.childForFieldName('type')?.text || 'unknown';
              if (pName) params.push({ name: pName, type: pType });
            } else if (param.type === 'identifier') {
              params.push({ name: param.text, type: 'any' });
            } else if (param.type === 'default_parameter') {
              const pName = param.childForFieldName('name')?.text;
              if (pName) params.push({ name: pName, type: 'any' });
            }
          }
        }

        if (nameNode) {
          functions.push({
            name: nameNode.text,
            params,
            returnType: returnTypeNode?.text || 'any',
          });
        }
      } else if (node.type === 'assignment') {
        const left = node.childForFieldName('left');
        const type = node.childForFieldName('type');
        if (left && type) {
          variables.push({
            name: left.text,
            type: type.text,
          });
        }
      }

      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(tree.rootNode);

    return { functions, variables };
  }
}
