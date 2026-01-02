export interface ASTNode {
  type: string;
  text: string;
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
