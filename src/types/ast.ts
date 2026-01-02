export interface ASTNode {
  type: string;
  text: string;
  field?: string;
  startPosition: Position;
  endPosition: Position;
  children: ASTNode[];
  namedChildren: ASTNode[];
  parent: ASTNode | null;
}

export interface Position {
  row: number;
  column: number;
}

export interface ParseResult {
  tree: ASTNode;
  errors: ParseError[];
  parseTime: number;
}

export interface ParseError {
  message: string;
  startPosition: Position;
  endPosition: Position;
}

export interface Parameter {
  name: string;
  type?: string;
  defaultValue?: string;
}

export interface Method {
  name: string;
  parameters: Parameter[];
  returnType?: string;
  visibility?: 'public' | 'private' | 'protected';
  isStatic?: boolean;
  isAsync?: boolean;
  isGenerator?: boolean;
  isAbstract?: boolean;
  decorators?: string[];
}

export interface Property {
  name: string;
  type?: string;
  visibility?: 'public' | 'private' | 'protected';
  isReadonly?: boolean;
  isStatic?: boolean;
}

export interface ClassDefinition {
  type: 'class';
  name: string;
  extends?: string;
  implements?: string[];
  properties: Property[];
  methods: Method[];
  constructorDef?: {
    parameters: Parameter[];
    visibility?: 'public' | 'private' | 'protected' | undefined;
  };
  decorators?: string[];
}

export interface FunctionDefinition {
  type: 'function';
  name: string;
  parameters: Parameter[];
  returnType?: string;
  isExported?: boolean;
  isAsync?: boolean;
  isGenerator?: boolean;
  isDefault?: boolean;
  isStatic?: boolean;
  decorators?: string[];
}

export interface ImportStatement {
  type: 'import';
  source: string;
  imported: { name: string; alias?: string; isTypeOnly?: boolean }[];
  isDefault?: boolean;
  isNamespace?: boolean;
}

export interface VariableDeclaration {
  type: 'variable';
  name: string;
  varType?: string;
  isExported?: boolean;
  isConst?: boolean;
  value?: string;
}

export interface InterfaceDefinition {
  type: 'interface';
  name: string;
  extends?: string[];
  properties: { name: string; type?: string }[];
  methods: Method[];
}

export interface EnumDefinition {
  type: 'enum';
  name: string;
  members: { name: string; value?: string }[];
}

export interface TypeAlias {
  type: 'type_alias';
  name: string;
  definition?: string;
}

export interface FileSkeleton {
  filePath: string;
  language: string;
  imports: ImportStatement[];
  exports: {
    classes: ClassDefinition[];
    functions: FunctionDefinition[];
    interfaces: InterfaceDefinition[];
    enums: EnumDefinition[];
    typeAliases: TypeAlias[];
    variables: VariableDeclaration[];
  };
}

export interface SymbolDefinition {
  id: string;
  name: string;
  type: 'function' | 'method' | 'variable' | 'class' | 'parameter';
  filePath: string;
  startPosition: Position;
  endPosition: Position;
  className?: string;
  isExported?: boolean;
  isStatic?: boolean;
}

export interface SymbolReference {
  symbolId: string;
  filePath: string;
  startPosition: Position;
  endPosition: Position;
  context: {
    parentFunction?: string;
    parentClass?: string;
    callType: 'direct' | 'method' | 'callback' | 'indirect';
  };
}

export interface CallSite {
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  functionName: string;
  callerFunction?: string;
  callerClass?: string;
  callType: 'direct' | 'method' | 'callback' | 'indirect';
}

export interface FindCallersResult {
  symbol: {
    name: string;
    type: string;
    filePath: string;
    line: number;
  };
  callers: CallSite[];
  totalCount: number;
}

export interface SemanticQuery {
  nodeType?: 'function' | 'class' | 'variable';
  parameters?: { name: string; type?: string }[];
  returnType?: string;
  modifiers?: string[];
  namePattern?: string;
}

export interface SearchResult {
  name: string;
  type: 'function' | 'method' | 'class' | 'variable';
  filePath: string;
  startPosition: Position;
  endPosition: Position;
  parentClass?: string;
  parentFunction?: string;
  parameters?: { name: string; type?: string }[];
  returnType?: string;
  extends?: string;
  implements?: string[];
  varType?: string;
  modifiers?: string[];
}

export interface SemanticSearchResult {
  filePath: string;
  language: string;
  query: SemanticQuery;
  results: SearchResult[];
  totalMatches: number;
}

export interface RefactorSuggestion {
  type: 'extract_function';
  message: string;
  locations: {
    filePath: string;
    startPosition: Position;
    endPosition: Position;
  }[];
}
