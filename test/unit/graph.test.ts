import { describe, it, expect, beforeEach } from 'vitest';
import { ReferenceGraph, Symbol, Reference, FileData } from '../../src/graph/native/index';

describe('ReferenceGraph (Native)', () => {
  let graph: ReferenceGraph;

  beforeEach(() => {
    graph = new ReferenceGraph();
  });

  it('should manage symbols', () => {
    const symbol: Symbol = {
      id: 's1',
      name: 'testFunc',
      type: 'function',
      filePath: '/src/test.ts',
      line: 10,
      column: 1,
      isExported: true
    };

    graph.addSymbol(symbol);
    expect(graph.hasSymbol('s1')).toBe(true);
    
    const retrieved = graph.getSymbol('s1');
    expect(retrieved).toMatchObject(symbol);
    
    expect(graph.getAllSymbols()).toHaveLength(1);
  });

  it('should manage references', () => {
    const s1: Symbol = { id: 's1', name: 'caller', type: 'function', filePath: 'a.ts', line: 1, column: 1 };
    const s2: Symbol = { id: 's2', name: 'callee', type: 'function', filePath: 'b.ts', line: 1, column: 1 };
    
    graph.addSymbols([s1, s2]);

    const ref: Reference = {
      id: 'r1',
      fromSymbolId: 's1',
      toSymbolId: 's2',
      type: 'direct',
      filePath: 'a.ts',
      line: 2,
      column: 5
    };

    graph.addReference(ref);
    
    const callees = graph.findCallees('s1');
    expect(callees).toHaveLength(1);
    expect(callees[0]).toEqual(ref);

    const callers = graph.findCallers('s2');
    expect(callers).toHaveLength(1);
    expect(callers[0]).toEqual(ref);
  });

  it('should handle file operations', () => {
    const file: FileData = {
      path: '/src/a.ts',
      symbols: [
        { id: 's1', name: 'A', type: 'class', filePath: '/src/a.ts', line: 1, column: 0 }
      ],
      imports: []
    };

    graph.addFile(file);
    expect(graph.hasFile('/src/a.ts')).toBe(true);
    expect(graph.hasSymbol('s1')).toBe(true);

    // Update file
    const updatedFile: FileData = {
      path: '/src/a.ts',
      symbols: [
        { id: 's1', name: 'A', type: 'class', filePath: '/src/a.ts', line: 1, column: 0 },
        { id: 's2', name: 'B', type: 'class', filePath: '/src/a.ts', line: 5, column: 0 }
      ],
      imports: []
    };
    
    graph.updateFile('/src/a.ts', updatedFile);
    expect(graph.hasSymbol('s2')).toBe(true);
    
    // Remove file
    graph.removeFile('/src/a.ts');
    expect(graph.hasFile('/src/a.ts')).toBe(false);
    expect(graph.hasSymbol('s1')).toBe(false);
    expect(graph.hasSymbol('s2')).toBe(false);
  });

  it('should track unused symbols', () => {
      const s1: Symbol = { id: 's1', name: 'used', type: 'function', filePath: 'a.ts', line: 1, column: 1 };
      const s2: Symbol = { id: 's2', name: 'unused', type: 'function', filePath: 'a.ts', line: 5, column: 1 };
      const s3: Symbol = { id: 's3', name: 'caller', type: 'function', filePath: 'b.ts', line: 1, column: 1 };
      
      graph.addSymbols([s1, s2, s3]);
      
      const ref: Reference = {
          id: 'r1',
          fromSymbolId: 's3',
          toSymbolId: 's1',
          type: 'direct',
          filePath: 'b.ts',
          line: 2,
          column: 1
      };
      
      graph.addReference(ref);
      
      expect(graph.isSymbolUsed('s1')).toBe(true);
      expect(graph.isSymbolUsed('s2')).toBe(false);
      
      const unused = graph.findUnusedSymbols();
      // s2 is unused. s3 is unused (it calls s1, but no one calls s3).
      expect(unused.map(s => s.id)).toContain('s2');
      expect(unused.map(s => s.id)).toContain('s3');
      expect(unused.map(s => s.id)).not.toContain('s1');
  });
});
