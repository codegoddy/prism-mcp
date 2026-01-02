import type { ToolResponse } from "../types/mcp.js";

export default async function health(args: Record<string, unknown>): Promise<ToolResponse> {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            status: "ok",
            version: "0.1.0",
            timestamp: new Date().toISOString()
          },
          null,
          2
        )
      }
    ]
  };
}
