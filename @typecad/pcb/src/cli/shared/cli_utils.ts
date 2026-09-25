export function sanitize_name(string: string): string {
  let _string = string;
  _string = _string.replace(/[\|~{}//&;\$%@"*=<>#\(\)\+,-]/g, '_');
  _string = _string.replaceAll('__', '_');
  if (_string.startsWith('_')) {
    _string = _string.substring(1);
  }
  if (_string.endsWith('_')) {
    _string = _string.substring(0, _string.length - 1);
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
