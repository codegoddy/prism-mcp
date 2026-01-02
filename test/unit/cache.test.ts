import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ASTCacheManager, getCacheManager, initializeCacheManager } from '../../src/ast/cache';
import type { ParseResult, ASTNode, Position } from '../../src/types/ast';
import { getConfig } from '../../src/utils/config';

vi.mock('../../src/utils/config');

describe('ASTCacheManager', () => {
  let cacheManager: ASTCacheManager;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      get: vi.fn((key: string) => {
        if (key === 'cache') {
          return { enabled: true, maxSize: 5, ttl: 1000 };
        }
        return {};
      }),
      set: vi.fn(),
    };
    vi.mocked(getConfig).mockReturnValue(mockConfig);
    cacheManager = new ASTCacheManager();
  });

  afterEach(() => {
    cacheManager.destroy();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(cacheManager.getCacheSize()).toBe(0);
    });
  });

  describe('get and set', () => {
    it('should cache and retrieve a parse result', async () => {
      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      await cacheManager.set('/path/to/file.ts', parseResult);
      const retrieved = cacheManager.get('/path/to/file.ts');

      expect(retrieved).toBeDefined();
      expect(retrieved?.tree.type).toBe('program');
      expect(retrieved?.parseTime).toBe(10);
    });

    it('should return null for non-existent entry', () => {
      const result = cacheManager.get('/non/existent.ts');
      expect(result).toBeNull();
    });

    it('should respect maxSize and evict LRU entries', async () => {
      const maxSize = 5;
      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      for (let i = 0; i < maxSize; i++) {
        await cacheManager.set(`/file${i}.ts`, parseResult);
      }

      expect(cacheManager.getCacheSize()).toBe(maxSize);

      await cacheManager.set(`/newfile.ts`, parseResult);

      expect(cacheManager.getCacheSize()).toBe(maxSize);
      expect(cacheManager.get('/file0.ts')).toBeNull();
    });

    it('should update last accessed time on get', async () => {
      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      await cacheManager.set('/file1.ts', parseResult);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await cacheManager.set('/file2.ts', parseResult);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await cacheManager.set('/file3.ts', parseResult);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await cacheManager.set('/file4.ts', parseResult);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await cacheManager.set('/file5.ts', parseResult);

      cacheManager.get('/file1.ts');
      cacheManager.get('/file1.ts');

      await cacheManager.set('/file6.ts', parseResult);

      expect(cacheManager.get('/file1.ts')).toBeDefined();
      expect(cacheManager.get('/file2.ts')).toBeNull();
      expect(cacheManager.get('/file3.ts')).toBeDefined();
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire entries after TTL', async () => {
      mockConfig.get = vi.fn((key: string) => {
        if (key === 'cache') {
          return { enabled: true, maxSize: 10, ttl: 100 };
        }
        return {};
      });
      cacheManager = new ASTCacheManager();

      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      await cacheManager.set('/file.ts', parseResult);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = cacheManager.get('/file.ts');
      expect(result).toBeNull();
    });

    it('should not expire if TTL is 0', async () => {
      mockConfig.get = vi.fn((key: string) => {
        if (key === 'cache') {
          return { enabled: true, maxSize: 10, ttl: 0 };
        }
        return {};
      });
      cacheManager = new ASTCacheManager();

      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      await cacheManager.set('/file.ts', parseResult);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = cacheManager.get('/file.ts');
      expect(result).toBeDefined();
    });
  });

  describe('invalidation', () => {
    it('should invalidate a specific entry', async () => {
      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      await cacheManager.set('/file.ts', parseResult);
      expect(cacheManager.get('/file.ts')).toBeDefined();

      cacheManager.invalidate('/file.ts');
      expect(cacheManager.get('/file.ts')).toBeNull();
    });

    it('should invalidate non-existent entry without error', () => {
      expect(() => cacheManager.invalidate('/nonexistent.ts')).not.toThrow();
    });

    it('should clear all entries', async () => {
      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      await cacheManager.set('/file1.ts', parseResult);
      await cacheManager.set('/file2.ts', parseResult);

      expect(cacheManager.getCacheSize()).toBe(2);

      cacheManager.clear();
      expect(cacheManager.getCacheSize()).toBe(0);
    });
  });

  describe('stats', () => {
    it('should track cache hits and misses', async () => {
      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      await cacheManager.set('/file.ts', parseResult);

      cacheManager.get('/file.ts');
      cacheManager.get('/file.ts');
      cacheManager.get('/nonexistent.ts');

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('should track evictions', async () => {
      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      for (let i = 0; i < 6; i++) {
        await cacheManager.set(`/file${i}.ts`, parseResult);
      }

      const stats = cacheManager.getStats();
      expect(stats.evictions).toBeGreaterThanOrEqual(1);
    });

    it('should calculate hit rate', async () => {
      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      await cacheManager.set('/file.ts', parseResult);

      cacheManager.get('/file.ts');
      cacheManager.get('/file.ts');
      cacheManager.get('/nonexistent.ts');
      cacheManager.get('/nonexistent.ts');

      const stats = cacheManager.getStats();
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe('configuration', () => {
    it('should update cache config', async () => {
      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      for (let i = 0; i < 5; i++) {
        await cacheManager.set(`/file${i}.ts`, parseResult);
      }

      expect(cacheManager.getCacheSize()).toBe(5);

      cacheManager.updateConfig(3);

      expect(cacheManager.getCacheSize()).toBe(3);
    });
  });

  describe('global instances', () => {
    it('should return singleton instance', () => {
      const instance1 = getCacheManager();
      const instance2 = getCacheManager();

      expect(instance1).toBe(instance2);
    });

    it('should initialize with watch paths', () => {
      const instance = initializeCacheManager(['/src']);
      expect(instance.getCacheSize()).toBe(0);
      instance.destroy();
    });
  });

  describe('eviction', () => {
    it('should evict the least recently used entry', async () => {
      const parseResult: ParseResult = {
        tree: createMockASTNode('program'),
        errors: [],
        parseTime: 10,
      };

      await cacheManager.set('/file1.ts', parseResult);
      await new Promise((resolve) => setTimeout(resolve, 10));

      await cacheManager.set('/file2.ts', parseResult);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await cacheManager.set('/file3.ts', parseResult);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await cacheManager.set('/file4.ts', parseResult);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await cacheManager.set('/file5.ts', parseResult);

      cacheManager.get('/file1.ts');
      cacheManager.get('/file3.ts');

      await cacheManager.set('/file6.ts', parseResult);

      expect(cacheManager.get('/file1.ts')).toBeDefined();
      expect(cacheManager.get('/file2.ts')).toBeNull();
      expect(cacheManager.get('/file3.ts')).toBeDefined();
    });
  });
});

function createMockASTNode(type: string): ASTNode {
  return {
    type,
    text: '',
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: 0 },
    children: [],
    namedChildren: [],
    parent: null,
  };
}
