import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { logger } from '../utils/logger.js';
import type { ASTNode, SymbolDefinition } from '../types/ast.js';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

const REACT_LIFECYCLE_METHODS = new Set([
  'constructor',
  'render',
  'componentDidMount',
  'componentDidUpdate',
  'componentWillUnmount',
  'componentDidCatch',
  'getDerivedStateFromProps',
  'getDerivedStateFromError',
  'getSnapshotBeforeUpdate',
  'shouldComponentUpdate',
  'UNSAFE_componentWillMount',
  'UNSAFE_componentWillReceiveProps',
  'UNSAFE_componentWillUpdate',
]);

const FASTAPI_STARLETTE_LIFECYCLE_METHODS = new Set([
  'dispatch',
  '__init__',
  '__call__',
  'process_request',
  'process_response',
  'process_view',
  'process_exception',
  'process_template_response',
  'filter', // logging.Filter.filter() method
]);

const DJANGO_MIDDLEWARE_METHODS = new Set([
  'process_request',
  'process_response',
  'process_view',
  'process_exception',
  'process_template_response',
  '__init__',
  '__call__',
]);

const EXPRESS_MIDDLEWARE_METHODS = new Set(['errorHandler', 'handle', 'use']);

const PYTHON_MAGIC_METHODS = new Set([
  '__init__',
  '__call__',
  '__str__',
  '__repr__',
  '__eq__',
  '__hash__',
  '__len__',
  '__getitem__',
  '__setitem__',
  '__delitem__',
  '__iter__',
  '__contains__',
  '__enter__',
  '__exit__',
  '__getattr__',
  '__setattr__',
  '__delattr__',
]);

const FRAMEWORK_LIFECYCLE_METHODS = new Set([
  ...FASTAPI_STARLETTE_LIFECYCLE_METHODS,
  ...DJANGO_MIDDLEWARE_METHODS,
  ...EXPRESS_MIDDLEWARE_METHODS,
  ...PYTHON_MAGIC_METHODS,
  ...REACT_LIFECYCLE_METHODS,
]);

const MIDDLEWARE_CLASS_PATTERNS = [/Middleware$/i, /Filter$/i, /Interceptor$/i, /Handler$/i];

const CONFIGURATION_FILE_PATTERNS = [
  /config\.(py|js|ts)$/i,
  /settings\.(py|js|ts)$/i,
  /.*config\.(json|yaml|yml|toml|ini)$/i,
  /.*settings\.(json|yaml|yml|toml|ini)$/i,
  /__init__\.py$/,
];

function isMiddlewareClass(className: string, _filePath: string): boolean {
  for (const pattern of MIDDLEWARE_CLASS_PATTERNS) {
    if (pattern.test(className)) {
      return true;
    }
  }
  return false;
}

function isFrameworkMethod(methodName: string): boolean {
  return FRAMEWORK_LIFECYCLE_METHODS.has(methodName);
}

function isConfigurationFile(filePath: string): boolean {
  for (const pattern of CONFIGURATION_FILE_PATTERNS) {
    if (pattern.test(basename(filePath))) {
      return true;
    }
  }
  return false;
}

function extractClassReferencesFromConfig(filePath: string): Set<string> {
  const references = new Set<string>();

  try {
    if (!existsSync(filePath)) {
      return references;
    }

    const content = readFileSync(filePath, 'utf-8');
    const ext = extname(filePath).toLowerCase();

    if (ext === '.py') {
      extractPythonConfigReferences(content, references);
    } else if (ext === '.json') {
      extractJsonConfigReferences(content, references);
    } else if (ext === '.js' || ext === '.ts') {
      extractJsConfigReferences(content, references);
    } else if (ext === '.yaml' || ext === '.yml') {
      extractYamlConfigReferences(content, references);
    }
  } catch (error) {
    logger.warn(`Failed to parse config file ${filePath}`, error as Record<string, unknown>);
  }

  return references;
}

function extractPythonConfigReferences(content: string, references: Set<string>): void {
  const importRegex = /from\s+([\w.]+)\s+import|import\s+([\w.]+)/g;
  const stringReferenceRegex = /['"]([\w.]+)['"]/g;

  let match;
  const imports = new Set<string>();

  while ((match = importRegex.exec(content)) !== null) {
    const module = match[1] || match[2];
    if (module && !module.startsWith('.') && module.includes('.')) {
      const className = module.split('.').pop();
      if (className) {
        imports.add(className);
      }
    }
  }

  while ((match = stringReferenceRegex.exec(content)) !== null) {
    const ref = match[1];
    if (!ref) continue;
    if (ref.includes('.')) {
      const parts = ref.split('.');
      if (parts.length >= 2) {
        const className = parts[parts.length - 1];
        if (
          className &&
          (imports.has(className) || 
           ref.startsWith('app.') || 
           ref.includes('logging.') ||
           ref.includes('middleware.') ||
           ref.includes('core.') ||
           ref.includes('filters.'))
        ) {
          references.add(className);
        }
      }
    }
  }
}

function extractJsonConfigReferences(content: string, references: Set<string>): void {
  try {
    const json = JSON.parse(content);
    extractClassReferencesFromValue(json, references);
  } catch {}
}

function extractJsConfigReferences(content: string, references: Set<string>): void {
  const importRegex = /import.*from\s+['"]([\w.]+)['"]/g;
  const requireRegex = /require\(['"]([\w.]+)['"]\)/g;
  const stringReferenceRegex = /['"]([\w.]+)['"]/g;
  
  let match;
  const imports = new Set<string>();
  
  while ((match = importRegex.exec(content)) !== null) {
    const module = match[1];
    if (module && !module.startsWith('.') && module.includes('/')) {
      const className = module.split('/').pop()?.replace(/\.\w+$/, '');
      if (className) {
        imports.add(className);
      }
    }
  }
  
  while ((match = requireRegex.exec(content)) !== null) {
    const module = match[1];
    if (module && !module.startsWith('.') && module.includes('/')) {
      const className = module.split('/').pop()?.replace(/\.\w+$/, '');
      if (className) {
        imports.add(className);
      }
    }
  }
  
  while ((match = stringReferenceRegex.exec(content)) !== null) {
    const ref = match[1];
    if (!ref) continue;
    if (ref.includes('.')) {
      const parts = ref.split('.');
      if (parts.length >= 2) {
        const className = parts[parts.length - 1];
        if (className && imports.has(className)) {
          references.add(className);
        }
      }
    }
  }
}

function extractYamlConfigReferences(content: string, references: Set<string>): void {
  const stringRegex = /['"]([\w.]+)['"]/g;
  let match;

  while ((match = stringRegex.exec(content)) !== null) {
    const ref = match[1];
    if (!ref) continue;
    if (ref.includes('.')) {
      const parts = ref.split('.');
      if (parts.length >= 2) {
        const className = parts[parts.length - 1];
        if (className) {
          references.add(className);
        }
      }
    }
  }
}

function extractClassReferencesFromValue(value: any, references: Set<string>): void {
  if (typeof value === 'string') {
    if (value.includes('.')) {
      const parts = value.split('.');
      if (parts.length >= 2) {
        const className = parts[parts.length - 1];
        if (className) {
          references.add(className);
        }
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      extractClassReferencesFromValue(item, references);
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const key in value) {
      extractClassReferencesFromValue(value[key], references);
    }
  }
}

interface DeadCodeSymbol {
  name: string;
  type: 'function' | 'method' | 'class' | 'variable';
  filePath: string;
  line: number;
  column: number;
  className?: string;
  isExported: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

interface DeadCodeResult {
  totalSymbols: number;
  unusedSymbols: DeadCodeSymbol[];
  summary: {
    unusedFunctions: number;
    unusedMethods: number;
    unusedClasses: number;
    unusedVariables: number;
  };
  warnings: string[];
  configReferences: string[];
}

export default async function findDeadCode(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath, directoryPath, includeExported = false } = args;

  if (typeof filePath !== 'string' && typeof directoryPath !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: either filePath or directoryPath must be provided',
        },
      ],
      isError: true,
    };
  }

  try {
    const targetPath = (directoryPath || filePath) as string;
    const isDirectory = typeof directoryPath === 'string';

    logger.info('Finding dead code', { targetPath, isDirectory, includeExported });

    const files = isDirectory ? findSourceFiles(targetPath) : [targetPath];

    if (files.length === 0) {
      return {
        content: [{ type: 'text', text: 'No source files found to analyze' }],
        isError: true,
      };
    }

    const symbolTable = await buildSymbolTable(files);
    const allSymbols = Object.values(symbolTable);

    const referenceMap = await buildReferenceMap(files, symbolTable);

    const configReferences = await buildConfigReferenceMap(files);

    const unusedSymbols: DeadCodeSymbol[] = [];
    const warnings: string[] = [];

    for (const symbol of allSymbols) {
      if (symbol.type === 'parameter') continue;

      if (!includeExported && symbol.isExported) continue;

      const symbolId = symbol.id;
      const referenceCount = referenceMap.get(symbolId) || 0;
      const hasConfigRef = configReferences.has(symbol.name);

      if (referenceCount === 0 && !hasConfigRef) {
        const confidence = determineConfidence(symbol);
        const reason = getUnusedReason(symbol, includeExported as boolean);

        unusedSymbols.push({
          name: symbol.name,
          type: symbol.type as 'function' | 'method' | 'class' | 'variable',
          filePath: symbol.filePath,
          line: symbol.startPosition.row + 1,
          column: symbol.startPosition.column,
          className: symbol.className,
          isExported: symbol.isExported || false,
          confidence,
          reason,
        });
      }
    }

    unusedSymbols.sort((a, b) => {
      const fileCompare = a.filePath.localeCompare(b.filePath);
      if (fileCompare !== 0) return fileCompare;
      return a.line - b.line;
    });

    if (unusedSymbols.length > 0) {
      warnings.push(
        'Note: This analysis cannot detect dynamic calls (e.g., obj[method](), Reflect.apply(), event handlers registered by name). Review with caution before deleting.'
      );
      if (configReferences.size > 0) {
        warnings.push(
          `Note: Found ${configReferences.size} class references in configuration files (marked as used even without direct code references).`
        );
      }
    }

    const result: DeadCodeResult = {
      totalSymbols: allSymbols.filter((s) => s.type !== 'parameter').length,
      unusedSymbols,
      summary: {
        unusedFunctions: unusedSymbols.filter((s) => s.type === 'function').length,
        unusedMethods: unusedSymbols.filter((s) => s.type === 'method').length,
        unusedClasses: unusedSymbols.filter((s) => s.type === 'class').length,
        unusedVariables: unusedSymbols.filter((s) => s.type === 'variable').length,
      },
      warnings,
      configReferences: Array.from(configReferences),
    };

    logger.info('Dead code analysis complete', {
      totalSymbols: result.totalSymbols,
      unusedCount: unusedSymbols.length,
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
    logger.error('Failed to find dead code', error as Error);

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

function findSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.pyw'];

  try {
    const stats = statSync(dir);
    if (!stats.isDirectory()) {
      if (extensions.includes(extname(dir))) {
        return [dir];
      }
      return [];
    }
  } catch {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (
        entry.name !== 'node_modules' &&
        entry.name !== '.git' &&
        entry.name !== 'build' &&
        entry.name !== 'dist' &&
        !entry.name.startsWith('.')
      ) {
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

async function buildSymbolTable(files: string[]): Promise<SymbolTable> {
  const symbolTable: SymbolTable = {};

  for (const file of files) {
    try {
      const parser = ParserFactory.getParserForFile(file);
      const result = await parser.parseFile(file);

      const exportedNames = collectExportedNames(result.tree);
      const symbols = extractSymbols(result.tree, file, exportedNames);

      for (const symbol of symbols) {
        symbolTable[symbol.id] = symbol;
      }
    } catch (error) {
      logger.warn(`Failed to parse ${file}`, error as Record<string, unknown>);
    }
  }

  return symbolTable;
}

async function buildConfigReferenceMap(files: string[]): Promise<Set<string>> {
  const references = new Set<string>();

  for (const file of files) {
    // Always scan Python files for config dictionaries, not just files with "config" in name
    const ext = extname(file).toLowerCase();
    if (ext === '.py' || ext === '.js' || ext === '.ts' || isConfigurationFile(file)) {
      const fileRefs = extractClassReferencesFromConfig(file);
      fileRefs.forEach((ref) => references.add(ref));
    }
  }

  return references;
}

function collectExportedNames(root: ASTNode): Set<string> {
  const exportedNames = new Set<string>();

  function traverse(node: ASTNode): void {
    if (node.type === 'export_statement') {
      const exportClause = node.namedChildren.find((c) => c.type === 'export_clause');
      if (exportClause) {
        for (const specifier of exportClause.namedChildren) {
          if (specifier.type === 'export_specifier') {
            const nameNode = specifier.namedChildren.find((n) => n.type === 'identifier');
            if (nameNode) {
              exportedNames.add(nameNode.text);
            }
          }
        }
      }

      for (const child of node.namedChildren) {
        if (child.type === 'function_declaration' || child.type === 'function_definition') {
          const name = extractName(child);
          if (name) exportedNames.add(name);
        } else if (child.type === 'class_declaration' || child.type === 'class_definition') {
          const name = extractClassName(child);
          if (name) exportedNames.add(name);
        } else if (child.type === 'lexical_declaration' || child.type === 'variable_declaration') {
          for (const declarator of child.namedChildren.filter(
            (n) => n.type === 'variable_declarator'
          )) {
            const name = extractName(declarator);
            if (name) exportedNames.add(name);
          }
        }
      }
    }

    if (node.type === 'decorated_definition') {
      const child = node.namedChildren.find(
        (c) => c.type === 'function_definition' || c.type === 'class_definition'
      );
      if (child) {
        const name =
          child.type === 'class_definition' ? extractClassName(child) : extractName(child);
        if (name) exportedNames.add(name);
      }
    }

    if (node.type === 'class_definition' || node.type === 'class_declaration') {
      const className = extractClassName(node);
      if (className === 'Config') {
        let parent = node.parent;
        while (parent) {
          if (parent.type === 'class_definition' || parent.type === 'class_declaration') {
            exportedNames.add(className);
            break;
          }
          parent = parent.parent;
        }
      }
    }

    for (const child of node.namedChildren) {
      traverse(child);
    }
  }

  traverse(root);
  return exportedNames;
}

async function buildReferenceMap(
  files: string[],
  symbolTable: SymbolTable
): Promise<Map<string, number>> {
  const referenceMap = new Map<string, number>();

  for (const symbolId of Object.keys(symbolTable)) {
    referenceMap.set(symbolId, 0);
  }

  const nameToSymbols = new Map<string, SymbolDefinition[]>();
  for (const symbol of Object.values(symbolTable)) {
    const existing = nameToSymbols.get(symbol.name) || [];
    existing.push(symbol);
    nameToSymbols.set(symbol.name, existing);
  }

  for (const file of files) {
    try {
      const parser = ParserFactory.getParserForFile(file);
      const result = await parser.parseFile(file);

      const usedNames = new Set<string>();
      collectUsedIdentifiers(result.tree, usedNames, file);

      for (const name of usedNames) {
        const matchingSymbols = nameToSymbols.get(name) || [];
        for (const symbol of matchingSymbols) {
          if (
            symbol.filePath === file &&
            symbol.startPosition.row === result.tree.startPosition?.row
          ) {
            continue;
          }

          const currentCount = referenceMap.get(symbol.id) || 0;
          referenceMap.set(symbol.id, currentCount + 1);
        }
      }
    } catch (error) {
      logger.warn(`Failed to parse ${file} for references`, error as Record<string, unknown>);
    }
  }

  return referenceMap;
}

function collectUsedIdentifiers(node: ASTNode, usedNames: Set<string>, currentFile: string): void {
  if (node.type.includes('import')) {
    return;
  }

  if (
    node.type === 'function_declaration' ||
    node.type === 'function_definition' ||
    node.type === 'class_declaration' ||
    node.type === 'class_definition' ||
    node.type === 'method_definition'
  ) {
    for (const child of node.namedChildren) {
      if (child.type === 'statement_block' || child.type === 'block') {
        collectUsedIdentifiers(child, usedNames, currentFile);
      } else if (child.type === 'formal_parameters') {
        continue;
      } else if (child.type !== 'identifier' && child.type !== 'type_identifier') {
        collectUsedIdentifiers(child, usedNames, currentFile);
      }
    }
    return;
  }

  if (
    node.type === 'identifier' ||
    node.type === 'type_identifier' ||
    node.type === 'property_identifier' ||
    node.type === 'shorthand_property_identifier' ||
    node.type === 'jsx_opening_element' ||
    node.type === 'jsx_closing_element' ||
    node.type === 'jsx_self_closing_element' ||
    node.type === 'jsx_attribute'
  ) {
    if (
      node.type === 'identifier' ||
      node.type === 'type_identifier' ||
      node.type === 'property_identifier' ||
      node.type === 'shorthand_property_identifier'
    ) {
      const parent = node.parent;
      if (parent && !isDeclarationContext(parent, node)) {
        usedNames.add(node.text);
      }
    } else if (node.type === 'jsx_opening_element' || node.type === 'jsx_self_closing_element') {
      const nameNode = node.namedChildren[0];
      if (
        nameNode &&
        (nameNode.type === 'identifier' ||
          nameNode.type === 'type_identifier' ||
          nameNode.type === 'member_expression')
      ) {
        usedNames.add(nameNode.text);
      }
    } else if (node.type === 'jsx_attribute') {
    }
  }

  for (const child of node.namedChildren) {
    collectUsedIdentifiers(child, usedNames, currentFile);
  }
}

function isDeclarationContext(parent: ASTNode | null, node: ASTNode): boolean {
  if (!parent) return false;

  if (parent.type === 'variable_declarator') {
    const nameNode = parent.namedChildren[0];
    return nameNode === node;
  }

  if (
    parent.type === 'function_declaration' ||
    parent.type === 'function_definition' ||
    parent.type === 'method_definition'
  ) {
    const nameNode = parent.namedChildren.find(
      (n) => n.type === 'identifier' || n.type === 'property_identifier'
    );
    return nameNode === node;
  }

  if (parent.type === 'class_declaration' || parent.type === 'class_definition') {
    const nameNode = parent.namedChildren.find(
      (n) => n.type === 'identifier' || n.type === 'type_identifier'
    );
    return nameNode === node;
  }

  if (
    parent.type === 'formal_parameters' ||
    parent.type === 'required_parameter' ||
    parent.type === 'optional_parameter' ||
    parent.type === 'shorthand_property_identifier_pattern' ||
    parent.type === 'object_pattern' ||
    parent.type === 'array_pattern' ||
    parent.type === 'typed_parameter' ||
    parent.type === 'parameters'
  ) {
    return true;
  }

  return false;
}

function extractSymbols(
  root: ASTNode,
  filePath: string,
  exportedNames: Set<string>
): SymbolDefinition[] {
  const symbols: SymbolDefinition[] = [];

  function traverse(node: ASTNode, parentClass?: string): void {
    switch (node.type) {
      case 'function_declaration':
      case 'function_definition': {
        const name = extractName(node);
        if (name) {
          const isMethod = parentClass !== undefined;
          const isPythonMagic = name.startsWith('__') && name.endsWith('__');
          const isFramework = isFrameworkMethod(name);
          const parentIsMiddleware = parentClass ? isMiddlewareClass(parentClass, filePath) : false;
          
          // Framework lifecycle methods in middleware/filter/handler classes should be marked as used
          const isMiddlewareLifecycleMethod = isMethod && parentIsMiddleware && isFramework;

          symbols.push({
            id: generateSymbolId({
              name,
              className: parentClass,
              filePath,
              type: isMethod ? 'method' : 'function',
            }),
            name,
            type: isMethod ? 'method' : 'function',
            className: parentClass,
            filePath,
            startPosition: node.startPosition,
            endPosition: node.endPosition,
            isExported: exportedNames.has(name) || isExported(node) || isPythonMagic || isMiddlewareLifecycleMethod,
          });
        }
        break;
      }

      case 'method_definition': {
        const name = extractName(node);
        if (name) {
          const isReactLifecycle = REACT_LIFECYCLE_METHODS.has(name);
          const isPythonMagic = name.startsWith('__') && name.endsWith('__');
          const isFramework = isFrameworkMethod(name);
          const parentIsMiddleware = parentClass ? isMiddlewareClass(parentClass, filePath) : false;
          
          // Framework lifecycle methods in middleware/filter/handler classes should be marked as used
          const isMiddlewareLifecycleMethod = parentIsMiddleware && isFramework;

          const isExported = isReactLifecycle || isPythonMagic || isMiddlewareLifecycleMethod;

          symbols.push({
            id: generateSymbolId({ name, className: parentClass, filePath, type: 'method' }),
            name,
            type: 'method',
            className: parentClass,
            filePath,
            startPosition: node.startPosition,
            endPosition: node.endPosition,
            isExported,
          });
        }
        break;
      }

      case 'class_declaration':
      case 'class_definition': {
        const className = extractClassName(node);
        if (className) {
          const isMiddleware = isMiddlewareClass(className, filePath);
          const parentIsExported = exportedNames.has(className) || isExported(node);
          
          // Don't automatically mark middleware classes as exported - let usage determine that
          // Only mark as exported if actually exported in code
          symbols.push({
            id: generateSymbolId({ name: className, filePath, type: 'class' }),
            name: className,
            type: 'class',
            filePath,
            startPosition: node.startPosition,
            endPosition: node.endPosition,
            isExported: parentIsExported,
          });
        }
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
              isExported: exportedNames.has(varName) || isExported(node),
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
              id: generateSymbolId({ name: paramName, filePath, type: 'parameter' }),
              name: paramName,
              type: 'parameter',
              filePath,
              startPosition: param.startPosition,
              endPosition: param.endPosition,
            });
          }
        }
        break;

      case 'assignment': {
        const leftNode = node.namedChildren.find((c) => c.field === 'left');
        if (leftNode && leftNode.type === 'identifier') {
          const varName = leftNode.text;
          const isTopLevel =
            node.parent?.type === 'module' ||
            (node.parent?.type === 'expression_statement' && node.parent.parent?.type === 'module');

          if (isTopLevel) {
            symbols.push({
              id: generateSymbolId({ name: varName, filePath, type: 'variable' }),
              name: varName,
              type: 'variable',
              filePath,
              startPosition: leftNode.startPosition,
              endPosition: leftNode.endPosition,
              isExported: isExported(node),
            });
          }
        }
        break;
      }

      case 'decorated_definition': {
        const child = node.namedChildren.find(
          (c) => c.type === 'function_definition' || c.type === 'class_definition'
        );
        if (child) {
          const name =
            child.type === 'class_definition' ? extractClassName(child) : extractName(child);
          if (name) {
            const isMethod = parentClass !== undefined;

            symbols.push({
              id: generateSymbolId({
                name,
                className: parentClass,
                filePath,
                type:
                  child.type === 'class_definition' ? 'class' : isMethod ? 'method' : 'function',
              }),
              name,
              type: child.type === 'class_definition' ? 'class' : isMethod ? 'method' : 'function',
              className: parentClass,
              filePath,
              startPosition: child.startPosition,
              endPosition: child.endPosition,
              isExported: true,
            });
          }
        }
        break;
      }
    }

    for (const child of node.namedChildren) {
      let nextParentClass = parentClass;
      if (node.type === 'class_declaration' || node.type === 'class_definition') {
        nextParentClass = extractClassName(node);
      }
      traverse(child, nextParentClass);
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
  if (node.parent && node.parent.type === 'export_statement') {
    return true;
  }

  return node.children.some((child) => child.type === 'export' || child.text === 'export');
}

function generateSymbolId(symbol: Partial<SymbolDefinition>): string {
  const parts = [symbol.type, symbol.name];
  if (symbol.className) {
    parts.push(symbol.className);
  }
  if (symbol.filePath) {
    parts.push(symbol.filePath);
  }
  return parts.join(':');
}

function determineConfidence(symbol: SymbolDefinition): 'high' | 'medium' | 'low' {
  if (!symbol.isExported && (symbol.type === 'function' || symbol.type === 'method')) {
    return 'high';
  }

  if (symbol.isExported) {
    return 'low';
  }

  if (symbol.type === 'class' && !symbol.isExported) {
    return 'high';
  }

  if (symbol.type === 'variable' && !symbol.isExported) {
    return 'high';
  }

  return 'medium';
}

function getUnusedReason(symbol: SymbolDefinition, includeExported: boolean): string {
  if (symbol.isExported && includeExported) {
    return 'Exported but no internal references found. May be used externally.';
  }

  if (symbol.type === 'method' && symbol.className) {
    return `Method '${symbol.name}' in class '${symbol.className}' has no detected call sites.`;
  }

  if (symbol.type === 'function') {
    return `Function '${symbol.name}' is defined but never called.`;
  }

  if (symbol.type === 'class') {
    return `Class '${symbol.name}' is defined but never instantiated or referenced.`;
  }

  if (symbol.type === 'variable') {
    return `Variable '${symbol.name}' is declared but never used.`;
  }

  return 'No references found.';
}
