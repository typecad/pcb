import fs from 'node:fs';
import { parse, serialize, Sym, nameOf } from '../../../sexpr/index.js';
import os from 'node:os';

let symbol_file_contents = '';
let _parsed: any = null;
import { KiCAD } from "../../../kicad.js";

let _pins: any[] = [];
let symbol_lib = '';

export function kicad_cli() {
  return KiCAD.cliPath;
}

export function kicad_symbol(symbol: string, _folder?: string) {
  let symbol_file_name = symbol.split(':');

  const kicad = new KiCAD();
  const _kicad_symbol = kicad.getSymbolsPath();

  try {
    if (fs.existsSync(`${_kicad_symbol}/${symbol_file_name[0]}.kicad_sym`)) {
      symbol_file_contents = fs.readFileSync(
        `${_kicad_symbol}/${symbol_file_name[0]}.kicad_sym`,
        'utf8'
      );
    } else {
      symbol_file_contents = fs.readFileSync(
        `./build/lib/${symbol_file_name[0]}.kicad_sym`,
        'utf8'
      );
    }

    const l: any = parse(symbol_file_contents);

    for (const i in l) {
      if (!Array.isArray(l[i])) continue;
      if (l[i][1] === symbol_file_name[1]) {
        for (const ii in l[i]) {
          if (!Array.isArray(l[i][ii])) continue;

          if (nameOf(l[i][ii][0]) === 'extends') {
            const extends_name = String(l[i][ii][1]);

            l[i][ii][1] = `${symbol_file_name[0]}:${extends_name}`;
            symbol_lib = `${symbol_file_name[0]}:${extends_name}`;
            return kicad_symbol(`${symbol_file_name[0]}:${extends_name}`);
          }

          symbol_file_contents = serialize(l[i]);
          _parsed = l[i];

          if (l[i][ii][1] === 'Footprint') {
            const fp = String(l[i][ii][2] || '');
            if (fp === '') {
              return undefined;
            } else {
              return fp;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
}

export function kicad_pins(_symbol?: string): any[] {
let _type = '';
let _name = '';
let _number: string | number = -1;

  const l = _parsed || parse(symbol_file_contents);
  for (const i in l) {
    if (!Array.isArray(l[i])) continue;
    for (const ii in l[i]) {
      if (!Array.isArray(l[i][ii])) continue;
      if (nameOf(l[i][ii][0]) === 'pin') {
        _type = String(l[i][ii][1]);
        for (const iii in l[i][ii]) {
          if (!Array.isArray(l[i][ii][iii])) continue;
          if (nameOf(l[i][ii][iii][0]) === 'name') {
            _name = String(l[i][ii][iii][1]);
          }
          if (nameOf(l[i][ii][iii][0]) === 'number') {
            _number = String(l[i][ii][iii][1]);
          }
        }
        _pins.push({
          type: _type,
          name: sanitize_name(_name),
          number: sanitize_number(_number),
        });
      }
    }
  }

  // if pins is empty, try checking a different format
  if (_pins.length == 0) {
    for (const i in l) {
      if (!Array.isArray(l[i])) continue;
      for (const ii in l[i]) {
        if (!Array.isArray(l[i][ii])) continue;
        if (nameOf(l[i][ii][0]) === 'symbol') {
          for (const iii in l[i][ii]) {
            if (!Array.isArray(l[i][ii][iii])) continue;
            if (nameOf(l[i][ii][iii][0]) === 'pin') {
              for (const iiii in l[i][ii][iii]) {
                if (!Array.isArray(l[i][ii][iii][iiii])) continue;
                _type = String(l[i][ii][iii][1]);
                if (nameOf(l[i][ii][iii][iiii][0]) === 'name') {
                  _name = String(l[i][ii][iii][iiii][1]);
                }
                if (nameOf(l[i][ii][iii][iiii][0]) === 'number') {
                  _number = String(l[i][ii][iii][iiii][1]);
                }
              }
              _pins.push({
                type: _type,
                name: sanitize_name(_name),
                number: sanitize_number(_number),
              });
            }
          }
        }
      }
    }
  }

  // check for dups
  for (let i = 0; i <= _pins.length - 1; i++) {
    let _cnt = 0;
    for (let ii = 0; ii <= _pins.length - 1; ii++) {
      if (_pins[i].name == _pins[ii].name) {
        _cnt++;
        if (_cnt > 1) {
          _pins[ii].name = _pins[ii].name + '_' + _pins[ii].number;
        }
      }
    }
  }
  return _pins;
}

export function return_list_of_symbols(symbol_path: string) {
  let found_symbols: { value: string }[] = [];

  try {
    symbol_file_contents = fs.readFileSync(symbol_path, 'utf8');

    const l: any = parse(symbol_file_contents);

    for (const i in l) {
      if (!Array.isArray(l[i])) continue;
      if (nameOf(l[i][0]) === 'symbol') {
        found_symbols.push({ value: String(l[i][1]) });
      }
    }
  } catch (err) {
    console.error(err);
  }

  return found_symbols;
}

export function local_symbol_to_footprint(symbol_path: string) {
  try {
    symbol_file_contents = fs.readFileSync(symbol_path, 'utf8');

    const l: any = parse(symbol_file_contents);

    for (const i in l) {
      if (!Array.isArray(l[i])) continue;
      for (const ii in l[i]) {
        if (!Array.isArray(l[i][ii])) continue;
        if (l[i][ii][1] === 'Footprint') {
          const fp = String(l[i][ii][2] || '');
          // some footprints come with the form xx:xx
          if (fp.split(':')[1]){
            return 'lib:'+fp.split(':')[1];
          } else {
            // some don't
            return 'lib:'+fp;
          }

        }
      }
    }
  } catch (err) {
    console.error(err);
  }

  return '';
}

export function sanitize_name(string: string) {
  let _string = string;
  _string = _string.replace(/[\|~{}//&;\$%@"*=<>\(\)\+,-]/g, '_');
  _string = _string.replaceAll('__', '_');
  // catch if starts with a number
  if (!isNaN(Number(_string.charAt(0)))) {
    //If is a number
    _string = '_' + _string;
  }
  return _string;
}

export function sanitize_number(number: string | number) {
  let _number = number;

  if (isNaN(Number(_number))) {
    _number = "'" + _number + "'";
  }
  return _number;
}
