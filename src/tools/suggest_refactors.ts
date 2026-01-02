import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { logger } from '../utils/logger.js';
import type { ASTNode, RefactorSuggestion } from '../types/ast.js';
import { findSourceFiles } from './find_callers.js';
import path from 'path';

export default async function suggestRefactors(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath, directoryPath } = args;

  if (typeof filePath !== 'string' && typeof directoryPath !== 'string') {
    return {
      content: [{ type: 'text', text: 'Invalid arguments: either filePath or directoryPath must be provided' }],
      isError: true,
    };
  }
  
  const rootPath = (directoryPath as string) || path.dirname(filePath as string);
  const files = directoryPath ? findSourceFiles(rootPath) : [filePath as string];
  
  const suggestions: RefactorSuggestion[] = [];

  // Find duplicate code blocks
  const duplicates = await findDuplicateCode(files);
  for (const dup of duplicates) {
    suggestions.push({
      type: 'extract_function',
      message: `Found ${dup.locations.length} instances of a duplicated code block. Consider extracting it to a function.`,
      locations: dup.locations
    });
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(suggestions, null, 2) }],
  };
}

async function findDuplicateCode(files: string[]) {
  const blockHashes = new Map<string, { filePath: string; node: ASTNode }[]>();

  for (const file of files) {
    try {
      const parser = ParserFactory.getParserForFile(file);
      const { tree } = await parser.parseFile(file);

      const traverse = (node: ASTNode) => {
        if (node.type === 'statement_block' || node.type === 'block') {
          if (node.parent?.type === 'function_declaration' || node.parent?.type === 'method_definition' || node.parent?.type === 'function_definition') {
            let hash = '';
            for (const stmt of node.namedChildren) {
              hash += stmt.type + ';';
            }
            
            if (hash.length > 20) {
              if (!blockHashes.has(hash)) {
                blockHashes.set(hash, []);
              }
              blockHashes.get(hash)?.push({ filePath: file, node });
            }
          }
        }
        for (const child of node.children) {
          traverse(child);
        }
      };
      
      traverse(tree);
    } catch (e) {
      logger.warn(`Could not parse ${file} for refactor suggestions`, e as Error);
    }
  }

  const duplicates = [];
  for (const [hash, occurrences] of blockHashes.entries()) {
    if (occurrences.length > 1) {
      duplicates.push({
        hash,
        locations: occurrences.map(o => ({
          filePath: o.filePath,
          startPosition: o.node.startPosition,
          endPosition: o.node.endPosition
        }))
      });
    }
  }
  
  return duplicates;
}
