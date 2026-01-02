export interface Symbol {
  id: string;
  name: string;
  type: 'function' | 'method' | 'variable' | 'class' | 'parameter';
  filePath: string;
  line: number;
  column: number;
  className?: string;
  isExported?: boolean;
  isStatic?: boolean;
}

export interface Reference {
  id: string;
  fromSymbolId: string;
  toSymbolId: string;
  type: 'direct' | 'method' | 'callback' | 'indirect';
  filePath: string;
  line: number;
  column: number;
}

export interface FileData {
  path: string;
  symbols: Symbol[];
  imports: ImportEntry[];
}

export interface ImportEntry {
  source: string;
  imported: string[];
  isTypeOnly?: boolean;
}

export interface GraphStats {
  totalSymbols: number;
  totalReferences: number;
  totalFiles: number;
  memoryUsageBytes: number;
}
