import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { ParserError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type {
  FileSkeleton,
  ClassDefinition,
  FunctionDefinition,
  Method,
  Parameter,
  Property,
  ASTNode,
  ImportStatement,
  VariableDeclaration,
} from '../types/ast.js';

export async function getSkeleton(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath } = args;

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
    logger.info('Extracting skeleton', { filePath });

    const parser = ParserFactory.getParserForFile(filePath);
    const result = await parser.parseFile(filePath);
    const language = parser.getLanguage();

    const skeleton = extractSkeleton(result.tree, filePath, language);

    logger.info('Skeleton extracted successfully', {
      filePath,
      classCount: skeleton.exports.classes.length,
      functionCount: skeleton.exports.functions.length,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(skeleton, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to extract skeleton', error as Error, { filePath });

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

export function extractSkeleton(root: ASTNode, filePath: string, language: string): FileSkeleton {
  const skeleton: FileSkeleton = {
    filePath,
    language,
    imports: [],
    exports: {
      classes: [],
      functions: [],
      interfaces: [],
      enums: [],
      typeAliases: [],
      variables: [],
    },
  };

  if (language === 'typescript' || language === 'javascript') {
    extractTypeScriptSkeleton(root, skeleton);
  } else if (language === 'python') {
    extractPythonSkeleton(root, skeleton);
  }

  return skeleton;
}

function extractTypeScriptSkeleton(root: ASTNode, skeleton: FileSkeleton): void {
  const statements = root.children;

  for (const statement of statements) {
    switch (statement.type) {
      case 'import_statement':
        skeleton.imports.push(extractTypeScriptImport(statement));
        break;
      case 'export_statement':
        extractTypeScriptExport(statement, skeleton);
        break;
      case 'class_declaration':
        skeleton.exports.classes.push(extractTypeScriptClass(statement));
        break;
      case 'function_declaration':
      case 'function_definition':
        const func = extractTypeScriptFunction(statement);
        if (func.name !== 'constructor') {
          skeleton.exports.functions.push(func);
        }
        break;
      case 'variable_declaration':
      case 'lexical_declaration': {
        const variable = extractTypeScriptVariable(statement);
        if (variable.isExported) {
          skeleton.exports.variables.push(variable);
        }
        break;
      }

      case 'type_alias_declaration':
        skeleton.exports.typeAliases.push(extractTypeAlias(statement));
        break;
    }
  }
}

function extractTypeScriptImport(node: ASTNode): ImportStatement {
  const imp: ImportStatement = {
    type: 'import',
    source: '',
    imported: [],
  };

  for (const child of node.namedChildren) {
    if (child.type === 'string') {
      imp.source = child.text.slice(1, -1);
    } else if (child.type === 'import_clause') {
      for (const clauseChild of child.namedChildren) {
        if (clauseChild.type === 'identifier') {
          imp.imported.push({ name: clauseChild.text });
          imp.isDefault = true;
        } else if (clauseChild.type === 'named_imports') {
          for (const named of clauseChild.namedChildren.filter(
            (n) => n.type === 'import_specifier'
          )) {
            const parts = named.namedChildren.filter(
              (n) => n.type === 'identifier' || n.type === 'property_identifier'
            );
            if (parts.length === 1) {
              imp.imported.push({ name: parts[0]?.text ?? '' });
            } else if (parts.length === 2) {
              imp.imported.push({ name: parts[0]?.text ?? '', alias: parts[1]?.text });
            }
          }
        } else if (clauseChild.type === 'namespace_import') {
          const identifier = clauseChild.namedChildren.find((n) => n.type === 'identifier');
          if (identifier) {
            imp.imported.push({ name: identifier.text });
            imp.isNamespace = true;
          }
        }
      }
    } else if (child.type === 'namespace_import') {
      const identifier = child.namedChildren.find((n) => n.type === 'identifier');
      if (identifier) {
        imp.imported.push({ name: identifier.text });
        imp.isNamespace = true;
      }
    }
  }

  return imp;
}

function extractTypeScriptExport(node: ASTNode, skeleton: FileSkeleton): void {
  function processNode(n: ASTNode): void {
    switch (n.type) {
      case 'class_declaration':
        skeleton.exports.classes.push(extractTypeScriptClass(n));
        break;
      case 'function_declaration':
      case 'function_definition':
        skeleton.exports.functions.push(extractTypeScriptFunction(n, true));
        break;
      case 'variable_declaration':
        skeleton.exports.variables.push(extractTypeScriptVariable(n, true));
        break;
      case 'interface_declaration':
        skeleton.exports.interfaces.push(extractTypeScriptInterface(n));
        break;
      case 'enum_declaration':
        skeleton.exports.enums.push(extractTypeEnum(n));
        break;
      case 'type_alias_declaration':
        skeleton.exports.typeAliases.push(extractTypeAlias(n));
        break;
      case 'export_clause':
        for (const specifier of n.namedChildren.filter(
          (child) => child.type === 'export_specifier'
        )) {
          const identifiers = specifier.namedChildren.filter(
            (child) => child.type === 'identifier' || child.type === 'property_identifier'
          );
          if (identifiers.length > 0) {
            skeleton.exports.variables.push({
              type: 'variable',
              name: identifiers[0]?.text ?? '',
              isExported: true,
              alias: identifiers.length > 1 ? identifiers[1]?.text : undefined,
            } as any);
          }
        }
        break;
    }

    for (const child of n.children) {
      processNode(child);
    }
  }

  for (const child of node.children) {
    processNode(child);
  }
}

function extractTypeScriptClass(node: ASTNode): ClassDefinition {
  const classDef: ClassDefinition = {
    type: 'class',
    name: '',
    properties: [],
    methods: [],
  };

  for (const child of node.children) {
    if (child.type === 'type_identifier' || child.type === 'identifier') {
      classDef.name = child.text;
    } else if (child.type === 'class_heritage') {
      for (const heritage of child.namedChildren) {
        if (heritage.type.includes('extends')) {
          const identifier = heritage.namedChildren.find(
            (n) => n.type === 'type_identifier' || n.type === 'identifier'
          );
          if (identifier) classDef.extends = identifier.text;
        } else if (heritage.type.includes('implements')) {
          const identifiers = heritage.namedChildren.filter((n) => n.type === 'type_identifier');
          classDef.implements = identifiers.map((n) => n.text);
        }
      }
    } else if (child.type === 'decorator') {
      if (!classDef.decorators) classDef.decorators = [];
      classDef.decorators.push(extractDecorator(child));
    } else if (child.type === 'class_body') {
      for (const member of child.children) {
        if (member.type === 'public_field_definition' || member.type === 'property_definition') {
          classDef.properties.push(extractTypeScriptProperty(member));
        } else if (member.type === 'method_definition') {
          const method = extractTypeScriptMethod(member);
          if (method.name !== 'constructor') {
            classDef.methods.push(method);
          }
        } else if (member.type === 'constructor_definition') {
          classDef.constructorDef = {
            parameters: extractParameters(member),
            visibility: extractVisibility(member),
          };
        }
      }
    }
  }

  return classDef;
}

function extractTypeScriptProperty(node: ASTNode): Property {
  const prop: Property = { name: '' };

  for (const child of node.children) {
    if (child.type === 'property_identifier' || child.type === 'identifier') {
      prop.name = child.text;
    } else if (child.type === 'type_annotation') {
      const typeNode = child.namedChildren.find(
        (n) => n.type === 'type_identifier' || n.type.includes('type')
      );
      if (typeNode) prop.type = typeNode.text;
    } else if (child.type === 'accessibility_modifier') {
      prop.visibility = child.text as 'public' | 'private' | 'protected';
    } else if (child.type === 'readonly_modifier' || child.type === 'readonly') {
      prop.isReadonly = true;
    } else if (child.type === 'static_modifier' || child.type === 'static') {
      prop.isStatic = true;
    }
  }

  return prop;
}

function extractTypeScriptMethod(node: ASTNode): Method {
  const method: Method = { name: '', parameters: [] };

  for (const child of node.children) {
    if (child.type === 'property_identifier' || child.type === 'identifier') {
      method.name = child.text;
    } else if (child.type === 'formal_parameters') {
      method.parameters = extractParameters(child);
    } else if (child.type === 'type_annotation') {
      const typeNode = child.namedChildren.find(
        (n) => n.type === 'type_identifier' || n.type.includes('type')
      );
      if (typeNode) {
        let returnType: string = typeNode.text;
        const genericMatch = returnType.match(/^(\w+)<.*>$/);
        if (genericMatch && genericMatch[1]) {
          returnType = genericMatch[1];
        }
        method.returnType = returnType;
      }
    } else if (child.type === 'accessibility_modifier') {
      method.visibility = child.text as 'public' | 'private' | 'protected';
    } else if (child.type === 'static_modifier' || child.type === 'static') {
      method.isStatic = true;
    } else if (child.type === 'async') {
      method.isAsync = true;
    } else if (child.type === 'generator_modifier') {
      method.isGenerator = true;
    } else if (child.type === 'decorator') {
      if (!method.decorators) method.decorators = [];
      method.decorators.push(extractDecorator(child));
    }
  }

  return method;
}

function extractParameters(node: ASTNode): Parameter[] {
  const parameters: Parameter[] = [];

  for (const child of node.namedChildren) {
    if (child.type === 'required_parameter' || child.type === 'optional_parameter') {
      const param: Parameter = { name: '' };
      for (const p of child.namedChildren) {
        if (p.type === 'identifier' || p.type === 'property_identifier') {
          param.name = p.text;
        } else if (p.type === 'type_annotation') {
          const typeNode = p.namedChildren.find(
            (n) => n.type === 'type_identifier' || n.type.includes('type')
          );
          if (typeNode) param.type = typeNode.text;
        } else if (p.type === 'default_value') {
          param.defaultValue = p.text;
        }
      }
      parameters.push(param);
    }
  }

  return parameters;
}

function extractTypeScriptFunction(node: ASTNode, isExported = false): FunctionDefinition {
  const func: FunctionDefinition = {
    type: 'function',
    name: '',
    parameters: [],
    isExported,
  };

  for (const child of node.children) {
    if (child.type === 'identifier' || child.type === 'property_identifier') {
      func.name = child.text;
    } else if (child.type === 'formal_parameters') {
      func.parameters = extractParameters(child);
    } else if (child.type === 'type_annotation') {
      const typeNode = child.namedChildren.find(
        (n) => n.type === 'type_identifier' || n.type.includes('type')
      );
      if (typeNode) {
        let returnType: string = typeNode.text;
        const genericMatch = returnType.match(/^(\w+)<.*>$/);
        if (genericMatch && genericMatch[1]) {
          returnType = genericMatch[1];
        }
        func.returnType = returnType;
      }
    } else if (child.type === 'async') {
      func.isAsync = true;
    } else if (child.type === 'generator_modifier') {
      func.isGenerator = true;
    } else if (child.type === 'decorator') {
      if (!func.decorators) func.decorators = [];
      func.decorators.push(extractDecorator(child));
    }
  }

  return func;
}

function extractTypeScriptVariable(node: ASTNode, isExported = false): VariableDeclaration {
  const variable: VariableDeclaration = {
    type: 'variable',
    name: '',
    isExported,
  };

  for (const child of node.namedChildren) {
    if (child.type === 'variable_declarator') {
      for (const declarator of child.namedChildren) {
        if (declarator.type === 'identifier' || declarator.type === 'property_identifier') {
          variable.name = declarator.text;
        } else if (declarator.type === 'type_annotation') {
          const typeNode = declarator.namedChildren.find((n) => n.type === 'type_identifier');
          if (typeNode) variable.varType = child.text.trim();
        }
      }
    } else if (child.type === 'const' || child.type === 'let' || child.type === 'var') {
      variable.isConst = child.type === 'const';
    }
  }

  return variable;
}

function extractTypeScriptInterface(node: ASTNode): any {
  const iface: any = {
    type: 'interface',
    name: '',
    properties: [],
    methods: [],
  };

  for (const child of node.namedChildren) {
    if (child.type === 'type_identifier') {
      iface.name = child.text;
    } else if (child.type === 'type_parameters') {
      const identifiers = child.namedChildren.filter((n) => n.type === 'type_identifier');
      iface.typeParameters = identifiers.map((n) => n.text);
    } else if (child.type === 'extends_type_clause' || child.type === 'extends_clause') {
      const identifiers = child.namedChildren.filter((n) => n.type === 'type_identifier');
      iface.extends = identifiers.map((n) => n.text);
    } else if (child.type === 'interface_body') {
      for (const member of child.namedChildren) {
        if (member.type === 'property_signature') {
          iface.properties.push(extractTypeScriptPropertySignature(member));
        } else if (member.type === 'method_signature') {
          iface.methods.push(extractTypeScriptMethodSignature(member));
        } else if (member.type === 'call_signature') {
          iface.methods.push(extractTypeScriptMethodSignature(member));
        }
      }
    }
  }

  return iface;
}

function extractTypeScriptPropertySignature(node: ASTNode): any {
  const prop: any = { name: '' };

  for (const child of node.namedChildren) {
    if (child.type === 'property_identifier') {
      prop.name = child.text;
    } else if (child.type === 'type_annotation') {
      const typeNode = child.namedChildren.find(
        (n) => n.type === 'type_identifier' || n.type.includes('type')
      );
      if (typeNode) prop.type = typeNode.text;
    }
  }

  return prop;
}

function extractTypeScriptMethodSignature(node: ASTNode): Method {
  const method: Method = { name: '', parameters: [] };

  for (const child of node.namedChildren) {
    if (child.type === 'property_identifier') {
      method.name = child.text;
    } else if (child.type === 'formal_parameters') {
      method.parameters = extractParameters(child);
    } else if (child.type === 'type_annotation') {
      const typeNode = child.namedChildren.find(
        (n) => n.type === 'type_identifier' || n.type.includes('type')
      );
      if (typeNode) method.returnType = typeNode.text;
    }
  }

  return method;
}

function extractTypeEnum(node: ASTNode): any {
  const enumDef: any = {
    type: 'enum',
    name: '',
    members: [],
  };

  for (const child of node.namedChildren) {
    if (child.type === 'identifier' || child.type === 'type_identifier') {
      enumDef.name = child.text;
    } else if (child.type === 'enum_body') {
      for (const member of child.namedChildren) {
        if (member.type === 'property_identifier') {
          enumDef.members.push({ name: member.text });
        } else if (member.type === 'enum_assignment') {
          const nameNode = member.namedChildren.find((n) => n.type === 'property_identifier');
          const valueNode = member.namedChildren.find((n) => n.type === 'string');
          enumDef.members.push({
            name: nameNode?.text ?? '',
            value: valueNode ? valueNode.text.slice(1, -1) : undefined,
          });
        }
      }
    }
  }

  return enumDef;
}

function extractTypeAlias(node: ASTNode): any {
  const alias: any = {
    type: 'type_alias',
    name: '',
  };

  for (const child of node.namedChildren) {
    if (child.type === 'type_identifier') {
      alias.name = child.text;
    } else if (child.type === 'type_annotation') {
      alias.definition = child.text;
    }
  }

  return alias;
}

function extractDecorator(node: ASTNode): string {
  const identifier = node.namedChildren.find(
    (n) => n.type === 'identifier' || n.type === 'decorator_identifier'
  );
  return identifier ? identifier.text : node.text;
}

function extractVisibility(node: ASTNode): 'public' | 'private' | 'protected' | undefined {
  const modifier = node.namedChildren.find((n) => n.type === 'accessibility_modifier');
  return modifier ? (modifier.text as 'public' | 'private' | 'protected') : undefined;
}

export default getSkeleton;

function extractPythonSkeleton(root: ASTNode, skeleton: FileSkeleton): void {
  let statements = root.children;
  // Handle case where module has a block child containing statements
  if (root.type === 'module' && statements.length === 1 && statements[0]?.type === 'block') {
    statements = statements[0].children;
  }

  for (const statement of statements) {
    // Handle wrapped statements
    if (statement.type === 'statement') {
      for (const child of statement.children) {
        if (child.type === 'import_from_statement') {
          skeleton.imports.push(extractPythonImport(child));
        } else if (child.type === 'class_definition') {
          skeleton.exports.classes.push(extractPythonClass(child));
        } else if (child.type === 'function_definition') {
          skeleton.exports.functions.push(extractPythonFunction(child));
        } else if (child.type === 'expression_statement') {
          const variable = extractPythonVariable(child);
          if (variable) {
            skeleton.exports.variables.push(variable);
          }
        } else if (child.type === 'import_from_statement') {
          skeleton.imports.push(extractPythonImport(child));
        }
      }
    } else {
      switch (statement.type) {
        case 'import_statement':
          skeleton.imports.push(extractPythonImport(statement));
          break;
        case 'import_from_statement':
          skeleton.imports.push(extractPythonImport(statement));
          break;
        case 'class_definition':
          skeleton.exports.classes.push(extractPythonClass(statement));
          break;
        case 'decorated_definition':
          for (const child of statement.namedChildren) {
            if (child.type === 'class_definition') {
              skeleton.exports.classes.push(extractPythonClass(child));
            } else if (child.type === 'function_definition') {
              skeleton.exports.functions.push(extractPythonFunction(child));
            }
          }
          break;
        case 'function_definition':
          skeleton.exports.functions.push(extractPythonFunction(statement));
          break;
        case 'expression_statement': {
          const variable = extractPythonVariable(statement);
          if (variable) {
            skeleton.exports.variables.push(variable);
          }
          break;
        }
      }
    }
  }
}

function extractPythonImport(node: ASTNode): ImportStatement {
  const imp: ImportStatement = {
    type: 'import',
    source: '',
    imported: [],
  };

  if (node.type === 'import_statement') {
    // import os, import sys
    const dottedName = node.namedChildren.find((n) => n.type === 'dotted_name');
    if (dottedName) {
      imp.source = dottedName.text;
      imp.imported.push({ name: dottedName.text });
    }
  } else if (node.type === 'import_from_statement') {
    // from module import items
    const moduleName = node.namedChildren.find(
      (n) => n.type === 'dotted_name' && n.field === 'module_name'
    );
    if (moduleName) {
      imp.source = moduleName.text;
    }

    // Collect all imported items (exclude module name)
    const importItems = node.namedChildren.filter(
      (n) => (n.type === 'dotted_name' || n.type === 'aliased_import') && n.field !== 'module_name'
    );

    for (const item of importItems) {
      if (item.type === 'dotted_name') {
        imp.imported.push({ name: item.text });
      } else if (item.type === 'aliased_import') {
        const nameNode = item.namedChildren.find(
          (n) => n.type === 'dotted_name' || n.type === 'identifier'
        );
        const aliasNode = item.namedChildren.find(
          (n) => n.type === 'identifier' && n.field === 'alias'
        );
        if (nameNode) {
          imp.imported.push({
            name: nameNode.text,
            alias: aliasNode ? aliasNode.text : undefined,
          });
        }
      }
    }
  }

  return imp;
}

function extractPythonClass(node: ASTNode): ClassDefinition {
  const classDef: ClassDefinition = {
    type: 'class',
    name: '',
    properties: [],
    methods: [],
  };

  for (const child of node.namedChildren) {
    if (child.type === 'identifier') {
      classDef.name = child.text;
    } else if (child.type === 'argument_list') {
      const identifiers = child.namedChildren.filter(
        (n) => n.type === 'identifier' || n.type === 'dotted_name'
      );
      classDef.extends = identifiers.map((n) => n.text).join(', ');
    } else if (child.type === 'decorator') {
      if (!classDef.decorators) classDef.decorators = [];
      classDef.decorators.push(extractPythonDecorator(child));
    } else if (child.type === 'block') {
      for (const member of child.children) {
        if (member.type === 'function_definition') {
          classDef.methods.push(extractPythonFunction(member, true));
        } else if (member.type === 'decorated_definition') {
          let decorators: string[] = [];
          let funcDef: ASTNode | null = null;
          for (const decoratedChild of member.namedChildren) {
            if (decoratedChild.type === 'decorator') {
              decorators.push(extractPythonDecorator(decoratedChild));
            } else if (decoratedChild.type === 'function_definition') {
              funcDef = decoratedChild;
            }
          }
          if (funcDef) {
            const method = extractPythonFunction(funcDef, true);
            method.decorators = decorators;
            for (const dec of decorators) {
              if (dec === 'staticmethod') {
                method.isStatic = true;
              } else if (dec === 'classmethod') {
                method.isStatic = true;
              }
            }
            classDef.methods.push(method);
          }
        } else if (member.type === 'expression_statement') {
          const assignment = member.namedChildren.find((n) => n.type === 'assignment');
          if (assignment) {
            const variable = extractPythonAssignment(assignment);
            if (variable?.name.startsWith('self.')) {
              classDef.properties.push({
                name: variable.name.slice(5),
                type: variable.varType,
                isStatic: false,
              });
            }
          }
        }
      }
    }
  }

  return classDef;
}

function extractPythonFunction(node: ASTNode, isMethod = false): FunctionDefinition {
  const func: FunctionDefinition = {
    type: 'function',
    name: '',
    parameters: [],
  };

  for (const child of node.namedChildren) {
    if (child.type === 'identifier') {
      func.name = child.text;
    } else if (child.type === 'parameters') {
      func.parameters = extractPythonParameters(child, isMethod);
    } else if (child.type === 'type') {
      func.returnType = child.text;
    } else if (child.type === 'decorator') {
      if (!func.decorators) func.decorators = [];
      func.decorators.push(extractPythonDecorator(child));

      if (child.text.includes('staticmethod')) {
        func.isStatic = true;
      } else if (child.text.includes('classmethod')) {
        func.isStatic = true;
      }
    }
  }

  return func;
}

function extractPythonParameters(node: ASTNode, isMethod = false): Parameter[] {
  const parameters: Parameter[] = [];

  for (const child of node.namedChildren) {
    if (child.type === 'identifier') {
      if (!isMethod || child.text !== 'self') {
        parameters.push({ name: child.text });
      }
    } else if (child.type === 'typed_parameter') {
      const param: Parameter = { name: '' };
      for (const p of child.namedChildren) {
        if (p.type === 'identifier') {
          if (!isMethod || p.text !== 'self') {
            param.name = p.text;
          }
        } else if (p.type === 'type') {
          param.type = p.text;
        }
      }
      if (param.name) {
        parameters.push(param);
      }
    } else if (child.type === 'default_parameter') {
      const param: Parameter = { name: '', defaultValue: '' };
      for (const p of child.namedChildren) {
        if (p.type === 'identifier') {
          if (!isMethod || p.text !== 'self') {
            param.name = p.text;
          }
        } else if (p.type === 'type') {
          param.type = p.text;
        } else if (p.type === 'default_value') {
          param.defaultValue = p.text;
        }
      }
      if (param.name) {
        parameters.push(param);
      }
    }
  }

  return parameters;
}

function extractPythonVariable(node: ASTNode): VariableDeclaration | null {
  const assignment = node.namedChildren.find((n) => n.type === 'assignment');
  if (!assignment) return null;

  return extractPythonAssignment(assignment);
}

function extractPythonAssignment(node: ASTNode): VariableDeclaration | null {
  const variable: VariableDeclaration = {
    type: 'variable',
    name: '',
  };

  for (const child of node.namedChildren) {
    if (child.type === 'identifier' || child.type === 'attribute') {
      variable.name = child.text;
    }
  }

  if (!variable.name) return null;

  return variable;
}

function extractPythonDecorator(node: ASTNode): string {
  const identifier = node.namedChildren.find(
    (n) => n.type === 'identifier' || n.type === 'attribute' || n.type === 'call'
  );
  return identifier ? identifier.text : node.text;
}
