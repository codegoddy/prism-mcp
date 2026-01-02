import type { ParseResult } from '../types/ast.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import * as chokidar from 'chokidar';
import { stat, access } from 'fs/promises';
import { constants } from 'fs';

interface CacheEntry {
  parseResult: ParseResult;
  filePath: string;
  fileSize: number;
  lastModified: number;
  lastAccessed: number;
  createdAt: number;
}

export class ASTCacheManager {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private ttl: number;
  private enabled: boolean;
  private fileWatcher: chokidar.FSWatcher | null = null;
  private watchedPaths: Set<string>;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    invalidations: number;
  };

  constructor() {
    const config = getConfig();
    const cacheConfig = config.get('cache');

    this.cache = new Map();
    this.maxSize = cacheConfig.maxSize;
    this.ttl = cacheConfig.ttl;
    this.enabled = cacheConfig.enabled;
    this.watchedPaths = new Set();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0,
    };

    if (this.enabled) {
      logger.info('AST Cache Manager initialized', {
        maxSize: this.maxSize,
        ttl: this.ttl,
      });
    } else {
      logger.info('AST Cache Manager is disabled');
    }
  }

  get(filePath: string): ParseResult | null {
    if (!this.enabled) {
      return null;
    }

    const entry = this.cache.get(filePath);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();

    if (this.isExpired(entry, now)) {
      this.invalidate(filePath);
      this.stats.misses++;
      return null;
    }

    entry.lastAccessed = now;
    this.stats.hits++;

    logger.debug('Cache hit', {
      filePath,
      cacheSize: this.cache.size,
    });

    return entry.parseResult;
  }

  async set(filePath: string, parseResult: ParseResult): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      let fileSize = 0;
      let lastModified = Date.now();

      try {
        const stats = await stat(filePath);
        fileSize = stats.size;
        lastModified = stats.mtimeMs;
      } catch {
        logger.debug('File does not exist for cache, using defaults', { filePath });
      }

      const now = Date.now();

      const entry: CacheEntry = {
        parseResult,
        filePath,
        fileSize,
        lastModified,
        lastAccessed: now,
        createdAt: now,
      };

      if (this.cache.has(filePath)) {
        this.cache.set(filePath, entry);
      } else {
        if (this.cache.size >= this.maxSize) {
          this.evictLRU();
        }
        this.cache.set(filePath, entry);
      }

      logger.debug('AST cached', {
        filePath,
        cacheSize: this.cache.size,
        parseTime: parseResult.parseTime,
      });
    } catch (error) {
      logger.warn('Failed to cache AST', { filePath, error: (error as Error).message });
    }
  }

  invalidate(filePath: string): void {
    const entry = this.cache.get(filePath);
    if (entry) {
      this.cache.delete(filePath);
      this.stats.invalidations++;

      logger.debug('Cache invalidated', {
        filePath,
        cacheSize: this.cache.size,
      });
    }
  }

  async invalidateIfChanged(filePath: string): Promise<void> {
    const entry = this.cache.get(filePath);

    if (!entry) {
      return;
    }

    try {
      await access(filePath, constants.R_OK);

      const stats = await stat(filePath);

      if (stats.mtimeMs > entry.lastModified || stats.size !== entry.fileSize) {
        this.invalidate(filePath);
        logger.debug('Cache invalidated due to file change', {
          filePath,
          oldModified: entry.lastModified,
          newModified: stats.mtimeMs,
          oldSize: entry.fileSize,
          newSize: stats.size,
        });
      }
    } catch (error) {
      logger.warn('Failed to check file for cache invalidation', {
        filePath,
        error: (error as Error).message,
      });
    }
  }

  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.invalidations += size;

    logger.info('Cache cleared', { size });
  }

  evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;

      logger.debug('LRU entry evicted', {
        filePath: lruKey,
        cacheSize: this.cache.size,
      });
    }
  }

  private isExpired(entry: CacheEntry, now: number): boolean {
    if (this.ttl <= 0) {
      return false;
    }
    return now - entry.createdAt > this.ttl;
  }

  startFileWatcher(paths: string | string[]): void {
    if (!this.enabled || this.fileWatcher) {
      return;
    }

    const watchPaths = Array.isArray(paths) ? paths : [paths];

    this.fileWatcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 10,
      },
    });

    this.fileWatcher.on('change', (filePath: string) => {
      this.invalidate(filePath);
    });

    this.fileWatcher.on('unlink', (filePath: string) => {
      this.invalidate(filePath);
    });

    watchPaths.forEach((path) => this.watchedPaths.add(path));

    logger.info('File watcher started', {
      paths: watchPaths,
    });
  }

  stopFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close().then(() => {
        logger.info('File watcher stopped');
      });
      this.fileWatcher = null;
      this.watchedPaths.clear();
    }
  }

  addWatchPath(path: string): void {
    if (!this.fileWatcher) {
      return;
    }

    this.fileWatcher.add(path);
    this.watchedPaths.add(path);

    logger.debug('Watch path added', { path });
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getCacheKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  getStats() {
    return {
      ...this.stats,
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? this.stats.hits / (this.stats.hits + this.stats.misses)
          : 0,
      size: this.cache.size,
      maxSize: this.maxSize,
      enabled: this.enabled,
    };
  }

  async refresh(filePath: string): Promise<void> {
    await this.invalidateIfChanged(filePath);
  }

  async refreshAll(): Promise<void> {
    const keys = this.getCacheKeys();
    const promises = keys.map((key) => this.invalidateIfChanged(key));
    void Promise.all(promises);

    logger.info('Cache refreshed for all entries', {
      entriesChecked: keys.length,
    });
  }

  updateConfig(maxSize?: number, ttl?: number): void {
    const config = getConfig();
    const cacheConfig = config.get('cache');

    if (maxSize !== undefined) {
      this.maxSize = maxSize;
      config.set('cache', { ...cacheConfig, maxSize });
    }

    if (ttl !== undefined) {
      this.ttl = ttl;
      config.set('cache', { ...cacheConfig, ttl });
    }

    logger.info('Cache config updated', {
      maxSize: this.maxSize,
      ttl: this.ttl,
    });

    if (this.cache.size > this.maxSize) {
      while (this.cache.size > this.maxSize) {
        this.evictLRU();
      }
    }
  }

  destroy(): void {
    this.stopFileWatcher();
    this.clear();
    logger.info('AST Cache Manager destroyed');
  }
}

let globalCacheManager: ASTCacheManager | null = null;

export function getCacheManager(): ASTCacheManager {
  if (globalCacheManager === null) {
    globalCacheManager = new ASTCacheManager();
  }
  return globalCacheManager;
}

export function initializeCacheManager(paths?: string | string[]): ASTCacheManager {
  if (globalCacheManager === null) {
    globalCacheManager = new ASTCacheManager();
    if (paths) {
      globalCacheManager.startFileWatcher(paths);
    }
  }
  return globalCacheManager;
}
