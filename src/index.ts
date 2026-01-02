import { MCPServer } from "./server.js";
import { initializeConfig } from "./utils/config.js";
import { logger } from "./utils/logger.js";
import { isPrismError } from "./utils/errors.js";

async function main() {
  try {
    initializeConfig();

    const server = new MCPServer();

    server.registerTool({
      name: "health",
      description: "Check server health",
      inputSchema: {
        type: "object",
        properties: {}
      }
    });

    server.registerTool({
      name: "parse_file",
      description: "Parse a source code file and return its AST",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Path to the source file to parse"
          }
        },
        required: ["filePath"]
      }
    });

    await server.start();
  } catch (error) {
    logger.error("Fatal error during startup", error as Error);

    if (isPrismError(error)) {
      process.exit(1);
    }

    console.error("Fatal error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason as Error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
  process.exit(1);
});

main();
