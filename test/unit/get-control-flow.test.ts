import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import getControlFlow from '../../src/tools/get_control_flow.js';
import { ParserFactory } from '../../src/parsers/factory.js';
import path from 'path';

describe('get_control_flow', () => {
  const fixturePath = path.join(process.cwd(), 'test/fixtures/control_flow_test.ts');

  beforeEach(() => {
    ParserFactory.reset();
  });

  afterEach(() => {
    ParserFactory.reset();
  });

  it('should analyze simple linear flow', async () => {
    const result = await getControlFlow({
      filePath: fixturePath,
      functionName: 'simpleLinear',
    });

    expect(result.isError).toBeFalsy();
    const cfg = JSON.parse(result.content[0].text);
    
    // Entry -> BodyStart -> Exit
    // BodyStart contains statements
    expect(cfg.nodes).toHaveLength(3); // Entry, Body, Exit
    expect(cfg.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('should analyze if/else flow', async () => {
    const result = await getControlFlow({
      filePath: fixturePath,
      functionName: 'ifElse',
    });

    const cfg = JSON.parse(result.content[0].text);
    
    const conditions = cfg.nodes.filter((n: any) => n.type === 'condition');
    expect(conditions).toHaveLength(1);
    expect(conditions[0].label).toBe('x > 0');
    
    // Edges from condition should have labels 'true' and 'false'
    const conditionEdges = cfg.edges.filter((e: any) => e.from === conditions[0].id);
    expect(conditionEdges).toHaveLength(2);
    expect(conditionEdges.map((e: any) => e.label).sort()).toEqual(['false', 'true']);
  });

  it('should analyze early return and throw', async () => {
    const result = await getControlFlow({
        filePath: fixturePath,
        functionName: 'complexFlow'
    });
    
    const cfg = JSON.parse(result.content[0].text);
    
    const exceptions = cfg.nodes.filter((n: any) => n.type === 'exception');
    expect(exceptions).toHaveLength(1);
    
    // Early return statement should connect to Exit
    const earlyReturnEdges = cfg.edges.filter((e: any) => {
        const fromNode = cfg.nodes.find((n: any) => n.id === e.from);
        return fromNode.statements.some((s: string) => s.includes('return -1'));
    });
    const exitNodeId = cfg.nodes.find((n: any) => n.type === 'exit').id;
    
    // Finding the block that contains 'return -1' and verifying edge to exit
    expect(earlyReturnEdges.some((e: any) => e.to === exitNodeId)).toBeTruthy();
  });
});
