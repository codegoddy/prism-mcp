import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { logger } from '../utils/logger.js';

interface PatternMatch {
  range: {
      start: { line: number, column: number };
      end: { line: number, column: number };
  };
  captures: Record<string, {
      text: string;
      range: {
          start: { line: number, column: number };
          end: { line: number, column: number };
      };
      type: string;
  }>;
}

export default async function findPatterns(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath, query } = args;

  if (typeof filePath !== 'string' || typeof query !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: filePath and query must be provided',
        },
      ],
      isError: true,
    };
  }

  try {
    logger.info('Searching patterns', { filePath, query });

    const parser = ParserFactory.getParserForFile(filePath);

    // Access the underlying native parser instance
    // Note: 'parser' is protected in BaseParser, so we cast to any to access it.
    // This is necessary because we need the raw Tree-sitter objects for querying.
    const parserInstance = parser as any;
    
    if (!parserInstance.parser || !parserInstance.parser.getLanguage) {
        throw new Error('Parser does not expose underlying Tree-sitter instance required for pattern matching');
    }
    
    // In tree-sitter ^0.21.0, we use the Query constructor from the module
    // We can access the Parser class constructor from the instance
    const ParserClass = parserInstance.parser.constructor;
    const language = parserInstance.parser.getLanguage();
    
    if (!language) {
         throw new Error('Could not retrieve language from parser');
    }

    // Use Query constructor: new Query(language, source)
    // If Query is not on ParserClass (it might be exported separately), we might need to import it.
    // But usually Parser.Query exists. 
    // If not, we try explicit import if this fails. But let's try this first.
    let treeSitterQuery;
    if (ParserClass.Query) {
        treeSitterQuery = new ParserClass.Query(language, query);
    } else {
        // Fallback or error if Query is elsewhere (e.g. tree-sitter default export)
        // Since we don't import tree-sitter here to avoid dual import issues, we hope it's attached.
        // Actually, looking at tree-sitter 0.21 docs, Query is a named export or Parser.Query.
        // If it fails, we might need to `import Parser from 'tree-sitter';` at top.
        // But let's try to assume it's attached to the class constructor usually.
        throw new Error('Tree-sitter Query constructor not found on Parser class');
    }
    
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    const rawTree = parserInstance.parser.parse(content);
    
    const matches = treeSitterQuery.matches(rawTree.rootNode);
    
    const results: PatternMatch[] = matches.map((match: any) => {
        const captures: Record<string, any> = {};
        for (const capture of match.captures) {
            captures[capture.name] = {
                text: capture.node.text,
                range: {
                    start: { line: capture.node.startPosition.row + 1, column: capture.node.startPosition.column + 1 },
                    end: { line: capture.node.endPosition.row + 1, column: capture.node.endPosition.column + 1 }
                },
                type: capture.node.type
            };
        }
        
        let start = { line: Infinity, column: Infinity };
        let end = { line: 0, column: 0 };
        
        for (const cap of match.captures) {
             const s = cap.node.startPosition; 
             const e = cap.node.endPosition;
             
             if (s.row < start.line || (s.row === start.line && s.column < start.column)) {
                 start = { line: s.row, column: s.column };
             }
             if (e.row > end.line || (e.row === end.line && e.column > end.column)) {
                 end = { line: e.row, column: e.column };
             }
        }
        
        return {
            range: {
                start: { line: start.line + 1, column: start.column + 1 },
                end: { line: end.line + 1, column: end.column + 1 }
            },
            captures
        };
    });
    
    // Clean up
    if (rawTree.delete) rawTree.delete();
    if (treeSitterQuery.delete) treeSitterQuery.delete();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to find patterns', error as Error);
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
