import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

function findAddon() {
  const possiblePaths = [
    // When running from build/graph/native/index.js
    '../../Release/graph.node',
    // When running from src/graph/native/index.ts (dev/test)
    '../../../build/Release/graph.node'
  ];

  for (const p of possiblePaths) {
    try {
      // Resolve relative to this file
      const resolved = require.resolve(p);
      return require(resolved);
    } catch (e) {
      // Continue
    }
  }
  
  // Fallback: try to find it via absolute path if we can determine root
  // This is a last resort
  try {
     return require('../../../build/Release/graph.node');
  } catch (e) {
     throw new Error(`Could not find graph.node addon. Searched in: ${possiblePaths.join(', ')}`);
  }
}

const addon = findAddon();

export interface Symbol {
  id: string;
  name: string;
  type: string;
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
  type: string;
  filePath: string;
  line: number;
  column: number;
}

export interface ImportEntry {
  source: string;
  imported: string[];
  isTypeOnly: boolean;
}

export interface FileData {
  path: string;
  symbols: Symbol[];
  imports: ImportEntry[];
}

export interface GraphStats {
  totalSymbols: number;
  totalReferences: number;
  totalFiles: number;
  memoryUsageBytes: number;
}

export class ReferenceGraph {
  private _addonInstance: any;

  constructor() {
    this._addonInstance = new addon.ReferenceGraph();
  }

  addSymbol(symbol: Symbol): void {
    this._addonInstance.addSymbol(symbol);
  }

  addSymbols(symbols: Symbol[]): void {
    this._addonInstance.addSymbols(symbols);
  }

  hasSymbol(symbolId: string): boolean {
    return this._addonInstance.hasSymbol(symbolId);
  }

  getSymbol(symbolId: string): Symbol | null {
    return this._addonInstance.getSymbol(symbolId);
  }

  getAllSymbols(): Symbol[] {
    return this._addonInstance.getAllSymbols();
  }

  addReference(reference: Reference): void {
    this._addonInstance.addReference(reference);
  }

  addReferences(references: Reference[]): void {
    this._addonInstance.addReferences(references);
  }

  removeReferences(symbolId: string): void {
    this._addonInstance.removeReferences(symbolId);
  }

  findCallers(symbolId: string): Reference[] {
    return this._addonInstance.findCallers(symbolId);
  }

  findCallees(symbolId: string): Reference[] {
    return this._addonInstance.findCallees(symbolId);
  }

  addFile(file: FileData): void {
    this._addonInstance.addFile(file);
  }

  updateFile(filePath: string, file: FileData): void {
    this._addonInstance.updateFile(filePath, file);
  }

  removeFile(filePath: string): void {
    this._addonInstance.removeFile(filePath);
  }

  hasFile(filePath: string): boolean {
    return this._addonInstance.hasFile(filePath);
  }

  isSymbolUsed(symbolId: string): boolean {
    return this._addonInstance.isSymbolUsed(symbolId);
  }

  findUnusedSymbols(): Symbol[] {
    return this._addonInstance.findUnusedSymbols();
  }

  findSymbolsByName(name: string): Symbol[] {
    return this._addonInstance.findSymbolsByName(name);
  }

  findSymbolsByFile(filePath: string): Symbol[] {
    return this._addonInstance.findSymbolsByFile(filePath);
  }

  findExportedSymbols(): Symbol[] {
    return this._addonInstance.findExportedSymbols();
  }

  getStats(): GraphStats {
    return this._addonInstance.getStats();
  }

  size(): number {
    return this._addonInstance.size();
  }

  clear(): void {
    this._addonInstance.clear();
  }
}
