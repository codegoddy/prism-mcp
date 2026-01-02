import { MCPServer } from './server.js';
import { initializeConfig } from './utils/config.js';
import { logger } from './utils/logger.js';
import { isPrismError } from './utils/errors.js';

async function main() {
  try {
    initializeConfig();

    const server = new MCPServer();

    server.registerTool({
      name: 'health',
      description: 'Check server health',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    server.registerTool({
      name: 'parse_file',
      description: 'Parse a source code file and return its AST',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to source file to parse',
          },
        },
        required: ['filePath'],
      },
    });

    server.registerTool({
      name: 'get_skeleton',
      description: 'Extract skeleton structure from a source code file',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to source file to extract skeleton from',
          },
        },
        required: ['filePath'],
      },
    });

    server.registerTool({
      name: 'find_callers',
      description: 'Find all callers of a function or method',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file containing the target symbol',
          },
          functionName: {
            type: 'string',
            description: 'Name of the function to find callers for',
          },
          methodName: {
            type: 'string',
            description:
              'Name of the method to find callers for (use this instead of functionName for class methods)',
          },
        },
        required: ['filePath'],
      },
    });

    server.registerTool({
      name: 'semantic_search',
      description: 'Search for code elements based on semantic criteria',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the source file to search',
          },
          query: {
            type: 'object',
            description: 'Search criteria',
            properties: {
              nodeType: {
                type: 'string',
                enum: ['function', 'class', 'variable'],
                description: 'Type of node to search for',
              },
              namePattern: {
                type: 'string',
                description: 'Regex pattern for name matching',
              },
              returnType: {
                type: 'string',
                description: 'Return type to match (for functions/methods)',
              },
              parameters: {
                type: 'array',
                description: 'Parameters to match',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Parameter name',
                    },
                    type: {
                      type: 'string',
                      description: 'Parameter type',
                    },
                  },
                },
              },
              modifiers: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Modifiers to match (e.g., async, static, export, abstract)',
              },
            },
          },
        },
        required: ['filePath', 'query'],
      },
    });

    server.registerTool({
      name: 'get_dependencies',
      description: 'Analyze module dependencies, detect cycles and unused imports',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to a single source file to analyze',
          },
          directoryPath: {
            type: 'string',
            description: 'Path to a directory to analyze all files in',
          },
        },
      },
    });

    server.registerTool({
      name: 'suggest_refactors',
      description: 'Suggests refactoring opportunities, like extracting duplicate code.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to a single source file to analyze.',
          },
          directoryPath: {
            type: 'string',
            description: 'Path to a directory to analyze for refactors.',
          },
        },
      },
    });

    await server.start();
  } catch (error) {
    logger.error('Fatal error during startup', error as Error);

    if (isPrismError(error)) {
      process.exit(1);
    }

    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason as Error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

main();
