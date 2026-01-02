declare module 'tree-sitter' {
  class Parser {
    parse(
      input: string | ((offset: number, position: Point) => string),
      oldTree?: Tree,
      options?: { bufferSize?: number; includedRanges?: Range[] }
    ): Tree;
    setLanguage(language: Language): this;
    getLanguage(): Language | null;
  }

  class Tree {
    rootNode: SyntaxNode;
    edit(arg: EditArg): void;
    walk(): TreeCursor;
  }

  class SyntaxNode {
    type: string;
    text: string;
    startPosition: Point;
    endPosition: Point;
    children: SyntaxNode[];
    namedChildren: SyntaxNode[];
    parent: SyntaxNode | null;
    childCount: number;
    namedChildCount: number;

    child(index: number): SyntaxNode | null;
    namedChild(index: number): SyntaxNode | null;
    firstChild: SyntaxNode | null;
    firstNamedChild: SyntaxNode | null;
    lastChild: SyntaxNode | null;
    lastNamedChild: SyntaxNode | null;

    descendantsOfType(types: string | string[], start?: number, end?: number): SyntaxNode[];

    isNamed: boolean;
    isExtra: boolean;
    hasError: boolean;
    isError: boolean;

    toString(): string;
  }

  class TreeCursor {
    currentNode: SyntaxNode;
    startPosition: Point;
    endPosition: Point;
  }

  class Query {
    constructor(source: string, language: Language);
    matches(node: SyntaxNode, options?: QueryOptions): Match[];
    captures(node: SyntaxNode, options?: QueryOptions): Capture[];
  }

  class LookaheadIterator {
    currentType: string;
    next(): boolean;
    reset(): void;
  }

  interface Language {
    nodeTypeInfo?: NodeTypeInfo[];
    nodeSubclasses?: Array<new (tree: Tree) => SyntaxNode>;
  }

  interface NodeTypeInfo {
    type: string;
    named: boolean;
    fields?: Record<string, { multiple: boolean; types: string[] }>;
  }

  interface Point {
    row: number;
    column: number;
  }

  interface EditArg {
    startPosition: Point;
    startIndex: number;
    oldEndPosition: Point;
    oldEndIndex: number;
    newEndPosition: Point;
    newEndIndex: number;
  }

  interface Range {
    startPosition: Point;
    endPosition: Point;
  }

  interface QueryOptions {
    startPosition?: Point;
    endPosition?: Point;
    startIndex?: number;
    endIndex?: number;
    matchLimit?: number;
    maxStartDepth?: number;
  }

  interface Match {
    pattern: number;
    captures: Capture[];
  }

  interface Capture {
    name: string;
    node: SyntaxNode;
  }

  export = Parser;
}

declare module 'tree-sitter-python' {
  import type { Language } from 'tree-sitter';
  const python: Language;
  export default python;
}

declare module 'tree-sitter-typescript' {
  import type { Language } from 'tree-sitter';
  const typescript: Language;
  const tsx: Language;
  const javascript: Language;
  export { typescript, tsx, javascript };
}

declare module 'tree-sitter/node' {
  export * from 'tree-sitter';
  export { default } from 'tree-sitter';
}
