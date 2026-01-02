import { describe, it, expect } from 'vitest';
import { PythonParser } from '../../src/parsers/python.js';

describe('PythonParser Type Extraction', () => {
  const parser = new PythonParser();

  it('should extract function type hints', () => {
    const code = `
def greet(name: str, times: int = 1) -> str:
    return name * times

def process(items: List[int]) -> None:
    pass
    `;
    
    const info = parser.extractTypeInfo(code, 'test.py');
    
    expect(info.functions).toBeDefined();
    expect(info.functions).toHaveLength(2);

    const greet = info.functions.find(f => f.name === 'greet');
    expect(greet).toBeDefined();
    expect(greet.returnType).toBe('str');
    expect(greet.params).toHaveLength(2);
    expect(greet.params[0].name).toBe('name');
    expect(greet.params[0].type).toBe('str');
    expect(greet.params[1].name).toBe('times');
    expect(greet.params[1].type).toBe('int');

    const process = info.functions.find(f => f.name === 'process');
    expect(process).toBeDefined();
    expect(process.returnType).toBe('None');
    expect(process.params[0].type).toBe('List[int]');
  });

  it('should extract variable annotations', () => {
    const code = `
x: int = 10
name: str = "Alice"
users: Dict[str, int] = {}
    `;

    const info = parser.extractTypeInfo(code, 'vars.py');
    
    expect(info.variables).toBeDefined();
    expect(info.variables).toHaveLength(3);
    
    const x = info.variables.find(v => v.name === 'x');
    expect(x.type).toBe('int');
    
    const users = info.variables.find(v => v.name === 'users');
    expect(users.type).toBe('Dict[str, int]');
  });
});
