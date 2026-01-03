
export function simpleLinear() {
  const x = 1;
  const y = 2;
  return x + y;
}

export function ifElse(x: number) {
  let result;
  if (x > 0) {
    result = 'positive';
  } else {
    result = 'non-positive';
  }
  return result;
}

export function complexFlow(x: number) {
  if (x < 0) {
    return -1; // Early return
  }
  
  if (x === 0) {
    throw new Error('Zero'); // Throw
  }
  
  if (x > 10) {
    x = 10;
  }
  
  return x;
}

// Arrow function test
export const arrowTest = (x: number) => {
    if (x) return 1;
    return 0;
};
