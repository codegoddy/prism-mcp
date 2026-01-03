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
      name: 'extract_code',
      description: 'Extract specific code blocks or elements from source files',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the source file',
          },
          startLine: {
            type: 'number',
            description: 'Starting line number (1-based) for line-based extraction',
          },
          endLine: {
            type: 'number',
            description: 'Ending line number (1-based) for line-based extraction',
          },
          elementName: {
            type: 'string',
            description: 'Name of the function, method, or class to extract',
          },
          elementType: {
            type: 'string',
            enum: ['function', 'method', 'class'],
            description: 'Type of element to extract (when using elementName)',
          },
        },
        required: ['filePath'],
      },
    });

    server.registerTool({
      name: 'analyze_refactor_impact',
      description:
        'Analyze the impact of proposed code changes, especially function signature changes',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file containing the element to refactor',
          },
          elementName: {
            type: 'string',
            description: 'Name of the function, method, or class to analyze',
          },
          elementType: {
            type: 'string',
            enum: ['function', 'method', 'class'],
            description: 'Type of element to analyze',
          },
          proposedChanges: {
            type: 'object',
            description: 'Description of the proposed changes',
            properties: {
              parameterChanges: {
                type: 'array',
                description: 'Changes to function parameters',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Parameter name',
                    },
                    oldType: {
                      type: 'string',
                      description: 'Original parameter type',
                    },
                    newType: {
                      type: 'string',
                      description: 'New parameter type',
                    },
                    removed: {
                      type: 'boolean',
                      description: 'Whether parameter is being removed',
                    },
                    added: {
                      type: 'boolean',
                      description: 'Whether parameter is being added',
                    },
                  },
                },
              },
              returnTypeChange: {
                type: 'object',
                description: 'Change to return type',
                properties: {
                  oldType: {
                    type: 'string',
                    description: 'Original return type',
                  },
                  newType: {
                    type: 'string',
                    description: 'New return type',
                  },
                },
              },
              rename: {
                type: 'object',
                description: 'Function/class rename',
                properties: {
                  oldName: {
                    type: 'string',
                    description: 'Original name',
                  },
                  newName: {
                    type: 'string',
                    description: 'New name',
                  },
                },
              },
            },
          },
        },
        required: ['filePath', 'elementName'],
      },
    });

    server.registerTool({
      name: 'analyze_flow',
      description: 'Analyze code flow and call graphs for understanding application topology',
      inputSchema: {
        type: 'object',
        properties: {
          entryPoint: {
            type: 'string',
            description: 'Name of the function/class to start flow analysis from',
          },
          filePath: {
            type: 'string',
            description: 'Path to a specific file to analyze',
          },
          directoryPath: {
            type: 'string',
            description: 'Path to a directory to analyze all files in',
          },
          maxDepth: {
            type: 'number',
            description: 'Maximum depth for flow analysis (default: 5)',
            default: 5,
          },
        },
      },
    });

    server.registerTool({
      name: 'analyze_type_flow',
      description: 'Analyze TypeScript type flow and resolve type origins',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the TypeScript file',
          },
          variableName: {
            type: 'string',
            description: 'Name of the variable to analyze',
          },
          lineNumber: {
            type: 'number',
            description: 'Line number of the variable (1-based)',
          },
          columnNumber: {
            type: 'number',
            description: 'Column number of the variable (0-based)',
          },
        },
        required: ['filePath'],
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

    server.registerTool({
      name: 'find_dead_code',
      description:
        'Detect unused functions, methods, classes, and variables that can be safely deleted',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to a single source file to analyze',
          },
          directoryPath: {
            type: 'string',
            description: 'Path to a directory to analyze all files recursively',
          },
          includeExported: {
            type: 'boolean',
            description: 'Whether to include exported symbols in the analysis (default: false)',
          },
        },
      },
    });

    server.registerTool({
      name: 'track_variable',
      description: 'Find assignments, reads, and declarations of a variable',
      inputSchema: {
        type: 'object',
        properties: {
          variableName: {
            type: 'string',
            description: 'Name of the variable to track',
          },
          filePath: {
            type: 'string',
            description: 'Path to source file to analyze',
          },
          directoryPath: {
            type: 'string',
            description: 'Path to directory to analyze',
          },
        },
        required: ['variableName'],
      },
    });

    server.registerTool({
      name: 'get_control_flow',
      description: 'Generate a Control Flow Graph (CFG) for a function',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to source file',
          },
          functionName: {
            type: 'string',
            description: 'Name of the function to analyze',
          },
        },
        required: ['filePath', 'functionName'],
      },
    });

    server.registerTool({
      name: 'get_public_surface',
      description: 'Extract exported functions, classes, and variables from a module',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to source file to analyze',
          },
        },
        required: ['filePath'],
      },
    });

    server.registerTool({
      name: 'get_imports',
      description: 'List all static and dynamic imports in a file',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to source file to analyze',
          },
        },
        required: ['filePath'],
      },
    });

    server.registerTool({
      name: 'find_patterns',
      description: 'Search for code patterns using Tree-sitter S-expression queries',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to source file to analyze',
          },
          query: {
            type: 'string',
            description: 'Tree-sitter S-expression query to execute',
          },
        },
        required: ['filePath', 'query'],
      },
    });

    server.registerTool({
      name: 'detect_features',
      description: 'Detect feature flags and environment variable checks',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to source file to analyze',
          },
          patterns: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Patterns to search for (e.g. ["process.env", "featureFlags"]). Default: ["process.env"]',
          },
        },
        required: ['filePath'],
      },
    });

    server.registerTool({
      name: 'map_tests',
      description: 'Map source code to corresponding tests',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to source file to analyze',
          },
        },
        required: ['filePath'],
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
