export function escapeSexprString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
