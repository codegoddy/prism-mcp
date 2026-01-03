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

  private initializeParser(useJsx: boolean = false): void {
    this.parser = new Parser();

    if (this.language === Language.TypeScript) {
      this.parser.setLanguage(useJsx ? TypeScript.tsx : TypeScript.typescript);
    } else {
      this.parser.setLanguage(useJsx ? TypeScript.tsx : TypeScript.typescript);
    }

    logger.debug('TypeScript parser initialized', { language: this.language, useJsx });
  }

  override async parseFile(filePath: string): Promise<ParseResult> {
    const { readFileSync } = await import('fs');
    const source = readFileSync(filePath, 'utf-8');
    const useJsx = /\.[jt]sx$/.test(filePath);
    this.initializeParser(useJsx);
    return this.parse(source, filePath);
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
      throw new ParserError(`Failed to parse ${this.language} file`, {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  parseRich(source: string, filePath?: string): any {
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

  extractTypeInfo(source: string, filePath?: string): any[] {
    const program = this.parseRich(source, filePath);
    const info: any[] = [];

    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'FunctionDeclaration' && node.id) {
        const typeParams = extractTypeParameters(node);
        const params = node.params.map((p: any) => ({
          name: p.name,
          type: extractTypeAnnotation(p.typeAnnotation),
          typeParameters: typeParams,
        }));
        const returnType = extractTypeAnnotation(node.returnType);

        const advancedInfo = extractAdvancedTypeInfo(returnType);

        info.push({
          name: node.id.name,
          params,
          returnType,
          typeParameters: typeParams,
          advancedTypeInfo: advancedInfo,
        });
      }

      if (node.type === 'TSTypeAliasDeclaration' && node.id) {
        const typeDefinition = extractTypeAnnotation(node.typeAnnotation);
        const typeParams = extractTypeParameters(node);

        const advancedInfo = extractAdvancedTypeInfo(typeDefinition);

        info.push({
          name: node.id.name,
          type: 'type_alias',
          typeDefinition,
          typeParameters: typeParams,
          advancedTypeInfo: advancedInfo,
        });
      }

      if (node.type === 'TSInterfaceDeclaration' && node.id) {
        const typeParams = extractTypeParameters(node);
        const properties = extractInterfaceProperties(node);

        info.push({
          name: node.id.name,
          type: 'interface',
          properties,
          typeParameters: typeParams,
        });
      }

      if (node.type === 'TSConditionalType') {
        const checkType = extractTypeAnnotation(node.checkType);
        const extendsType = extractTypeAnnotation(node.extendsType);
        const trueType = extractTypeAnnotation(node.trueType);
        const falseType = extractTypeAnnotation(node.falseType);

        info.push({
          type: 'conditional_type',
          checkType,
          extendsType,
          trueType,
          falseType,
        });
      }

      if (node.type === 'TSTemplateLiteralType') {
        const templateParts = extractTemplateLiteralParts(node);
        const inferredType = buildTemplateLiteralType(templateParts);

        info.push({
          type: 'template_literal_type',
          parts: templateParts,
          inferredType,
        });
      }

      if (node.body) {
        if (Array.isArray(node.body)) node.body.forEach(visit);
        else visit(node.body);
      }

      if (node.expression?.body) {
        if (Array.isArray(node.expression.body)) node.expression.body.forEach(visit);
        else visit(node.expression.body);
      }

      if (node.declarations) {
        node.declarations.forEach((d: any) => visit(d));
      }

      if (node.trueType) visit(node.trueType);
      if (node.falseType) visit(node.falseType);
      if (node.typeAnnotation) visit(node.typeAnnotation);
      if (node.typeParameters) visit(node.typeParameters);
    };

    if (program.body) {
      program.body.forEach(visit);
    }

    return info;
  }
}

function extractTypeAnnotation(node: any): string {
  if (!node) return 'unknown';

  // Handle TSTypeAnnotation wrapper - drill down to the actual type
  if (node.type === 'TSTypeAnnotation' && node.typeAnnotation) {
    return extractTypeAnnotation(node.typeAnnotation);
  }

  if (node.type === 'TSTypeReference' && node.typeName) {
    const typeName = node.typeName.name || node.typeName;

    if (node.typeParameters?.params?.length > 0) {
      const typeArgs = node.typeParameters.params
        .map((p: any) => extractTypeAnnotation(p))
        .join(', ');
      return `${typeName}<${typeArgs}>`;
    }
    return typeName;
  }

  if (node.type === 'TSNumberKeyword') return 'number';
  if (node.type === 'TSStringKeyword') return 'string';
  if (node.type === 'TSBooleanKeyword') return 'boolean';
  if (node.type === 'TSUnknownKeyword') return 'unknown';
  if (node.type === 'TSAnyKeyword') return 'any';
  if (node.type === 'TSNeverKeyword') return 'never';
  if (node.type === 'TSVoidKeyword') return 'void';
  if (node.type === 'TSUndefinedKeyword') return 'undefined';
  if (node.type === 'TSNullKeyword') return 'null';
  if (node.type === 'TSObjectKeyword') return 'object';

  if (node.type === 'TSArrayType') {
    const elementType = extractTypeAnnotation(node.elementType);
    return `${elementType}[]`;
  }

  if (node.type === 'TSUnionType') {
    const types = node.types?.map((t: any) => extractTypeAnnotation(t)).join(' | ');
    return types || 'unknown';
  }

  if (node.type === 'TSIntersectionType') {
    const types = node.types?.map((t: any) => extractTypeAnnotation(t)).join(' & ');
    return types || 'unknown';
  }

  if (node.type === 'TSLiteralType') {
    if (node.literal?.value !== undefined) {
      const value =
        typeof node.literal.value === 'string' ? `'${node.literal.value}'` : node.literal.value;
      return String(value);
    }
    if (node.literal?.type === 'UnaryExpression') {
      return '-' + node.literal.argument.value;
    }
    return 'unknown';
  }

  if (node.type === 'TSTypeLiteral') {
    const props = node.members
      ?.map((m: any) => {
        const keyName = m.key?.name || m.key?.value || 'unknown';
        const propType = extractTypeAnnotation(m.typeAnnotation?.typeAnnotation);
        const optional = m.optional ? '?' : '';
        return `${keyName}${optional}: ${propType}`;
      })
      .join('; ');
    return `{ ${props || ''} }`;
  }

  if (node.type === 'TSFunctionType') {
    const params = node.params
      ?.map((p: any) => {
        const name = p.name || p.pattern?.name || 'arg';
        const paramType = extractTypeAnnotation(p.typeAnnotation?.typeAnnotation);
        return `${name}: ${paramType}`;
      })
      .join(', ');
    const returnType = extractTypeAnnotation(node.typeAnnotation?.typeAnnotation);
    return `(${params}) => ${returnType}`;
  }

  if (node.type === 'TSConditionalType') {
    const checkType = extractTypeAnnotation(node.checkType);
    const extendsType = extractTypeAnnotation(node.extendsType);
    const trueType = extractTypeAnnotation(node.trueType);
    const falseType = extractTypeAnnotation(node.falseType);
    return `${checkType} extends ${extendsType} ? ${trueType} : ${falseType}`;
  }

  if (node.type === 'TSTemplateLiteralType') {
    const parts = extractTemplateLiteralParts(node);
    return buildTemplateLiteralType(parts);
  }

  if (node.type === 'TSInferType') {
    const typeParameter = node.typeParameter?.name || 'unknown';
    return `infer ${typeParameter}`;
  }

  if (node.type === 'TSTypeOperator') {
    const operand = extractTypeAnnotation(node.typeAnnotation);
    if (node.operator === 'keyof') return `keyof ${operand}`;
    if (node.operator === 'unique') return `unique ${operand}`;
    if (node.operator === 'readonly') return `readonly ${operand}`;
    return operand;
  }

  if (node.type === 'TSTypeQuery') {
    return `typeof ${node.exprName?.name || 'unknown'}`;
  }

  if (node.type === 'IndexedAccessType') {
    const objectType = extractTypeAnnotation(node.objectType);
    const indexType = extractTypeAnnotation(node.indexType);
    return `${objectType}[${indexType}]`;
  }

  if (node.type === 'TSParenthesizedType') {
    return `(${extractTypeAnnotation(node.typeAnnotation)})`;
  }

  if (node.type === 'TSTupleType') {
    const elements = node.elementTypes?.map((t: any) => extractTypeAnnotation(t)).join(', ');
    return `[${elements || ''}]`;
  }

  if (node.type === 'TSRestType') {
    return `...${extractTypeAnnotation(node.typeAnnotation)}`;
  }

  if (node.type === 'TSOptionalType') {
    return `${extractTypeAnnotation(node.typeAnnotation)}?`;
  }

  return node.type || 'unknown';
}

function extractTypeParameters(
  node: any
): Array<{ name: string; constraint?: string; default?: string }> {
  const typeParams: Array<{ name: string; constraint?: string; default?: string }> = [];

  const typeParamsNode = node.typeParameters || node.typeParameterList;
  if (!typeParamsNode?.params) return typeParams;

  for (const param of typeParamsNode.params) {
    const name = param.name?.name || param.name || '';
    let constraint: string | undefined;
    let defaultType: string | undefined;

    if (param.constraint) {
      constraint = extractTypeAnnotation(param.constraint);
    }
    if (param.default) {
      defaultType = extractTypeAnnotation(param.default);
    }

    typeParams.push({ name, constraint, default: defaultType });
  }

  return typeParams;
}

function extractInterfaceProperties(
  node: any
): Array<{ name: string; type: string; optional: boolean }> {
  const properties: Array<{ name: string; type: string; optional: boolean }> = [];

  if (!node.body?.body) return properties;

  for (const member of node.body.body) {
    if (member.type === 'TSPropertySignature' && member.key) {
      const name = member.key.name || member.key.value || 'unknown';
      const type = extractTypeAnnotation(member.typeAnnotation?.typeAnnotation);
      const optional = !!member.optional;

      properties.push({ name, type, optional });
    }

    if (member.type === 'TSMethodSignature' && member.key) {
      const name = member.key.name || member.key.value || 'unknown';
      const params = member.parameters?.map((p: any) => ({
        name: p.name || p.pattern?.name || 'arg',
        type: extractTypeAnnotation(p.typeAnnotation?.typeAnnotation),
      }));
      const returnType = extractTypeAnnotation(member.typeAnnotation?.typeAnnotation);

      properties.push({
        name,
        type: `(${params?.map((p: { name: string; type: string }) => `${p.name}: ${p.type}`).join(', ') || ''}) => ${returnType}`,
        optional: !!member.optional,
      });
    }

    if (member.type === 'TSCallSignatureDeclaration') {
      properties.push({
        name: '[call]',
        type: 'call signature',
        optional: false,
      });
    }

    if (member.type === 'TSConstructSignatureDeclaration') {
      properties.push({
        name: '[new]',
        type: 'construct signature',
        optional: false,
      });
    }
  }

  return properties;
}

interface TemplatePart {
  type: 'string' | 'placeholder' | 'union';
  value: string;
  alternatives?: string[];
}

function extractTemplateLiteralParts(node: any): TemplatePart[] {
  const parts: TemplatePart[] = [];

  if (!node.templateElements) return parts;

  for (let i = 0; i < node.templateElements.length; i++) {
    const element = node.templateElements[i];
    const raw = element.raw?.value || element.value?.raw || '';

    if (i % 2 === 0) {
      parts.push({
        type: 'string',
        value: raw,
      });
    } else {
      const typeNode = element.typeAnnotation?.typeAnnotation;

      if (typeNode?.type === 'TSUnionType') {
        const alternatives = typeNode.types?.map((t: any) => extractTypeAnnotation(t));
        parts.push({
          type: 'union',
          value: 'union',
          alternatives,
        });
      } else {
        parts.push({
          type: 'placeholder',
          value: extractTypeAnnotation(typeNode) || 'unknown',
        });
      }
    }
  }

  return parts;
}

function buildTemplateLiteralType(parts: TemplatePart[]): string {
  if (parts.length === 0) return 'string';

  const result: string[] = [];

  for (const part of parts) {
    if (part.type === 'string') {
      result.push(part.value);
    } else if (part.type === 'placeholder') {
      result.push(`$\{${part.value}}`);
    } else if (part.type === 'union') {
      const union = part.alternatives?.join(' | ') || 'string';
      result.push(`$\{${union}}`);
    }
  }

  return `\`${result.join('')}\``;
}

function extractAdvancedTypeInfo(typeString: string): any {
  const info: any = {};

  const genericMatch = typeString.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const baseName = genericMatch[1];
    const argsString = genericMatch[2];
    if (argsString) {
      const args = argsString.split(',').map((a) => a.trim());
      info.genericResolution = {
        baseType: baseName,
        typeArguments: args,
        resolved: `${baseName}<${args.join(', ')}>`,
      };
    }
  }

  const conditionalMatch = typeString.match(/^(.+?)\s+extends\s+(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (conditionalMatch) {
    const checkType = conditionalMatch[1];
    const extendsType = conditionalMatch[2];
    const trueType = conditionalMatch[3];
    const falseType = conditionalMatch[4];
    if (checkType && extendsType && trueType && falseType) {
      info.conditionalType = {
        checkType: checkType.trim(),
        extendsType: extendsType.trim(),
        trueType: trueType.trim(),
        falseType: falseType.trim(),
      };
    }
  }

  const templateLiteralMatch = typeString.match(/^`([^`]*)`$/);
  if (templateLiteralMatch) {
    info.templateLiteralType = {
      template: templateLiteralMatch[1],
      inferredType: typeString,
    };
  }

  const unionMatch = typeString.match(/^(.+?)\s*\|\s*(.+)$/);
  if (unionMatch) {
    const type1 = unionMatch[1];
    const type2 = unionMatch[2];
    if (type1 && type2 && !typeString.includes('extends')) {
      info.unionTypes = [type1.trim(), type2.trim()];
    }
  }

  const intersectionMatch = typeString.match(/^(.+?)\s*&\s*(.+)$/);
  if (intersectionMatch) {
    const type1 = intersectionMatch[1];
    const type2 = intersectionMatch[2];
    if (type1 && type2) {
      info.intersectionTypes = [type1.trim(), type2.trim()];
    }
  }

  if (Object.keys(info).length > 0) {
    return info;
  }

  return undefined;
}
