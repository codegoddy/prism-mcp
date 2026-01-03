
export const version = '1.0.0';

export function add(a: number, b: number): number {
  return a + b;
}

export class Calculator {
  public result: number = 0;
  private cache: number = 0;
  
  constructor() {}
  
  public add(val: number) {
    this.result += val;
  }
  
  private internalMethod() {}
}

export default function defaultFn() {}

export { add as sum };
export * from './other_module';
