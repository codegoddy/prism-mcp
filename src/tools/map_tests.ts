import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { logger } from '../utils/logger.js';
import getPublicSurface from './get_public_surface.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TestMapping {
    sourceFile: string;
    testFiles: string[];
    coverage: Record<string, {
        testFile: string;
        testName?: string;
        line: number;
    }[]>;
}

export default async function mapTests(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath } = args;

  if (typeof filePath !== 'string') {
    return {
      content: [{ type: 'text', text: 'Invalid arguments: filePath is required' }],
      isError: true,
    };
  }

  try {
    logger.info('Mapping tests for file', { filePath });
    
    // 1. Get exported symbols
    
    const publicSurfaceResult = await getPublicSurface({ filePath });
    if (publicSurfaceResult.isError || !publicSurfaceResult.content || !publicSurfaceResult.content[0]) {
         throw new Error(`Failed to get public surface: ${publicSurfaceResult.content?.[0]?.text || 'Unknown error'}`);
    }
    
    const exports = JSON.parse(publicSurfaceResult.content[0].text);
    
    // Debug exports
    logger.info('Found exports', { exports });
    
    const mapping: TestMapping = {
        sourceFile: filePath,
        testFiles: [],
        coverage: {}
    };
    
    const projectRoot = process.cwd();

    // 2. For each export, find usage in test files
    for (const exp of exports) {
        // Skip implicit exports if any (usually we get named exports)
        if (!exp.name) continue;
        
        mapping.coverage[exp.name] = [];
        
        try {
            const command = `grep -r -l "${exp.name}" "${projectRoot}" --include="*test.ts" --include="*spec.ts"`;
            const { stdout } = await execAsync(command).catch(() => ({ stdout: '' }));
            
            const files = stdout.split('\n').filter(f => f.trim().length > 0);
            
            for (const testFile of files) {
                if (testFile === filePath) continue; 
                
                if (!mapping.testFiles.includes(testFile)) {
                    mapping.testFiles.push(testFile);
                }
                
                // Now parse test file to confirm usage and finding context (test name)
                const parser = ParserFactory.getParserForFile(testFile);
                const parseResult = await parser.parseFile(testFile);
                const tree = parseResult.tree;
                
                // Helper to find parent test block
                const findTestBlock = (node: any): string | undefined => {
                    let curr = node.parent;
                    while (curr) {
                        if (curr.type === 'call_expression') {
                             // Check function name: it, test, describe
                             const funcNode = curr.namedChildren[0]; // function part
                             if (funcNode && (funcNode.text === 'it' || funcNode.text === 'test')) {
                                  // First arg is usually the description string
                                  const args = curr.namedChildren[1]; // arguments node
                                  if (args && args.namedChildren && args.namedChildren.length > 0) {
                                      const descNode = args.namedChildren[0];
                                      // text might be quoted
                                      return descNode.text.replace(/^['"`](.*)['"`]$/, '$1');
                                  }
                             }
                        }
                        curr = curr.parent;
                    }
                    return undefined;
                };

                const traverse = (node: any) => {
                     if (node.text === exp.name && node.type === 'identifier') {
                         const testName = findTestBlock(node);
                         if (testName) {
                             mapping.coverage[exp.name].push({
                                 testFile,
                                 testName,
                                 line: node.startPosition.row + 1
                             });
                         }
                     }
                     
                     if (node.namedChildren) {
                         for (const child of node.namedChildren) {
                             traverse(child);
                         }
                     }
                };
                
                traverse(tree);
            }
            
        } catch (err) {
            logger.warn(`Error searching for tests for ${exp.name}`, { error: err });
        }
    }
    
    // Deduplicate coverage entries
    for (const key in mapping.coverage) {
        const unique = new Set();
        mapping.coverage[key] = mapping.coverage[key].filter(item => {
             const k = `${item.testFile}:${item.line}`;
             if (unique.has(k)) return false;
             unique.add(k);
             return true;
        });
    }

    // Debug final mapping
    logger.info('Mapped tests', { coverage: mapping.coverage });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(mapping, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to map tests', error as Error);
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
