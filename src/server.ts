import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { ToolDefinition, ToolResponse, CallToolRequest } from './types/mcp.js';
import { logger } from './utils/logger.js';
import { ToolNotFoundError, isPrismError } from './utils/errors.js';
import { getConfig } from './utils/config.js';

const ToolsListRequestSchema = z.object({
  method: z.literal('tools/list'),
  params: z.record(z.unknown()).optional(),
});

const ToolsCallRequestSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  }),
});

export class MCPServer {
  private server: Server;
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    const config = getConfig();
    logger.setLevel(config.getLogLevel());
    logger.setOutput(config.getLogOutput());

    const serverConfig = config.get('server');
    this.server = new Server(serverConfig, {
      capabilities: {
        tools: {},
      },
    });

    this.setupToolHandler();
  }

  private setupToolHandler(): void {
    this.server.setRequestHandler(ToolsListRequestSchema, async () => ({
      tools: Array.from(this.tools.values()),
    }));

    this.server.setRequestHandler(ToolsCallRequestSchema, async (request) => {
      const { name } = request.params;
      if (!name) {
        return {
          content: [{ type: 'text', text: 'Invalid request: tool name is required' }],
          isError: true,
        };
      }
      return this.handleToolCall(request) as Promise<{
        content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      }>;
    });
  }

  private async handleToolCall(request: CallToolRequest): Promise<ToolResponse> {
    logger.debug('Tool call received', { tool: request.params.name });

    const tool = this.tools.get(request.params.name);
    if (!tool) {
      const error = new ToolNotFoundError(request.params.name);
      logger.warn('Tool not found', { tool: request.params.name });
      return {
        content: [{ type: 'text', text: error.message }],
        isError: true,
      };
    }

    try {
      const result = await this.executeTool(request.params.name, request.params.arguments || {});
      logger.info('Tool executed successfully', { tool: request.params.name });
      return result;
    } catch (error: any) {
      logger.error('Tool execution failed', error as Error, { tool: request.params.name });

      if (isPrismError(error)) {
        return {
          content: [{ type: 'text', text: error.message }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error executing tool ${request.params.name}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResponse> {
    const { default: toolHandler } = await import(`./tools/${name}.js`);
    return toolHandler(args);
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    logger.info('Tool registered', { name: tool.name, description: tool.description });
  }

  async start(): Promise<void> {
    const config = getConfig();
    logger.info('Starting Prism MCP Server', {
      name: config.get('server').name,
      version: config.get('server').version,
    });

    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info('Prism MCP Server running on stdio');
    } catch (error: any) {
      logger.error('Failed to start server', error as Error);
      throw error;
    }
  }
}
