
export function coreFunction(): string {
  return "core";
}

// Direct dependency
export function middleLayer(): string {
  return coreFunction();
}

// Indirect dependency
export function apiLayer(): string {
  return middleLayer();
}
