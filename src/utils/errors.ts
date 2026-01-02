export enum ErrorCode {
  PARSER_ERROR = "PARSER_ERROR",
  TOOL_NOT_FOUND = "TOOL_NOT_FOUND",
  INVALID_ARGUMENTS = "INVALID_ARGUMENTS",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  CACHE_ERROR = "CACHE_ERROR",
  GRAPH_ERROR = "GRAPH_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR"
}

export class PrismError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message);
    this.name = "PrismError";
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack
    };
  }
}

export class ParserError extends PrismError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.PARSER_ERROR, details);
    this.name = "ParserError";
  }
}

export class ToolNotFoundError extends PrismError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, ErrorCode.TOOL_NOT_FOUND, { toolName });
    this.name = "ToolNotFoundError";
  }
}

export class InvalidArgumentsError extends PrismError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.INVALID_ARGUMENTS, details);
    this.name = "InvalidArgumentsError";
  }
}

export class FileNotFoundError extends PrismError {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`, ErrorCode.FILE_NOT_FOUND, { filePath });
    this.name = "FileNotFoundError";
  }
}

export class CacheError extends PrismError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.CACHE_ERROR, details);
    this.name = "CacheError";
  }
}

export class GraphError extends PrismError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.GRAPH_ERROR, details);
    this.name = "GraphError";
  }
}

export function isPrismError(error: unknown): error is PrismError {
  return error instanceof PrismError;
}
