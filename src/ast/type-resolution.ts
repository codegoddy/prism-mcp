import type {
  ASTNode,
  GenericTypeParameter,
  ConditionalType,
  TemplateLiteralType,
  TemplatePart,
  TypeNarrowing,
  TypeNarrowingReason,
  AdvancedTypeInfo,
  TypeResolutionContext,
  GenericTypeDefinition,
} from '../types/ast.js';

export class TypeResolver {
  private context: TypeResolutionContext;
  private builtInTypes: Map<string, string>;

  constructor(context: TypeResolutionContext) {
    this.context = context;
    this.builtInTypes = new Map([
      ['Array', 'Array<T>'],
      ['Map', 'Map<K, V>'],
      ['Set', 'Set<T>'],
      ['Promise', 'Promise<T>'],
      ['ReadonlyArray', 'ReadonlyArray<T>'],
      ['Record', 'Record<K, V>'],
      ['Partial', 'Partial<T>'],
      ['Required', 'Required<T>'],
      ['NonNullable', 'NonNullable<T>'],
      ['Extract', 'Extract<T, U>'],
      ['Exclude', 'Exclude<T, U>'],
      ['Pick', 'Pick<T, K>'],
      ['Omit', 'Omit<T, K>'],
      ['ReturnType', 'ReturnType<T>'],
      ['Parameters', 'Parameters<T>'],
      ['ConstructorParameters', 'ConstructorParameters<T>'],
      ['InstanceType', 'InstanceType<T>'],
      ['ThisParameterType', 'ThisParameterType<T>'],
      ['OmitThisParameter', 'OmitThisParameter<T>'],
      ['Uppercase', 'Uppercase<T>'],
      ['Lowercase', 'Lowercase<T>'],
      ['Capitalize', 'Capitalize<T>'],
      ['Uncapitalize', 'Uncapitalize<T>'],
    ]);
  }

  resolveGenericType(typeName: string, typeArguments?: string[]): GenericTypeDefinition | null {
    const definition =
      this.context.typeAliases.get(typeName) || this.context.interfaces.get(typeName)?.name;

    if (!definition && !this.builtInTypes.has(typeName)) {
      return null;
    }

    const typeParams: GenericTypeParameter[] = [];
    const resolvedArgs: string[] = [];

    const fullTypeName = this.builtInTypes.get(typeName) || typeName;
    const paramMatch = fullTypeName.match(/<([^>]+)>/);

    if (paramMatch) {
      const paramNames = paramMatch[1].split(',').map((p) => p.trim());
      paramNames.forEach((param, index) => {
        const constraintMatch = param.match(/(\w+)(?:\s+extends\s+(\S+))?/);
        const paramName = constraintMatch ? constraintMatch[1] : param;
        const constraint = constraintMatch ? constraintMatch[2] : undefined;

        const resolvedType = typeArguments?.[index] || param;
        resolvedArgs.push(resolvedType);

        typeParams.push({
          name: paramName,
          constraint,
          defaultType: resolvedType !== paramName ? resolvedType : undefined,
        });
      });
    }

    return {
      name: typeName,
      typeParameters: typeParams,
      resolvedType: this.buildResolvedType(typeName, typeArguments || []),
      typeArguments: resolvedArgs,
    };
  }

  private buildResolvedType(typeName: string, typeArgs: string[]): string {
    const baseType = this.builtInTypes.get(typeName) || typeName;
    const paramMatch = baseType.match(/^(\w+)/);
    const baseName = paramMatch ? paramMatch[1] : typeName;

    if (typeArgs.length > 0) {
      return `${baseName}<${typeArgs.join(', ')}>`;
    }
    return baseType;
  }

  resolveConditionalType(
    checkType: string,
    extendsType: string,
    trueType: string,
    falseType: string
  ): ConditionalType | null {
    const checkResolved = this.resolveType(checkType);
    const extendsResolved = this.resolveType(extendsType);

    if (!checkResolved || !extendsResolved) {
      return null;
    }

    const isAssignable = this.isAssignable(checkResolved, extendsResolved);

    return {
      checkType: checkResolved,
      extendsType: extendsResolved,
      trueType: isAssignable ? trueType : falseType,
      falseType: falseType,
      inferredType: isAssignable ? trueType : falseType,
    };
  }

  resolveTemplateLiteralType(parts: TemplatePart[]): TemplateLiteralType {
    const resolvedParts: TemplatePart[] = parts.map((part) => {
      if (part.type === 'placeholder') {
        const resolved = this.resolveType(part.value);
        return {
          ...part,
          value: resolved || part.value,
          alternatives: resolved ? [resolved] : part.alternatives,
        };
      }
      return part;
    });

    const inferredType = this.buildTemplateLiteralType(resolvedParts);

    return {
      parts: resolvedParts,
      inferredType,
    };
  }

  private buildTemplateLiteralType(parts: TemplatePart[]): string {
    if (parts.length === 0) return 'string';

    const stringParts: string[] = [];
    const placeholderTypes: string[] = [];

    for (const part of parts) {
      if (part.type === 'string') {
        stringParts.push(part.value);
      } else if (part.type === 'placeholder') {
        placeholderTypes.push(part.value);
        stringParts.push(`\${number}`);
      } else if (part.type === 'union') {
        const union = part.alternatives?.join(' | ') || 'string';
        placeholderTypes.push(union);
        stringParts.push(`\${number}`);
      }
    }

    if (placeholderTypes.length === 0) {
      return `'${stringParts.join('')}'`;
    }

    return `\`${stringParts.join('')}\``;
  }

  resolveType(typeString: string): string | null {
    if (!typeString || typeof typeString !== 'string') {
      return null;
    }

    const trimmed = typeString.trim();

    if (this.context.typeParameters.has(trimmed)) {
      return this.context.typeParameters.get(trimmed)!;
    }

    if (this.context.typeAliases.has(trimmed)) {
      return this.context.typeAliases.get(trimmed)!;
    }

    const genericMatch = trimmed.match(/^(\w+)<(.+)>$/);
    if (genericMatch) {
      const [, baseName, argsString] = genericMatch;
      const args = argsString.split(',').map((a) => this.resolveType(a.trim()) || a.trim());
      const resolved = this.resolveGenericType(baseName, args);
      return resolved?.resolvedType || trimmed;
    }

    const conditionalMatch = trimmed.match(/^(.+?)\s+extends\s+(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
    if (conditionalMatch) {
      const [, check, extendsType, trueType, falseType] = conditionalMatch;
      const conditional = this.resolveConditionalType(
        check.trim(),
        extendsType.trim(),
        trueType.trim(),
        falseType.trim()
      );
      return conditional?.inferredType || trimmed;
    }

    const templateLiteralMatch = trimmed.match(/^`([^`]*)`$/);
    if (templateLiteralMatch) {
      const templateParts = this.parseTemplateLiteral(templateLiteralMatch[1]);
      const resolved = this.resolveTemplateLiteralType(templateParts);
      return resolved.inferredType || trimmed;
    }

    if (this.builtInTypes.has(trimmed)) {
      return this.builtInTypes.get(trimmed)!;
    }

    return trimmed;
  }

  private parseTemplateLiteral(template: string): TemplatePart[] {
    const parts: TemplatePart[] = [];
    const regex = /\$\{([^}]+)\}/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(template)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'string',
          value: template.slice(lastIndex, match.index),
        });
      }

      const expr = match[1].trim();
      const unionMatch = expr.match(/^(.+?)\s*\|\s*(.+)$/);

      if (unionMatch) {
        parts.push({
          type: 'union',
          value: 'union',
          alternatives: [
            this.resolveType(unionMatch[1].trim()) || unionMatch[1].trim(),
            this.resolveType(unionMatch[2].trim()) || unionMatch[2].trim(),
          ],
        });
      } else {
        const resolved = this.resolveType(expr);
        parts.push({
          type: 'placeholder',
          value: resolved || expr,
        });
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < template.length) {
      parts.push({
        type: 'string',
        value: template.slice(lastIndex),
      });
    }

    return parts;
  }

  isAssignable(fromType: string, toType: string): boolean {
    const resolvedFrom = this.resolveType(fromType);
    const resolvedTo = this.resolveType(toType);

    if (!resolvedFrom || !resolvedTo) {
      return false;
    }

    if (resolvedFrom === resolvedTo) {
      return true;
    }

    if (resolvedTo === 'any' || resolvedTo === 'unknown') {
      return true;
    }

    if (resolvedFrom === 'never') {
      return true;
    }

    const unionMatch = resolvedFrom.match(/^(.+?)\s*\|\s*(.+)$/);
    if (unionMatch) {
      return (
        this.isAssignable(unionMatch[1], resolvedTo) && this.isAssignable(unionMatch[2], resolvedTo)
      );
    }

    return false;
  }

  getAdvancedTypeInfo(typeString: string): AdvancedTypeInfo {
    const resolved = this.resolveType(typeString);
    if (!resolved) {
      return {};
    }

    const info: AdvancedTypeInfo = {};

    const genericMatch = resolved.match(/^(\w+)<(.+)>$/);
    if (genericMatch) {
      const [, baseName, argsString] = genericMatch;
      const args = argsString.split(',').map((a) => a.trim());
      info.genericResolution = this.resolveGenericType(baseName, args);
    }

    const conditionalMatch = resolved.match(/^(.+?)\s+extends\s+(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
    if (conditionalMatch) {
      const [, check, extendsType, trueType, falseType] = conditionalMatch;
      info.conditionalType = this.resolveConditionalType(
        check.trim(),
        extendsType.trim(),
        trueType.trim(),
        falseType.trim()
      );
    }

    const templateLiteralMatch = resolved.match(/^`([^`]*)`$/);
    if (templateLiteralMatch) {
      info.templateLiteralType = this.resolveTemplateLiteralType(
        this.parseTemplateLiteral(templateLiteralMatch[1])
      );
    }

    const unionMatch = resolved.match(/^(.+?)\s*\|\s*(.+)$/);
    if (unionMatch) {
      info.unionTypes = [unionMatch[1].trim(), unionMatch[2].trim()];
    }

    const intersectMatch = resolved.match(/^(.+?)\s*&\s*(.+)$/);
    if (intersectMatch) {
      info.intersectionTypes = [intersectMatch[1].trim(), intersectMatch[2].trim()];
    }

    return info;
  }
}

export function analyzeTypeNarrowing(
  node: ASTNode,
  context: TypeResolutionContext
): TypeNarrowing | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  if (node.type === 'if_statement') {
    return analyzeIfStatementNarrowing(node, context);
  }

  if (node.type === 'call_expression') {
    return analyzeCallExpressionNarrowing(node, context);
  }

  return null;
}

function analyzeIfStatementNarrowing(
  node: ASTNode,
  context: TypeResolutionContext
): TypeNarrowing | null {
  const condition = node.namedChildren?.find((child: ASTNode) => child.type === 'condition');
  if (!condition) {
    return null;
  }

  const conditionChildren = condition.namedChildren || condition.children || [];

  if (conditionChildren.length >= 2) {
    const left = conditionChildren[0];
    const operator = conditionChildren[1];
    const right = conditionChildren[2];

    if (operator.text === '===' || operator.text === '==') {
      const narrowing = analyzeEqualityNarrowing(left, right, context);
      if (narrowing) {
        return narrowing;
      }
    }

    if (operator.text === '!==' || operator.text === '!=') {
      const narrowing = analyzeNegatedEqualityNarrowing(left, right, context);
      if (narrowing) {
        return narrowing;
      }
    }
  }

  if (left?.type === 'binary_expression' && left.text?.startsWith('typeof')) {
    return analyzeTypeOfNarrowing(left, context);
  }

  if (left?.type === 'call_expression' && left.text?.startsWith('is')) {
    return analyzeIsTypeAssertion(left, context);
  }

  return null;
}

function analyzeEqualityNarrowing(
  left: ASTNode,
  right: ASTNode,
  context: TypeResolutionContext
): TypeNarrowing | null {
  if (left.type === 'identifier' && right.type === 'string') {
    const varName = left.text;
    const narrowedType = right.text.replace(/['"]/g, '');

    return {
      variableName: varName,
      narrowedType: `'${narrowedType}'`,
      originalType: 'string',
      narrowingReason: {
        type: 'equality',
        detail: `Variable equals string literal '${narrowedType}'`,
        condition: `${varName} === '${narrowedType}'`,
      },
      location: {
        filePath: context.filePath,
        line: left.startPosition?.row || 0,
        column: left.startPosition?.column || 0,
      },
    };
  }

  if (left.type === 'property_identifier' && right.type === 'string') {
    const propName = left.text;
    const narrowedType = right.text.replace(/['"]/g, '');

    return {
      variableName: propName,
      narrowedType: `'${narrowedType}'`,
      originalType: 'string',
      narrowingReason: {
        type: 'equality',
        detail: `Property equals string literal '${narrowedType}'`,
        condition: `${propName} === '${narrowedType}'`,
      },
      location: {
        filePath: context.filePath,
        line: left.startPosition?.row || 0,
        column: left.startPosition?.column || 0,
      },
    };
  }

  return null;
}

function analyzeNegatedEqualityNarrowing(
  left: ASTNode,
  right: ASTNode,
  context: TypeResolutionContext
): TypeNarrowing | null {
  if (left.type === 'identifier' && right.type === 'null') {
    return {
      variableName: left.text,
      narrowedType: 'NonNullable<T>',
      originalType: 'T | null | undefined',
      narrowingReason: {
        type: 'equality',
        detail: 'Variable is not null, so null is excluded',
        condition: `${left.text} !== null`,
      },
      location: {
        filePath: context.filePath,
        line: left.startPosition?.row || 0,
        column: left.startPosition?.column || 0,
      },
    };
  }

  if (left.type === 'identifier' && right.type === 'undefined') {
    return {
      variableName: left.text,
      narrowedType: 'NonNullable<T>',
      originalType: 'T | undefined',
      narrowingReason: {
        type: 'equality',
        detail: 'Variable is not undefined, so undefined is excluded',
        condition: `${left.text} !== undefined`,
      },
      location: {
        filePath: context.filePath,
        line: left.startPosition?.row || 0,
        column: left.startPosition?.column || 0,
      },
    };
  }

  return null;
}

function analyzeTypeOfNarrowing(
  node: ASTNode,
  context: TypeResolutionContext
): TypeNarrowing | null {
  const text = node.text || '';
  const typeofMatch = text.match(/typeof\s+(\w+)\s*===\s*['"](\w+)['"]/);

  if (typeofMatch) {
    const [, varName, typeName] = typeofMatch;

    const typeMap: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      function: 'Function',
      object: 'object',
      undefined: 'undefined',
      symbol: 'symbol',
      bigint: 'bigint',
    };

    return {
      variableName: varName,
      narrowedType: typeMap[typeName] || 'unknown',
      originalType: 'unknown',
      narrowingReason: {
        type: 'typeof',
        detail: `typeof check narrows to ${typeMap[typeName] || 'unknown'}`,
        condition: `typeof ${varName} === '${typeName}'`,
      },
      location: {
        filePath: context.filePath,
        line: node.startPosition?.row || 0,
        column: node.startPosition?.column || 0,
      },
    };
  }

  return null;
}

function analyzeIsTypeAssertion(
  node: ASTNode,
  context: TypeResolutionContext
): TypeNarrowing | null {
  const text = node.text || '';
  const isMatch = text.match(/(\w+)\s+is\s+(\w+)/);

  if (isMatch) {
    const [, varName, typeName] = isMatch;

    return {
      variableName: varName,
      narrowedType: typeName,
      originalType: 'unknown',
      narrowingReason: {
        type: 'is',
        detail: `Type guard 'is ${typeName}' narrows to ${typeName}`,
        condition: `${varName} is ${typeName}`,
      },
      location: {
        filePath: context.filePath,
        line: node.startPosition?.row || 0,
        column: node.startPosition?.column || 0,
      },
    };
  }

  return null;
}

function analyzeCallExpressionNarrowing(
  node: ASTNode,
  context: TypeResolutionContext
): TypeNarrowing | null {
  const text = node.text || '';

  if (text.startsWith('Array.isArray')) {
    const argMatch = text.match(/Array\.isArray\s*\(\s*(\w+)\s*\)/);
    if (argMatch) {
      const [, varName] = argMatch;

      return {
        variableName: varName,
        narrowedType: 'unknown[]',
        originalType: 'unknown',
        narrowingReason: {
          type: 'instanceof',
          detail: 'Array.isArray() narrows to unknown[]',
          condition: `Array.isArray(${varName})`,
        },
        location: {
          filePath: context.filePath,
          line: node.startPosition?.row || 0,
          column: node.startPosition?.column || 0,
        },
      };
    }
  }

  const instanceMatch = text.match(/(\w+)\s+instanceof\s+(\w+)/);
  if (instanceMatch) {
    const [, varName, className] = instanceMatch;

    return {
      variableName: varName,
      narrowedType: className,
      originalType: 'unknown',
      narrowingReason: {
        type: 'instanceof',
        detail: `instanceof check narrows to ${className}`,
        condition: `${varName} instanceof ${className}`,
      },
      location: {
        filePath: context.filePath,
        line: node.startPosition?.row || 0,
        column: node.startPosition?.column || 0,
      },
    };
  }

  return null;
}

export function extractTypeParametersFromFunction(node: ASTNode): GenericTypeParameter[] {
  const typeParams: GenericTypeParameter[] = [];

  if (!node || !node.namedChildren) {
    return typeParams;
  }

  const typeParamsNode = node.namedChildren.find(
    (child: ASTNode) => child.type === 'type_parameters' || child.type === 'typeParameterList'
  );

  if (!typeParamsNode || !typeParamsNode.namedChildren) {
    return typeParams;
  }

  for (const param of typeParamsNode.namedChildren) {
    if (param.type === 'type_parameter') {
      const nameNode = param.namedChildren?.find(
        (child: ASTNode) => child.type === 'type_identifier' || child.type === 'identifier'
      );
      const constraintNode = param.namedChildren?.find(
        (child: ASTNode) => child.type === 'type_annotation' || child.type === 'extends'
      );

      const name = nameNode?.text || '';
      let constraint: string | undefined;

      if (constraintNode) {
        const typeNode = constraintNode.namedChildren?.[0] || constraintNode.children?.[0];
        constraint = typeNode?.text || '';
      }

      typeParams.push({ name, constraint });
    }
  }

  return typeParams;
}

export function resolveInferredType(
  inferType: string,
  context: TypeResolutionContext
): string | null {
  const inferMatch = inferType.match(/infer\s+(\w+)/);
  if (!inferMatch) {
    return null;
  }

  const typeParamName = inferMatch[1];

  const constrainedType = context.typeParameters.get(typeParamName);
  if (constrainedType) {
    return constrainedType;
  }

  return typeParamName;
}
