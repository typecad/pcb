export function sanitize_name(string) {
  let _string = string;
  // catch invalid symbols and replace with _
  _string = _string.replace(/[\|~{}//&;\$%@"*=<>\(\)\+,-]/g, '_');
  _string = _string.replaceAll('__', '_');
  // catch if starts with a number
  if (!isNaN(_string.charAt(0))) {
    //If is a number
    _string = '_' + _string;
  }
  return _string;
}

export function sanitize_number(number) {
  let _number = number;

  if (isNaN(_number)) {
    _number = "'" + _number + "'";
  }
  return _number;
}
