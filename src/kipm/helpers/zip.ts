export default function zip(arr: string[], values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const len = Math.min(arr.length, values.length);
  for (let i = 0; i < len; i++) {
    result[arr[i]] = values[i];
  }
  return result;
}
