
import { funcA, funcB } from './source.js';
import { describe, it } from 'vitest';

describe('source', () => {
    it('should test funcA', () => {
        funcA();
    });

    it('should test funcB', () => {
        funcB();
    });
});
