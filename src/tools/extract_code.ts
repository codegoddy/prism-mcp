import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { ParserError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { readFileSync } from 'fs';
import type { ASTNode } from '../types/ast.js';

export async function extractCode(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath, startLine, endLine, elementName, elementType } = args;

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

  try {
    logger.info('Extracting code', { filePath, startLine, endLine, elementName, elementType });

    const parser = ParserFactory.getParserForFile(filePath);
    const result = await parser.parseFile(filePath);
    const language = parser.getLanguage();

    let code: string;
    let metadata: any = {
      filePath,
      language,
    };

    if (typeof startLine === 'number' && typeof endLine === 'number') {
      // Extract by line numbers
      code = extractByLineNumbers(filePath, startLine, endLine);
      metadata.extractionMethod = 'line_numbers';
      metadata.startLine = startLine;
      metadata.endLine = endLine;
    } else if (typeof elementName === 'string') {
      // Extract by element name
      const extraction = extractByElementName(
        result.tree,
        filePath,
        elementName,
        elementType as string
      );
      if (!extraction) {
        return {
          content: [
            {
              type: 'text',
              text: `Element "${elementName}" not found in ${filePath}`,
            },
          ],
          isError: true,
        };
      }
      code = extraction.code;
      metadata = { ...metadata, ...extraction.metadata };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: 'Invalid arguments: either provide startLine/endLine or elementName',
          },
        ],
        isError: true,
      };
    }

    logger.info('Code extracted successfully', {
      filePath,
      codeLength: code.length,
      lines: code.split('\n').length,
    });

    const response = {
      metadata,
      code,
      lineCount: code.split('\n').length,
      charCount: code.length,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    logger.error('Failed to extract code', error as Error, { filePath });

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

function extractByLineNumbers(filePath: string, startLine: number, endLine: number): string {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Adjust for 0-based vs 1-based indexing
  const startIndex = Math.max(0, startLine - 1);
  const endIndex = Math.min(lines.length - 1, endLine - 1);

  return lines.slice(startIndex, endIndex + 1).join('\n');
}

function extractByElementName(
  root: ASTNode,
  filePath: string,
  elementName: string,
  elementType?: string
): { code: string; metadata: any } | null {
  const fileContent = readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n');

  function findElement(
    node: ASTNode,
    parentClass?: string
  ): { code: string; metadata: any } | null {
    const nodeType = node.type;

    // Check if this node matches the requested element
    let matches = false;
    let extractedType = '';

    if (
      (nodeType === 'function_declaration' || nodeType === 'function_definition') &&
      (!elementType || elementType === 'function')
    ) {
      const name = extractName(node);
      if (name === elementName) {
        matches = true;
        extractedType = 'function';
      }
    } else if (nodeType === 'method_definition' && (!elementType || elementType === 'method')) {
      const name = extractName(node);
      if (name === elementName) {
        matches = true;
        extractedType = 'method';
      }
    } else if (
      (nodeType === 'class_declaration' || nodeType === 'class_definition') &&
      (!elementType || elementType === 'class')
    ) {
      const name = extractName(node);
      if (name === elementName) {
        matches = true;
        extractedType = 'class';
      }
    }

    if (matches) {
      // Extract the source code for this element
      const startLine = node.startPosition.row;
      const endLine = node.endPosition.row;
      const code = lines.slice(startLine, endLine + 1).join('\n');

      const metadata = {
        elementName,
        elementType: extractedType,
        extractionMethod: 'element_name',
        startPosition: node.startPosition,
        endPosition: node.endPosition,
        parentClass,
      };

      return { code, metadata };
    }

    // Recursively search children
    for (const child of node.namedChildren) {
      let nextParentClass = parentClass;
      if (node.type === 'class_declaration' || node.type === 'class_definition') {
        nextParentClass = extractName(node);
      }

      const result = findElement(child, nextParentClass);
      if (result) return result;
    }

    return null;
  }

  return findElement(root);
}

function extractName(node: ASTNode): string {
  for (const child of node.namedChildren) {
    if (
      child.type === 'identifier' ||
      child.type === 'property_identifier' ||
      child.type === 'type_identifier'
    ) {
      return child.text;
    }
  }
  return '';
}

export default extractCode;
