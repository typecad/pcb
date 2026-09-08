export function validateFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, got ${value}`);
  }
  return value;
}

export function validatePositive(value: number, name: string): number {
  validateFinite(value, name);
  if (value <= 0) {
    throw new RangeError(`${name} must be positive, got ${value}`);
  }
  return value;
}

export function validateNonNegative(value: number, name: string): number {
  validateFinite(value, name);
  if (value < 0) {
    throw new RangeError(`${name} must be non-negative, got ${value}`);
  }
  return value;
}
