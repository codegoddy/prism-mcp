// Test fixture for find_callers

export function helper1(): void {
  console.log('helper1 called');
}

export function helper2(value: number): number {
  return value * 2;
}

export function main(): void {
  helper1();
  helper1();
  const result = helper2(5);
}

export function processData(): void {
  main();
  helper1();
}
