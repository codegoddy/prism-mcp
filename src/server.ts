import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ToolDefinition, ToolResponse, CallToolRequest } from "../types/mcp.js";
import { logger } from "../utils/logger.js";
import { ToolNotFoundError, isPrismError } from "../utils/errors.js";
import { getConfig } from "../utils/config.js";

export class MCPServer {
  private server: Server;
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    const config = getConfig();
    logger.setLevel(config.getLogLevel());
    logger.setOutput(config.getLogOutput());

    const serverConfig = config.get("server");
    this.server = new Server(serverConfig, {
      capabilities: {
        tools: {}
      }
    });

    this.setupToolHandler();
  }

  private setupToolHandler(): void {
    this.server.setRequestHandler(
      { method: "tools/list" },
      async () => ({
        tools: Array.from(this.tools.values())
      })
    );

    this.server.setRequestHandler(
      { method: "tools/call" },
      async (request: CallToolRequest) => this.handleToolCall(request)
    );
  }

  private async handleToolCall(request: CallToolRequest): Promise<ToolResponse> {
    logger.debug("Tool call received", { tool: request.name });

    const tool = this.tools.get(request.name);
    if (!tool) {
      const error = new ToolNotFoundError(request.name);
      logger.warn("Tool not found", { tool: request.name });
      return {
        content: [{ type: "text", text: error.message }],
        isError: true
      };
    }

    try {
      const result = await this.executeTool(request.name, request.arguments);
      logger.info("Tool executed successfully", { tool: request.name });
      return result;
    } catch (error) {
      logger.error("Tool execution failed", error as Error, { tool: request.name });

      if (isPrismError(error)) {
        return {
          content: [{ type: "text", text: error.message }],
          isError: true
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Error executing tool ${request.name}: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    const { default: toolHandler } = await import(`../tools/${name}.js`);
    return toolHandler(args);
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    logger.info("Tool registered", { name: tool.name, description: tool.description });
  }

  async start(): Promise<void> {
    const config = getConfig();
    logger.info("Starting Prism MCP Server", {
      name: config.get("server").name,
      version: config.get("server").version
    });

    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info("Prism MCP Server running on stdio");
    } catch (error) {
      logger.error("Failed to start server", error as Error);
      throw error;
    }
  }
}
