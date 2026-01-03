import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { ParserError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { buildSymbolTable } from './find_callers.js';
import { findSourceFiles } from './find_callers.js';
import type { TypeFlowAnalysis, TypeOrigin, TypeRelationship } from '../types/ast.js';

export async function analyzeTypeFlow(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath, variableName, lineNumber, columnNumber } = args;

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
    logger.info('Analyzing type flow', { filePath, variableName, lineNumber, columnNumber });

    const parser = ParserFactory.getParserForFile(filePath);
    const result = await parser.parseFile(filePath);
    const language = parser.getLanguage();

    if (language !== 'typescript') {
      return {
        content: [
          {
            type: 'text',
            text: 'Type flow analysis is only supported for TypeScript files',
          },
        ],
        isError: true,
      };
    }

    // Build symbol table for the file
    const projectDir = filePath.split('/').slice(0, -1).join('/') || '.';
    const files = findSourceFiles(projectDir);
    const symbolTable = await buildSymbolTable([filePath]);

    let targetPosition = { row: 0, column: 0 };

    if (typeof variableName === 'string') {
      // Find variable by name
      const variableSymbol = Object.values(symbolTable).find(
        (s) => s.name === variableName && (s.type === 'variable' || s.type === 'parameter')
      );

      if (!variableSymbol) {
        return {
          content: [
            {
              type: 'text',
              text: `Variable "${variableName}" not found in ${filePath}`,
            },
          ],
          isError: true,
        };
      }

      targetPosition = variableSymbol.startPosition;
    } else if (typeof lineNumber === 'number') {
      // Use provided position
      targetPosition = {
        row: lineNumber - 1, // Convert to 0-based
        column: (columnNumber as number) || 0,
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: 'Invalid arguments: either variableName or lineNumber must be provided',
          },
        ],
        isError: true,
      };
    }

    // Analyze type flow at the target position
    const typeAnalysis = await analyzeTypeAtPosition(result.tree, targetPosition, filePath, files);

    const analysis: TypeFlowAnalysis = {
      targetLocation: {
        filePath,
        line: targetPosition.row + 1,
        column: targetPosition.column,
      },
      resolvedType: typeAnalysis.resolvedType,
      typeOrigins: typeAnalysis.typeOrigins,
      typeRelationships: typeAnalysis.typeRelationships,
      inferenceChain: typeAnalysis.inferenceChain,
      confidence: typeAnalysis.confidence,
    };

    logger.info('Type flow analysis completed', {
      filePath,
      resolvedType: typeAnalysis.resolvedType,
      confidence: typeAnalysis.confidence,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(analysis, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    logger.error('Failed to analyze type flow', error as Error, { filePath, variableName });

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

async function analyzeTypeAtPosition(
  root: any,
  position: { row: number; column: number },
  filePath: string,
  allFiles: string[]
): Promise<{
  resolvedType: string;
  typeOrigins: TypeOrigin[];
  typeRelationships: TypeRelationship[];
  inferenceChain: string[];
  confidence: 'high' | 'medium' | 'low';
}> {
  // Find the node at the target position
  const targetNode = findNodeAtPosition(root, position);

  if (!targetNode) {
    return {
      resolvedType: 'unknown',
      typeOrigins: [],
      typeRelationships: [],
      inferenceChain: ['Could not locate target node'],
      confidence: 'low',
    };
  }

  // Analyze the type based on the node type
  if (targetNode.type === 'variable_declarator' || targetNode.type === 'identifier') {
    return analyzeVariableType(targetNode, filePath, allFiles);
  } else if (targetNode.type === 'property_identifier') {
    return analyzePropertyType(targetNode, filePath, allFiles);
  } else if (targetNode.type === 'call_expression') {
    return analyzeCallReturnType(targetNode, filePath, allFiles);
  } else {
    return analyzeGenericType(targetNode, filePath, allFiles);
  }
}

function findNodeAtPosition(node: any, position: { row: number; column: number }): any {
  // Check if this node contains the position
  if (node.startPosition && node.endPosition) {
    if (
      node.startPosition.row <= position.row &&
      node.endPosition.row >= position.row &&
      (node.startPosition.row !== position.row || node.startPosition.column <= position.column) &&
      (node.endPosition.row !== position.row || node.endPosition.column >= position.column)
    ) {
      // This node contains the position, check children first
      for (const child of node.namedChildren || []) {
        const childResult = findNodeAtPosition(child, position);
        if (childResult) return childResult;
      }
      return node;
    }
  }
  return null;
}

async function analyzeVariableType(
  node: any,
  filePath: string,
  allFiles: string[]
): Promise<{
  resolvedType: string;
  typeOrigins: TypeOrigin[];
  typeRelationships: TypeRelationship[];
  inferenceChain: string[];
  confidence: 'high' | 'medium' | 'low';
}> {
  const inferenceChain: string[] = [];
  const typeOrigins: TypeOrigin[] = [];
  const typeRelationships: TypeRelationship[] = [];

  // Check for explicit type annotation
  const typeAnnotation = findTypeAnnotation(node);
  if (typeAnnotation) {
    const resolvedType = extractTypeFromAnnotation(typeAnnotation);
    inferenceChain.push(`Explicit type annotation: ${resolvedType}`);

    typeOrigins.push({
      type: resolvedType,
      source: 'explicit_annotation',
      location: `${filePath}:${node.startPosition.row + 1}`,
    });

    return {
      resolvedType,
      typeOrigins,
      typeRelationships,
      inferenceChain,
      confidence: 'high',
    };
  }

  // Check for assignment/initialization
  const initializer = findInitializer(node);
  if (initializer) {
    inferenceChain.push('Type inferred from initializer');

    // Enhanced literal type inference
    const literalType = inferLiteralType(initializer);
    if (literalType !== 'unknown') {
      typeOrigins.push({
        type: literalType,
        source: 'literal_inference',
        location: `${filePath}:${initializer.startPosition.row + 1}`,
      });
      return {
        resolvedType: literalType,
        typeOrigins,
        typeRelationships,
        inferenceChain,
        confidence: 'high',
      };
    }

    if (initializer.type === 'call_expression') {
      // Analyze the return type of the called function
      const callAnalysis = await analyzeCallReturnType(initializer, filePath, allFiles);
      inferenceChain.push(`Type from function call: ${callAnalysis.resolvedType}`);
      typeOrigins.push(...callAnalysis.typeOrigins);
      typeRelationships.push(...callAnalysis.typeRelationships);

      return {
        resolvedType: callAnalysis.resolvedType,
        typeOrigins,
        typeRelationships,
        inferenceChain: [...inferenceChain, ...callAnalysis.inferenceChain],
        confidence: callAnalysis.confidence,
      };
    }
  }

  // Default to any for untyped variables
  inferenceChain.push('No type information available');
  return {
    resolvedType: 'any',
    typeOrigins,
    typeRelationships,
    inferenceChain,
    confidence: 'low',
  };
}

async function analyzeCallReturnType(
  node: any,
  filePath: string,
  allFiles: string[]
): Promise<{
  resolvedType: string;
  typeOrigins: TypeOrigin[];
  typeRelationships: TypeRelationship[];
  inferenceChain: string[];
  confidence: 'high' | 'medium' | 'low';
}> {
  // Find the function being called
  const functionName = extractFunctionName(node);
  if (!functionName) {
    return {
      resolvedType: 'unknown',
      typeOrigins: [],
      typeRelationships: [],
      inferenceChain: ['Could not determine function name'],
      confidence: 'low',
    };
  }

  // Try to find the function definition
  for (const file of allFiles) {
    try {
      const parser = ParserFactory.getParserForFile(file);
      const result = await parser.parseFile(file);

      const functionDef = findFunctionDefinition(result.tree, functionName);
      if (functionDef) {
        const returnType = extractReturnType(functionDef);
        if (returnType) {
          return {
            resolvedType: returnType,
            typeOrigins: [
              {
                type: returnType,
                source: 'function_definition',
                location: `${file}:${functionDef.startPosition.row + 1}`,
              },
            ],
            typeRelationships: [
              {
                fromType: returnType,
                toType: functionName,
                relationship: 'return_type_of',
              },
            ],
            inferenceChain: [`Return type of function ${functionName}`],
            confidence: 'high',
          };
        }
      }
    } catch (e) {
      // Continue to next file
    }
  }

  return {
    resolvedType: 'unknown',
    typeOrigins: [],
    typeRelationships: [],
    inferenceChain: [`Could not find definition for function ${functionName}`],
    confidence: 'low',
  };
}

async function analyzePropertyType(
  node: any,
  filePath: string,
  allFiles: string[]
): Promise<{
  resolvedType: string;
  typeOrigins: TypeOrigin[];
  typeRelationships: TypeRelationship[];
  inferenceChain: string[];
  confidence: 'high' | 'medium' | 'low';
}> {
  // Find the object type that contains this property
  const objectType = findContainingObjectType(node, filePath, allFiles);

  if (objectType) {
    return {
      resolvedType: objectType.propertyType || 'unknown',
      typeOrigins: [
        {
          type: objectType.propertyType || 'unknown',
          source: 'interface_property',
          location: objectType.location,
        },
      ],
      typeRelationships: [
        {
          fromType: objectType.objectType,
          toType: objectType.propertyType || 'unknown',
          relationship: 'has_property',
        },
      ],
      inferenceChain: [`Property of ${objectType.objectType}`],
      confidence: objectType.confidence,
    };
  }

  return {
    resolvedType: 'unknown',
    typeOrigins: [],
    typeRelationships: [],
    inferenceChain: ['Could not determine object type'],
    confidence: 'low',
  };
}

async function analyzeGenericType(
  node: any,
  filePath: string,
  allFiles: string[]
): Promise<{
  resolvedType: string;
  typeOrigins: TypeOrigin[];
  typeRelationships: TypeRelationship[];
  inferenceChain: string[];
  confidence: 'high' | 'medium' | 'low';
}> {
  // Generic fallback analysis
  return {
    resolvedType: 'unknown',
    typeOrigins: [],
    typeRelationships: [],
    inferenceChain: ['Generic type analysis not implemented for this node type'],
    confidence: 'low',
  };
}

// Helper functions
function findTypeAnnotation(node: any): any {
  // Look for type_annotation in the node or its siblings
  if (node.type === 'type_annotation') return node;

  for (const child of node.namedChildren || []) {
    if (child.type === 'type_annotation') return child;
  }

  // Check parent for type annotation
  if (node.parent && node.parent.type === 'variable_declarator') {
    return findTypeAnnotation(node.parent);
  }

  return null;
}

function extractTypeFromAnnotation(annotation: any): string {
  // Extract type from type_annotation node
  const typeNode = annotation.namedChildren?.find(
    (child: any) => child.type.includes('type') || child.type === 'identifier'
  );
  return typeNode?.text || 'unknown';
}

function findInitializer(node: any): any {
  // Look for initializer in variable declarator
  for (const child of node.namedChildren || []) {
    if (child.type === 'string' || child.type === 'number' || child.type === 'call_expression') {
      return child;
    }
  }
  return null;
}

function extractFunctionName(callNode: any): string {
  // Extract function name from call expression
  for (const child of callNode.namedChildren || []) {
    if (child.type === 'identifier' || child.type === 'property_identifier') {
      return child.text;
    }
  }
  return '';
}

function findFunctionDefinition(root: any, functionName: string): any {
  function traverse(node: any): any {
    if (
      (node.type === 'function_declaration' || node.type === 'method_definition') &&
      node.namedChildren?.some((child: any) => child.text === functionName)
    ) {
      return node;
    }

    for (const child of node.namedChildren || []) {
      const result = traverse(child);
      if (result) return result;
    }

    return null;
  }

  return traverse(root);
}

function extractReturnType(functionNode: any): string | null {
  // Look for return type annotation
  const typeAnnotation = findTypeAnnotation(functionNode);
  if (typeAnnotation) {
    return extractTypeFromAnnotation(typeAnnotation);
  }
  return null;
}

function findContainingObjectType(
  propertyNode: any,
  filePath: string,
  allFiles: string[]
): {
  objectType: string;
  propertyType?: string;
  location: string;
  confidence: 'high' | 'medium' | 'low';
} | null {
  // This is a simplified implementation
  // In a real implementation, this would analyze interfaces, classes, etc.
  return null;
}

// Enhanced type inference helpers
function inferLiteralType(node: any): string {
  if (node.type === 'string') {
    return 'string';
  } else if (node.type === 'number') {
    return 'number';
  } else if (node.type === 'true' || node.type === 'false') {
    return 'boolean';
  } else if (node.type === 'null') {
    return 'null';
  } else if (node.type === 'undefined') {
    return 'undefined';
  } else if (node.type === 'array') {
    return inferArrayType(node);
  } else if (node.type === 'object') {
    return 'object';
  }

  return 'unknown';
}

function inferArrayType(node: any): string {
  // Check if all elements are the same type
  const elements =
    node.namedChildren?.filter(
      (child: any) => child.type !== '[' && child.type !== ']' && child.type !== ','
    ) || [];

  if (elements.length === 0) {
    return 'unknown[]';
  }

  const elementTypes = elements.map((element: any) => inferLiteralType(element));
  const uniqueTypes = [...new Set(elementTypes.filter((t: string) => t !== 'unknown'))];

  if (uniqueTypes.length === 1) {
    return `${uniqueTypes[0]}[]`;
  } else if (uniqueTypes.length > 1) {
    return 'unknown[]'; // Mixed types
  }

  return 'unknown[]';
}

function inferArrayElementType(node: any): string {
  const elements =
    node.namedChildren?.filter(
      (child: any) => child.type !== '[' && child.type !== ']' && child.type !== ','
    ) || [];

  if (elements.length === 0) {
    return 'unknown';
  }

  // Check first element type
  const firstElementType = inferLiteralType(elements[0]);
  if (firstElementType !== 'unknown') {
    return firstElementType;
  }

  return 'unknown';
}

function inferObjectType(node: any, filePath: string, allFiles: string[]): string {
  // Try to find interface/class definitions that match this object structure
  // This is a simplified implementation

  // For now, return a basic object type
  return '{ [key: string]: unknown }';
}

// Enhanced type resolution with cross-file support
async function resolveImportedType(
  typeName: string,
  currentFile: string,
  allFiles: string[]
): Promise<string | null> {
  // Check if this is an imported type
  try {
    const parser = ParserFactory.getParserForFile(currentFile);
    const result = await parser.parseFile(currentFile);

    // Look for import statements
    const imports = findImports(result.tree);
    for (const imp of imports) {
      if (imp.imported.some((item) => item.name === typeName || item.alias === typeName)) {
        // Try to resolve the imported type from the source file
        const sourceFile = resolveImportPath(currentFile, imp.source);
        if (sourceFile && allFiles.includes(sourceFile)) {
          const resolvedType = await findTypeDefinition(typeName, sourceFile);
          if (resolvedType) {
            return resolvedType;
          }
        }
      }
    }
  } catch (error) {
    // Continue with fallback
  }

  return null;
}

function findImports(
  root: any
): Array<{ source: string; imported: Array<{ name: string; alias?: string }> }> {
  const imports: Array<{ source: string; imported: Array<{ name: string; alias?: string }> }> = [];

  function traverse(node: any) {
    if (node.type === 'import_statement') {
      const imp: { source: string; imported: Array<{ name: string; alias?: string }> } = {
        source: '',
        imported: [],
      };

      for (const child of node.namedChildren || []) {
        if (child.type === 'string') {
          imp.source = child.text.slice(1, -1); // Remove quotes
        } else if (child.type === 'import_clause') {
          for (const clauseChild of child.namedChildren || []) {
            if (clauseChild.type === 'identifier') {
              imp.imported.push({ name: clauseChild.text });
            } else if (clauseChild.type === 'named_imports') {
              for (const named of clauseChild.namedChildren || []) {
                if (named.type === 'import_specifier') {
                  const identifiers =
                    named.namedChildren?.filter((n: any) => n.type === 'identifier') || [];
                  if (identifiers.length === 1) {
                    imp.imported.push({ name: identifiers[0].text });
                  } else if (identifiers.length === 2) {
                    imp.imported.push({ name: identifiers[0].text, alias: identifiers[1].text });
                  }
                }
              }
            }
          }
        }
      }

      if (imp.source) {
        imports.push(imp);
      }
    }

    for (const child of node.namedChildren || []) {
      traverse(child);
    }
  }

  traverse(root);
  return imports;
}

function resolveImportPath(currentFile: string, importSource: string): string | null {
  const path = require('path');

  // Handle relative imports
  if (importSource.startsWith('.')) {
    const currentDir = path.dirname(currentFile);
    const resolved = path.resolve(currentDir, importSource);

    // Try different extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      try {
        require('fs').accessSync(candidate);
        return candidate;
      } catch {
        // Continue
      }
    }

    // Try as directory with index
    for (const ext of extensions) {
      const candidate = path.join(resolved, 'index' + ext);
      try {
        require('fs').accessSync(candidate);
        return candidate;
      } catch {
        // Continue
      }
    }
  }

  // For now, skip absolute imports and node_modules
  return null;
}

async function findTypeDefinition(typeName: string, filePath: string): Promise<string | null> {
  try {
    const parser = ParserFactory.getParserForFile(filePath);
    const result = await parser.parseFile(filePath);

    // Look for interface, class, or type alias definitions
    function findType(node: any): string | null {
      if (node.type === 'interface_declaration') {
        const name = node.namedChildren?.find(
          (child: any) => child.type === 'type_identifier'
        )?.text;
        if (name === typeName) {
          return 'interface';
        }
      } else if (node.type === 'class_declaration') {
        const name = node.namedChildren?.find(
          (child: any) => child.type === 'type_identifier'
        )?.text;
        if (name === typeName) {
          return 'class';
        }
      } else if (node.type === 'type_alias_declaration') {
        const name = node.namedChildren?.find(
          (child: any) => child.type === 'type_identifier'
        )?.text;
        if (name === typeName) {
          return 'type_alias';
        }
      }

      for (const child of node.namedChildren || []) {
        const result = findType(child);
        if (result) return result;
      }

      return null;
    }

    return findType(result.tree);
  } catch (error) {
    return null;
  }
}

export default analyzeTypeFlow;
