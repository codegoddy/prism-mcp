import { readFileSync } from "fs";
import { existsSync } from "fs";
import { logger, LogLevel } from "./logger.js";

export interface CacheConfig {
  enabled: boolean;
  maxSize: number;
  ttl: number;
}

export interface GraphConfig {
  enableCpp: boolean;
  maxNodes: number;
  enableIncremental: boolean;
}

export interface ParserConfig {
  maxFileSize: number;
  timeout: number;
  enableTypeChecking: boolean;
}

export interface PrismConfig {
  server: {
    name: string;
    version: string;
  };
  cache: CacheConfig;
  graph: GraphConfig;
  parser: ParserConfig;
  logging: {
    level: LogLevel;
    output: "stderr" | "stdout";
  };
  paths: {
    grammars: string;
    cacheDir: string;
  };
}

const DEFAULT_CONFIG: PrismConfig = {
  server: {
    name: "prism-mcp",
    version: "0.1.0"
  },
  cache: {
    enabled: true,
    maxSize: 1000,
    ttl: 3600000
  },
  graph: {
    enableCpp: true,
    maxNodes: 1000000,
    enableIncremental: true
  },
  parser: {
    maxFileSize: 10485760,
    timeout: 5000,
    enableTypeChecking: false
  },
  logging: {
    level: LogLevel.INFO,
    output: "stderr"
  },
  paths: {
    grammars: "./grammars",
    cacheDir: "./build/.cache"
  }
};

export class ConfigManager {
  private config: PrismConfig;
  private configPath: string;

  constructor(configPath: string = "./prism.config.json") {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  private loadConfig(): PrismConfig {
    if (existsSync(this.configPath)) {
      try {
        const configData = readFileSync(this.configPath, "utf-8");
        const userConfig = JSON.parse(configData);
        const merged = this.deepMerge(DEFAULT_CONFIG, userConfig);
        logger.info("Configuration loaded from file", { path: this.configPath });
        return merged;
      } catch (error) {
        logger.error("Failed to load config file, using defaults", error as Error);
        return { ...DEFAULT_CONFIG };
      }
    }

    logger.info("No config file found, using defaults", { path: this.configPath });
    return { ...DEFAULT_CONFIG };
  }

  private deepMerge<T>(target: T, source: Partial<T>): T {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key as keyof T])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key as keyof T] });
          } else {
            (output as Record<string, unknown>)[key] = this.deepMerge(
              (target as Record<string, unknown>)[key],
              source[key as keyof T] as Partial<unknown>
            );
          }
        } else {
          Object.assign(output, { [key]: source[key as keyof T] });
        }
      });
    }

    return output;
  }

  private isObject(item: unknown): item is Record<string, unknown> {
    return item !== null && typeof item === "object" && !Array.isArray(item);
  }

  getConfig(): PrismConfig {
    return { ...this.config };
  }

  get<K extends keyof PrismConfig>(key: K): PrismConfig[K] {
    return this.config[key];
  }

  set<K extends keyof PrismConfig>(key: K, value: PrismConfig[K]): void {
    this.config[key] = value;
    logger.info("Configuration updated", { key });
  }

  reload(): void {
    this.config = this.loadConfig();
    logger.info("Configuration reloaded");
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.cache.maxSize < 1) {
      errors.push("cache.maxSize must be greater than 0");
    }

    if (this.config.cache.ttl < 0) {
      errors.push("cache.ttl must be non-negative");
    }

    if (this.config.parser.maxFileSize < 0) {
      errors.push("parser.maxFileSize must be non-negative");
    }

    if (this.config.parser.timeout < 0) {
      errors.push("parser.timeout must be non-negative");
    }

    if (this.config.graph.maxNodes < 1) {
      errors.push("graph.maxNodes must be greater than 0");
    }

    const valid = errors.length === 0;
    if (!valid) {
      logger.error("Configuration validation failed", { errors });
    }

    return { valid, errors };
  }

  getLogLevel(): LogLevel {
    return this.config.logging.level;
  }

  getLogOutput(): "stderr" | "stdout" {
    return this.config.logging.output;
  }
}

let globalConfigManager: ConfigManager | null = null;

export function initializeConfig(configPath?: string): ConfigManager {
  if (globalConfigManager === null) {
    globalConfigManager = new ConfigManager(configPath);
    globalConfigManager.validate();
  }
  return globalConfigManager;
}

export function getConfig(): ConfigManager {
  if (globalConfigManager === null) {
    return initializeConfig();
  }
  return globalConfigManager;
}
