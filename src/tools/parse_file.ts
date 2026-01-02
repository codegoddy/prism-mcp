import type { ToolResponse } from "../types/mcp.js";
import { ParserFactory } from "../parsers/factory.js";
import { ParserError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export default async function parseFile(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath } = args;

  if (typeof filePath !== "string") {
    return {
      content: [
        {
          type: "text",
          text: "Invalid arguments: filePath must be a string"
        }
      ],
      isError: true
    };
  }

  try {
    logger.info("Parsing file", { filePath });

    const parser = ParserFactory.getParserForFile(filePath);
    const result = await parser.parseFile(filePath);

    const summary = {
      filePath,
      language: parser.getLanguage(),
      rootType: result.tree.type,
      nodeCount: countNodes(result.tree),
      parseTime: `${result.parseTime.toFixed(2)}ms`,
      errors: result.errors.length
    };

    const response = {
      summary,
      tree: simplifyAST(result.tree)
    };

    logger.info("File parsed successfully", {
      filePath,
      nodeCount: summary.nodeCount,
      parseTime: summary.parseTime
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  } catch (error) {
    logger.error("Failed to parse file", error as Error, { filePath });

    if (error instanceof ParserError) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}

function countNodes(node: any): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

function simplifyAST(node: any, maxDepth = 3, currentDepth = 0): any {
  if (currentDepth >= maxDepth) {
    return {
      type: node.type,
      text: node.text.length > 50 ? `${node.text.substring(0, 50)}...` : node.text,
      childCount: node.children.length
    };
  }

  return {
    type: node.type,
    startPosition: node.startPosition,
    endPosition: node.endPosition,
    text: node.text.length > 50 ? `${node.text.substring(0, 50)}...` : node.text,
    children: node.children.map((child: any) => simplifyAST(child, maxDepth, currentDepth + 1))
  };
}
