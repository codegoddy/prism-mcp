import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { ParserError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { ASTNode, SemanticQuery, SemanticSearchResult, SearchResult } from '../types/ast.js';

export async function semanticSearch(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath, query } = args;

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

  if (typeof query !== 'object' || query === null) {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: query must be an object',
        },
      ],
      isError: true,
    };
  }

  try {
    logger.info('Performing semantic search', { filePath, query });

    const parser = ParserFactory.getParserForFile(filePath);
    const result = await parser.parseFile(filePath);
    const language = parser.getLanguage();

    const searchResults = performSearch(result.tree, filePath, language, query as SemanticQuery);

    const response: SemanticSearchResult = {
      filePath,
      language,
      query: query as SemanticQuery,
      results: searchResults,
      totalMatches: searchResults.length,
    };

    logger.info('Semantic search completed', {
      filePath,
      matches: searchResults.length,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to perform semantic search', error as Error, { filePath });

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

function performSearch(
  root: ASTNode,
  filePath: string,
  _language: string,
  query: SemanticQuery
): SearchResult[] {
  const results: SearchResult[] = [];

  function traverse(
    node: ASTNode,
    parentClass?: string,
    parentFunction?: string,
    isExported = false,
    inheritedDecorators: string[] = []
  ): void {
    let match = false;
    let nodeResult: Partial<SearchResult> = {
      name: '',
      type: 'function',
      filePath,
      startPosition: node.startPosition,
      endPosition: node.endPosition,
      parentClass,
      parentFunction,
    };

    const nodeType = node.type;

    if (query.nodeType) {
      if (
        query.nodeType === 'function' &&
        (nodeType === 'function_declaration' ||
          nodeType === 'function_definition' ||
          nodeType === 'async_function_definition' ||
          nodeType === 'method_definition')
      ) {
        match = true;
        nodeResult.type = nodeType === 'method_definition' ? 'method' : 'function';
      } else if (
        query.nodeType === 'class' &&
        (nodeType === 'class_declaration' || nodeType === 'class_definition')
      ) {
        match = true;
        nodeResult.type = 'class';
      } else if (
        query.nodeType === 'variable' &&
        (nodeType === 'variable_declaration' ||
          nodeType === 'lexical_declaration' ||
          nodeType === 'expression_statement')
      ) {
        match = true;
        nodeResult.type = 'variable';
      }
    } else {
      if (
        nodeType === 'function_declaration' ||
        nodeType === 'function_definition' ||
        nodeType === 'async_function_definition' ||
        nodeType === 'method_definition'
      ) {
        match = true;
        nodeResult.type = nodeType === 'method_definition' ? 'method' : 'function';
      } else if (nodeType === 'class_declaration' || nodeType === 'class_definition') {
        match = true;
        nodeResult.type = 'class';
      } else if (
        nodeType === 'variable_declaration' ||
        nodeType === 'lexical_declaration' ||
        nodeType === 'expression_statement'
      ) {
        match = true;
        nodeResult.type = 'variable';
      }
    }

    if (match) {
      const extracted = extractNodeInfo(node, nodeResult.type || 'function', _language, isExported);
      nodeResult = { ...nodeResult, ...extracted };

      if (inheritedDecorators.length > 0) {
        nodeResult.modifiers = [...(nodeResult.modifiers || []), ...inheritedDecorators];
      }

      if (query.namePattern) {
        const regex = new RegExp(query.namePattern);
        if (!nodeResult.name || !regex.test(nodeResult.name)) {
          match = false;
        }
      }

      if (match && query.returnType) {
        if (nodeResult.returnType !== query.returnType) {
          match = false;
        }
      }

      if (match && query.parameters && query.parameters.length > 0) {
        if (!nodeResult.parameters || nodeResult.parameters.length !== query.parameters.length) {
          match = false;
        } else {
          for (let i = 0; i < query.parameters.length; i++) {
            const queryParam = query.parameters[i];
            const nodeParam = nodeResult.parameters[i];

            if (!nodeParam || !queryParam) {
              match = false;
              break;
            }

            if (queryParam.name && queryParam.name !== nodeParam.name) {
              match = false;
              break;
            }

            if (queryParam.type && nodeParam.type !== queryParam.type) {
              match = false;
              break;
            }
          }
        }
      }

      if (match && query.modifiers && query.modifiers.length > 0) {
        for (const modifier of query.modifiers) {
          const hasModifier = (nodeResult.modifiers || []).includes(modifier);
          if (!hasModifier) {
            match = false;
            break;
          }
        }
      }

      if (match) {
        results.push(nodeResult as SearchResult);
      }
    }

    let nextParentClass = parentClass;
    let nextParentFunction = parentFunction;
    let nextIsExported = isExported;
    let nextDecorators = [...inheritedDecorators];

    if (nodeType === 'class_declaration' || nodeType === 'class_definition') {
      const className = extractClassName(node);
      if (className) nextParentClass = className;
    } else if (
      nodeType === 'function_declaration' ||
      nodeType === 'function_definition' ||
      nodeType === 'async_function_definition' ||
      nodeType === 'method_definition'
    ) {
      const funcName = extractName(node);
      if (funcName) nextParentFunction = funcName;
    } else if (nodeType === 'export_statement') {
      nextIsExported = true;
    }

    if (nodeType === 'decorated_definition') {
      const decorators: string[] = [];

      for (const child of node.namedChildren) {
        if (child.type === 'decorator') {
          const decorator = extractDecorator(child);
          if (decorator) {
            decorators.push(decorator);
          }
        } else {
          traverse(child, nextParentClass, nextParentFunction, nextIsExported, decorators);
        }
      }
    } else {
      for (const child of node.namedChildren) {
        traverse(child, nextParentClass, nextParentFunction, nextIsExported, nextDecorators);
      }
    }
  }

  traverse(root);
  return results;
}

export { performSearch };

function extractNodeInfo(
  node: ASTNode,
  nodeType: string,
  _language: string,
  isExported = false
): Partial<SearchResult> {
  const info: Partial<SearchResult> = {
    name: '',
    parameters: [],
    modifiers: [],
  };

  const name = extractName(node);
  if (name) {
    info.name = name;
  }

  if (nodeType === 'function' || nodeType === 'method') {
    const functionInfo = extractFunctionInfo(node, isExported);
    info.parameters = functionInfo.parameters;
    info.returnType = functionInfo.returnType;
    info.modifiers = functionInfo.modifiers;
  } else if (nodeType === 'class') {
    const classInfo = extractClassInfo(node);
    info.extends = classInfo.extends;
    info.implements = classInfo.implements;
    info.modifiers = classInfo.modifiers;
  } else if (nodeType === 'variable') {
    const variableInfo = extractVariableInfo(node);
    info.varType = variableInfo.varType;
    info.modifiers = variableInfo.modifiers;
    if (isExported) {
      info.modifiers.push('export');
    }
  }

  return info;
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
  for (const child of node.children) {
    if (child.type === 'variable_declarator') {
      for (const declarator of child.namedChildren) {
        if (declarator.type === 'identifier' || declarator.type === 'property_identifier') {
          return declarator.text;
        }
      }
    }
  }
  return '';
}

function extractClassName(node: ASTNode): string {
  for (const child of node.namedChildren) {
    if (child.type === 'type_identifier' || child.type === 'identifier') {
      return child.text;
    }
  }
  return '';
}

function extractFunctionInfo(
  node: ASTNode,
  isExported = false
): {
  parameters: { name: string; type?: string }[];
  returnType?: string;
  modifiers: string[];
} {
  const info = {
    parameters: [] as { name: string; type?: string }[],
    returnType: undefined as string | undefined,
    modifiers: [] as string[],
  };

  if (isExported) {
    info.modifiers.push('export');
  }

  for (const child of node.children) {
    if (child.type === 'async' || node.type === 'async_function_definition') {
      info.modifiers.push('async');
    } else if (child.type === 'generator_modifier') {
      info.modifiers.push('generator');
    } else if (child.type === 'static' || child.type === 'static_modifier') {
      info.modifiers.push('static');
    } else if (child.type === 'export' || child.type === 'export_statement') {
      info.modifiers.push('export');
    } else if (child.type === 'formal_parameters' || child.type === 'parameters') {
      info.parameters = extractParameters(child);
    } else if (child.type === 'type_annotation') {
      const typeNode = child.namedChildren.find(
        (n) => n.type === 'type_identifier' || n.type === 'type' || n.type.includes('type')
      );
      if (typeNode) info.returnType = typeNode.text;
    } else if (child.type === 'type') {
      info.returnType = child.text;
    } else if (child.type === 'decorator') {
      const decorator = extractDecorator(child);
      if (decorator) info.modifiers.push(decorator);
    }
  }

  return info;
}

function extractParameters(node: ASTNode): { name: string; type?: string }[] {
  const parameters: { name: string; type?: string }[] = [];

  for (const child of node.namedChildren) {
    if (child.type === 'identifier' || child.type === 'property_identifier') {
      parameters.push({ name: child.text });
    } else if (child.type === 'required_parameter' || child.type === 'optional_parameter') {
      const param: { name: string; type?: string } = { name: '' };
      for (const p of child.namedChildren) {
        if (p.type === 'identifier' || p.type === 'property_identifier') {
          param.name = p.text;
        } else if (p.type === 'type_annotation') {
          const typeNode = p.namedChildren.find(
            (n) => n.type === 'type_identifier' || n.type.includes('type')
          );
          if (typeNode) param.type = typeNode.text;
        } else if (p.type === 'type') {
          param.type = p.text;
        }
      }
      if (param.name) parameters.push(param);
    } else if (child.type === 'typed_parameter') {
      const param: { name: string; type?: string } = { name: '' };
      for (const p of child.namedChildren) {
        if (p.type === 'identifier') {
          param.name = p.text;
        } else if (p.type === 'type') {
          param.type = p.text;
        }
      }
      if (param.name) parameters.push(param);
    } else if (child.type === 'default_parameter') {
      const param: { name: string; type?: string } = { name: '' };
      for (const p of child.namedChildren) {
        if (p.type === 'identifier') {
          param.name = p.text;
        } else if (p.type === 'type' || p.type === 'type_annotation') {
          const typeNode =
            p.type === 'type_annotation'
              ? p.namedChildren.find((n) => n.type === 'type_identifier' || n.type === 'type')
              : p;
          if (typeNode) param.type = typeNode.text;
        }
      }
      if (param.name) parameters.push(param);
    }
  }

  return parameters;
}

function extractClassInfo(node: ASTNode): {
  extends?: string;
  implements?: string[];
  modifiers: string[];
} {
  const info = {
    extends: undefined as string | undefined,
    implements: undefined as string[] | undefined,
    modifiers: [] as string[],
  };

  for (const child of node.children) {
    if (child.type === 'export' || child.type === 'export_statement') {
      info.modifiers.push('export');
    } else if (child.type === 'abstract_modifier') {
      info.modifiers.push('abstract');
    } else if (child.type === 'class_heritage') {
      for (const heritage of child.namedChildren) {
        if (heritage.type.includes('extends')) {
          const identifier = heritage.namedChildren.find(
            (n) => n.type === 'type_identifier' || n.type === 'identifier'
          );
          if (identifier) info.extends = identifier.text;
        } else if (heritage.type.includes('implements')) {
          const identifiers = heritage.namedChildren.filter((n) => n.type === 'type_identifier');
          info.implements = identifiers.map((n) => n.text);
          if (info.implements.length > 0) {
            info.modifiers.push('implements');
          }
        }
      }
    } else if (child.type === 'argument_list') {
      const identifiers = child.namedChildren.filter(
        (n) => n.type === 'identifier' || n.type === 'dotted_name'
      );
      if (identifiers.length > 0) {
        info.extends = identifiers.map((n) => n.text).join(', ');
      }
    } else if (child.type === 'decorator') {
      const decorator = extractDecorator(child);
      if (decorator) info.modifiers.push(decorator);
    }
  }

  for (const child of node.namedChildren) {
    if (child.type === 'class_heritage') {
      for (const heritage of child.namedChildren) {
        if (heritage.type.includes('extends')) {
          const identifier = heritage.namedChildren.find(
            (n) => n.type === 'type_identifier' || n.type === 'identifier'
          );
          if (identifier) info.extends = identifier.text;
        } else if (heritage.type.includes('implements')) {
          const identifiers = heritage.namedChildren.filter((n) => n.type === 'type_identifier');
          info.implements = identifiers.map((n) => n.text);
          if (info.implements.length > 0) {
            info.modifiers.push('implements');
          }
        }
      }
    } else if (child.type === 'argument_list') {
      const identifiers = child.namedChildren.filter(
        (n) => n.type === 'identifier' || n.type === 'dotted_name'
      );
      if (identifiers.length > 0) {
        info.extends = identifiers.map((n) => n.text).join(', ');
      }
    }
  }

  if (info.extends === '') {
    info.extends = undefined;
  }

  return info;
}

function extractVariableInfo(node: ASTNode): {
  varType?: string;
  modifiers: string[];
} {
  const info = {
    varType: undefined as string | undefined,
    modifiers: [] as string[],
  };

  for (const child of node.children) {
    if (child.type === 'const' || child.type === 'let' || child.type === 'var') {
      info.modifiers.push(child.type);
    } else if (child.type === 'export' || child.type === 'export_statement') {
      info.modifiers.push('export');
    } else if (child.type === 'readonly_modifier') {
      info.modifiers.push('readonly');
    } else if (child.type === 'static_modifier') {
      info.modifiers.push('static');
    } else if (child.type === 'variable_declarator') {
      for (const declarator of child.namedChildren) {
        if (declarator.type === 'type_annotation') {
          const typeNode = declarator.namedChildren.find((n) => n.type === 'type_identifier');
          if (typeNode) info.varType = typeNode.text;
        } else if (declarator.type === 'identifier') {
          const annotation = child.namedChildren.find((n) => n.type === 'type_annotation');
          if (annotation) {
            const typeNode = annotation.namedChildren.find((n) => n.type === 'type_identifier');
            if (typeNode) info.varType = typeNode.text;
          }
        }
      }
    } else if (node.type === 'expression_statement') {
      const assignment =
        child.type === 'assignment'
          ? child
          : child.namedChildren.find((n) => n.type === 'assignment');
      if (assignment) {
        for (const a of assignment.namedChildren) {
          if (a.type === 'type_annotation') {
            const typeNode = a.namedChildren.find(
              (n) => n.type === 'type_identifier' || n.type === 'type'
            );
            if (typeNode) info.varType = typeNode.text;
          }
        }
      }
    }
  }

  for (const child of node.namedChildren) {
    if (child.type === 'variable_declarator') {
      for (const declarator of child.namedChildren) {
        if (declarator.type === 'type_annotation') {
          const typeNode = declarator.namedChildren.find((n) => n.type === 'type_identifier');
          if (typeNode) info.varType = typeNode.text;
        } else if (declarator.type === 'identifier') {
          const annotation = child.namedChildren.find((n) => n.type === 'type_annotation');
          if (annotation) {
            const typeNode = annotation.namedChildren.find((n) => n.type === 'type_identifier');
            if (typeNode) info.varType = typeNode.text;
          }
        }
      }
    }
  }

  return info;
}

function extractDecorator(node: ASTNode): string | undefined {
  const identifier = node.namedChildren.find(
    (n) =>
      n.type === 'identifier' ||
      n.type === 'decorator_identifier' ||
      n.type === 'attribute' ||
      n.type === 'call'
  );
  const result = identifier ? identifier.text.replace(/[()@]/g, '') : undefined;
  return result;
}

export default semanticSearch;
