export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface LoggerConfig {
  level: LogLevel;
  useColors: boolean;
  includeTimestamp: boolean;
  output: "stderr" | "stdout";
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  useColors: true,
  includeTimestamp: true,
  output: "stderr"
};

const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.SILENT]: "SILENT"
};

const COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "\x1b[36m",
  [LogLevel.INFO]: "\x1b[32m",
  [LogLevel.WARN]: "\x1b[33m",
  [LogLevel.ERROR]: "\x1b[31m",
  [LogLevel.SILENT]: "\x1b[0m"
};

const RESET_COLOR = "\x1b[0m";

export class Logger {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private bufferSize = 100;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  private formatMessage(entry: LogEntry): string {
    const levelName = LEVEL_NAMES[entry.level];
    const timestamp = entry.timestamp;
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
    const errorStr = entry.error ? ` ${entry.error.message}` : "";
    return `[${timestamp}] [${levelName}] ${entry.message}${contextStr}${errorStr}`;
  }

  private write(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    let formatted = this.formatMessage(entry);

    if (this.config.useColors) {
      const color = COLORS[entry.level];
      formatted = `${color}${formatted}${RESET_COLOR}`;
    }

    if (this.config.output === "stderr") {
      console.error(formatted);
    } else {
      console.log(formatted);
    }

    this.buffer.push(entry);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }
  }

  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error
    };
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write(this.createEntry(LogLevel.DEBUG, message, context));
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write(this.createEntry(LogLevel.INFO, message, context));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write(this.createEntry(LogLevel.WARN, message, context));
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.write(this.createEntry(LogLevel.ERROR, message, context, error));
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  setOutput(output: "stderr" | "stdout"): void {
    this.config.output = output;
  }

  getBuffer(): LogEntry[] {
    return [...this.buffer];
  }

  clearBuffer(): void {
    this.buffer = [];
  }
}

const globalLogger = new Logger();

export { globalLogger as logger };
