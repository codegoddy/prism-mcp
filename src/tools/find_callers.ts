import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { ParserError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type {
  ASTNode,
  SymbolDefinition,
  SymbolReference,
  CallSite,
  FindCallersResult,
} from '../types/ast.js';
import { readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

export default async function findCallers(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath, functionName, methodName } = args;

  if (typeof filePath !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: filePath must be a string',
        },
      ],
      isError: true,
    };
  }

  if (typeof functionName !== 'string' && typeof methodName !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: either functionName or methodName must be provided',
        },
      ],
      isError: true,
    };
  }

  try {
    if (typeof filePath !== 'string') {
      throw new Error('filePath must be a string');
    }
    const validatedFilePath = filePath;
    logger.info('Finding callers', { filePath: validatedFilePath, functionName, methodName });

    const symbolName = (functionName || methodName) as string;
    const isMethod = typeof methodName === 'string';

    const projectDir = getProjectDirectory(validatedFilePath);
    const files = findSourceFiles(projectDir);

    const symbolTable = await buildSymbolTable(files);
    const symbolDefinition = findSymbolDefinition(
      symbolTable,
      validatedFilePath,
      symbolName,
      isMethod
    );

    if (!symbolDefinition) {
      return {
        content: [
          {
            type: 'text',
            text: `Symbol "${symbolName}" not found in ${validatedFilePath}`,
          },
        ],
        isError: true,
      };
    }

    const callers = await findCallersForSymbol(symbolTable, symbolDefinition, files);

    const result: FindCallersResult = {
      symbol: {
        name: symbolName,
        type: symbolDefinition.type,
        filePath: symbolDefinition.filePath,
        line: symbolDefinition.startPosition.row + 1,
      },
      callers: callers.map((ref) => formatCallSite(ref, symbolName)),
      totalCount: callers.length,
    };

    logger.info('Found callers', {
      symbol: symbolName,
      callerCount: callers.length,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to find callers', error as Error, { filePath });

    if (error instanceof ParserError) {
      return {
        content: [{ type: 'text', text: error.message }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

function getProjectDirectory(filePath: string): string {
  const stats = statSync(filePath);
  if (stats.isDirectory()) {
    return filePath;
  }
  return filePath.split('/').slice(0, -1).join('/') || '.';
}

function findSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.pyw'];

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && !entry.name.startsWith('.')) {
        files.push(...findSourceFiles(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = extname(fullPath);
      if (extensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

interface SymbolTable {
  [symbolId: string]: SymbolDefinition;
}

export async function buildSymbolTable(files: string[]): Promise<SymbolTable> {
  const symbolTable: SymbolTable = {};

  for (const file of files) {
    try {
      const parser = ParserFactory.getParserForFile(file);
      const result = await parser.parseFile(file);
      const symbols = extractSymbols(result.tree, file);

      for (const symbol of symbols) {
        const id = generateSymbolId(symbol);
        symbolTable[id] = symbol;
      }
    } catch (error) {
      logger.warn(`Failed to parse ${file}`, error as Record<string, unknown>);
    }
  }

  return symbolTable;
}

function extractSymbols(root: ASTNode, filePath: string): SymbolDefinition[] {
  const symbols: SymbolDefinition[] = [];

  function traverse(node: ASTNode, parentClass?: string, parentFunction?: string): void {
    switch (node.type) {
      case 'function_declaration':
      case 'function_definition': {
        const isMethod = parentClass !== undefined;
        symbols.push({
          id: generateSymbolId({
            name: extractName(node),
            className: parentClass,
            filePath,
            type: isMethod ? 'method' : 'function',
          }),
          name: extractName(node),
          type: isMethod ? 'method' : 'function',
          className: parentClass,
          filePath,
          startPosition: node.startPosition,
          endPosition: node.endPosition,
          isExported: isExported(node),
        });
        break;
      }

      case 'method_definition': {
        symbols.push({
          id: generateSymbolId({
            name: extractName(node),
            className: parentClass,
            filePath,
            type: 'method',
          }),
          name: extractName(node),
          type: 'method',
          className: parentClass,
          filePath,
          startPosition: node.startPosition,
          endPosition: node.endPosition,
        });
        break;
      }

      case 'class_declaration':
      case 'class_definition': {
        const className = extractClassName(node);
        symbols.push({
          id: generateSymbolId({ name: className, filePath, type: 'class' }),
          name: className,
          type: 'class',
          filePath,
          startPosition: node.startPosition,
          endPosition: node.endPosition,
        });

        // Methods are now handled in the traverse below
        break;
      }

      case 'variable_declaration':
      case 'lexical_declaration':
        for (const declarator of node.namedChildren.filter(
          (n) => n.type === 'variable_declarator'
        )) {
          const varName = extractName(declarator);
          if (varName) {
            symbols.push({
              id: generateSymbolId({ name: varName, filePath, type: 'variable' }),
              name: varName,
              type: 'variable',
              filePath,
              startPosition: declarator.startPosition,
              endPosition: declarator.endPosition,
              isExported: isExported(declarator),
            });
          }
        }
        break;

      case 'formal_parameters':
        for (const param of node.namedChildren.filter(
          (n) =>
            n.type === 'identifier' ||
            n.type === 'required_parameter' ||
            n.type === 'optional_parameter'
        )) {
          const paramName = extractName(param);
          if (paramName) {
            symbols.push({
              id: generateSymbolId(
                {
                  name: paramName,
                  filePath,
                  type: 'parameter',
                },
                parentFunction
              ),
              name: paramName,
              type: 'parameter',
              filePath,
              startPosition: param.startPosition,
              endPosition: param.endPosition,
            });
          }
        }
        break;

      case 'decorated_definition':
        for (const child of node.namedChildren) {
          traverse(child, parentClass, parentFunction);
        }
        break;
    }

    for (const child of node.namedChildren) {
      let nextParentClass = parentClass;
      if (node.type === 'class_declaration' || node.type === 'class_definition') {
        nextParentClass = extractClassName(node);
      }

      if (node.type === 'function_declaration' || node.type === 'function_definition') {
        nextParentClass = parentClass;
      }

      traverse(child, nextParentClass, parentFunction || extractName(node));

      if (child.type === 'block') {
        let blockParentClass = nextParentClass;
        if (node.type === 'class_declaration' || node.type === 'class_definition') {
          blockParentClass = extractClassName(node);
        }

        for (const blockChild of child.namedChildren) {
          traverse(blockChild, blockParentClass, parentFunction || extractName(blockChild));
        }
        for (const blockChild of child.children || []) {
          if (
            blockChild.type !== 'indent' &&
            blockChild.type !== 'dedent' &&
            blockChild.type !== 'newline'
          ) {
            traverse(blockChild, blockParentClass, parentFunction || extractName(blockChild));
          }
        }
      }
    }
  }

  traverse(root);
  return symbols;
}

function extractClassName(node: ASTNode): string {
  for (const child of node.namedChildren) {
    if (child.type === 'type_identifier' || child.type === 'identifier') {
      return child.text;
    }
  }
  return '';
}

function extractName(node: ASTNode): string {
  for (const child of node.namedChildren) {
    if (child.type === 'identifier' || child.type === 'property_identifier') {
      return child.text;
    }
  }
  return '';
}

function isExported(node: ASTNode): boolean {
  return node.children.some(
    (child) => child.type === 'export' || child.type === 'export_statement'
  );
}

function generateSymbolId(symbol: Partial<SymbolDefinition>, parentFunction?: string): string {
  const parts = [symbol.type, symbol.name];

  if (symbol.className) {
    parts.push(symbol.className);
  }

  if (parentFunction) {
    parts.push(parentFunction);
  }

  if (symbol.filePath) {
    parts.push(symbol.filePath);
  }

  return parts.join(':');
}

export function findSymbolDefinition(
  symbolTable: SymbolTable,
  filePath: string,
  name: string,
  isMethod: boolean
): SymbolDefinition | undefined {
  const candidates = Object.values(symbolTable).filter(
    (sym) => sym.name === name && sym.filePath === filePath
  );

  if (candidates.length === 0) {
    return undefined;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  return candidates.find((sym) => sym.type === (isMethod ? 'method' : 'function'));
}

async function findCallersForSymbol(
  _symbolTable: SymbolTable,
  symbol: SymbolDefinition,
  files: string[]
): Promise<SymbolReference[]> {
  const callers: SymbolReference[] = [];

  for (const file of files) {
    try {
      const parser = ParserFactory.getParserForFile(file);
      const result = await parser.parseFile(file);
      const references = findReferences(result.tree, file, symbol);

      callers.push(...references);
    } catch (error) {
      logger.warn(
        `Failed to parse ${file} for reference finding`,
        error as Record<string, unknown>
      );
    }
  }

  return callers;
}

export function findReferences(
  root: ASTNode,
  filePath: string,
  targetSymbol: SymbolDefinition
): SymbolReference[] {
  const references: SymbolReference[] = [];

  function traverse(node: ASTNode, parentClass?: string, parentFunction?: string): void {
    let isReference = false;
    let callType: 'direct' | 'method' | 'callback' | 'indirect' = 'direct';

    if (node.type === 'call_expression' || node.type === 'call') {
      const funcNode = node.namedChildren[0];

      if (funcNode && (targetSymbol.type === 'function' || targetSymbol.type === 'method')) {
        if (funcNode.type === 'identifier' && funcNode.text === targetSymbol.name) {
          isReference = true;
        } else if (funcNode.type === 'member_expression') {
          const memberNames = funcNode.namedChildren.filter(
            (n) => n.type === 'property_identifier' || n.type === 'identifier'
          );

          if (
            memberNames.length > 0 &&
            memberNames[memberNames.length - 1]?.text === targetSymbol.name
          ) {
            isReference = true;
            callType = 'method';
          }
        } else if (funcNode.type === 'attribute' && targetSymbol.type === 'function') {
          const attrName = funcNode.namedChildren.find((n) => n.type === 'identifier');
          if (attrName && attrName.text === targetSymbol.name) {
            isReference = true;
          }
        }
      }
    } else if (node.type === 'member_expression' && targetSymbol.type === 'variable') {
      const memberNames = node.namedChildren.filter(
        (n) => n.type === 'property_identifier' || n.type === 'identifier'
      );

      if (
        memberNames.length > 0 &&
        memberNames[memberNames.length - 1]?.text === targetSymbol.name
      ) {
        isReference = true;
        callType = 'method';
      }
    } else if (node.type === 'identifier' && targetSymbol.type === 'variable') {
      if (node.text === targetSymbol.name) {
        isReference = true;
        callType = 'direct';
      }
    } else if (node.type === 'arguments') {
      for (const arg of node.namedChildren) {
        if (arg.type === 'identifier' && arg.text === targetSymbol.name) {
          isReference = true;
          callType = 'callback';
        }
      }
    }

    if (isReference) {
      references.push({
        symbolId: targetSymbol.id,
        filePath,
        startPosition: node.startPosition,
        endPosition: node.endPosition,
        context: {
          parentFunction,
          parentClass,
          callType,
        },
      });
    }

    for (const child of node.namedChildren) {
      let nextParentClass = parentClass;

      if (node.type === 'class_declaration' || node.type === 'class_definition') {
        nextParentClass = extractName(node);
      }

      traverse(child, nextParentClass, parentFunction || extractName(node));
    }
  }

  traverse(root);
  return references;
}

function formatCallSite(reference: SymbolReference, symbolName: string): CallSite {
  return {
    filePath: reference.filePath,
    lineNumber: reference.startPosition.row + 1,
    columnNumber: reference.startPosition.column,
    functionName: symbolName,
    callerFunction: reference.context.parentFunction,
    callerClass: reference.context.parentClass,
    callType: reference.context.callType,
  };
}
