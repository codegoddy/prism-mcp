import type { ParserInterface, Language } from '../parsers/base.js';
import type { ParseResult } from '../types/ast.js';
import { getCacheManager } from './cache.js';
import { logger } from '../utils/logger.js';

export class CachedParser implements ParserInterface {
  private parser: ParserInterface;

  constructor(parser: ParserInterface) {
    this.parser = parser;
  }

  async parseFile(filePath: string): Promise<ParseResult> {
    const cache = getCacheManager();
    const cached = cache.get(filePath);

    if (cached) {
      logger.debug('Using cached AST', { filePath });
      return cached;
    }

    logger.debug('Parsing file', { filePath });
    const result = await this.parser.parseFile(filePath);
    await cache.set(filePath, result);

    return result;
  }

  parse(source: string, filePath?: string): ParseResult {
    if (!filePath) {
      return this.parser.parse(source);
    }

    const cache = getCacheManager();
    const cached = cache.get(filePath);

    if (cached) {
      logger.debug('Using cached AST', { filePath });
      return cached;
    }

    logger.debug('Parsing source', { filePath });
    const result = this.parser.parse(source, filePath);
    void cache.set(filePath, result);

    return result;
  }

  getLanguage(): Language {
    return this.parser.getLanguage();
  }

  getConfig() {
    return this.parser.getConfig();
  }

  isSupported(fileExtension: string): boolean {
    return this.parser.isSupported(fileExtension);
  }
}
