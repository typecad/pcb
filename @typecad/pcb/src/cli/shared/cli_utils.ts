export function sanitize_name(string: string): string {
  let _string = string;
  // Emitted as a TypeScript class/identifier: keep only identifier
  // characters (letters, digits, _ $) and fold everything else — dots,
  // dashes, slashes, ... — so names like "AP2112K-3.3" produce valid code.
  _string = _string.replace(/[^A-Za-z0-9_$]+/g, '_');
  if (_string.startsWith('_')) {
    _string = _string.substring(1);
  }
  if (_string.endsWith('_')) {
    _string = _string.substring(0, _string.length - 1);
  }
  if (_string === '') {
    return '_component';
  }
  if (!isNaN(Number(_string.charAt(0)))) {
    _string = '_' + _string;
  }
  return _string;
}

export function sanitize_number(number: string | number): string | number {
  let _number = number;
  if (isNaN(Number(_number))) {
    _number = "'" + _number + "'";
  }
  return _number;
}
