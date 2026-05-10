import fs from "node:fs";
import { platform } from "node:os";
import fsexp from "fast-sexpr";
import SExpr from "s-expression.js";
import os from "node:os";
import { join } from "node:path";

import { KiCAD } from "../../dist/kicad.js";

let symbol_file_contents = "";
const S = new SExpr();
let _pins = [];
let symbol_lib = "";

export function kicad_cli() {
  return KiCAD.cliPath;
}

export function kicad_symbol(symbol, folder = "./") {
  let symbol_file_name = symbol.split(":");
  
  const kicad = new KiCAD();
  const _kicad_symbol = kicad.getSymbolsPath();

  try {
    if (fs.existsSync(`${_kicad_symbol}/${symbol_file_name[0]}.kicad_sym`)) {
      symbol_file_contents = fs.readFileSync(
        `${_kicad_symbol}/${symbol_file_name[0]}.kicad_sym`,
        "utf8"
      );
    } else {
      symbol_file_contents = fs.readFileSync(
        join(folder, "build", "lib", `${symbol_file_name[0]}.kicad_sym`),
        "utf8"
      );
    }

    symbol_file_contents = symbol_file_contents.replaceAll('"', "`");

    const l = fsexp(symbol_file_contents).pop();

    // search through sym file for the symbol
    for (const i in l) {
      if (l[i][1] == `\`${symbol_file_name[1]}\``) {
        // replace the name with the fqn
        l[i][1] = `"${symbol_file_name[0]}:${symbol_file_name[1]}"`;
        for (const ii in l[i]) {
          if (l[i][2][0] == "extends") {
            // remove `
            const extends_name = l[i][2][1].replaceAll(`\``, "");

            // replace the name with the fqn
            l[i][2][1] = `"${symbol_file_name[0]}:${extends_name}"`;
            symbol_lib = `${symbol_file_name[0]}:${extends_name}`;
            return kicad_symbol(
              `${symbol_file_name[0]}:${extends_name}`,
              folder
            );
          }

          symbol_file_contents = S.serialize(l[i]).replaceAll("`", '"');
          if (l[i][ii][1] == "`Footprint`") {
            if (l[i][ii][2].replaceAll(`\``, "") == "") {
              return undefined; // it exists but is blank
            } else {
              return l[i][ii][2].replaceAll(`\``, "");
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
}

export function kicad_pins() {
  let _type = "";
  let _name = "";
  let _number = -1;

  const l = fsexp(symbol_file_contents).pop();
  for (const i in l) {
    for (const ii in l[i]) {
      if (l[i][ii][0] == "pin") {
        _type = l[i][ii][1];
        for (const iii in l[i][ii]) {
          if (l[i][ii][iii][0] == "name") {
            _name = l[i][ii][iii][1];
          }
          if (l[i][ii][iii][0] == "number") {
            _number = l[i][ii][iii][1];
          }
        }

        // Accept both numeric and alphanumeric pin numbers
        if (_number && _number.trim() !== "") {
          _pins.push({
            type: _type,
            name: sanitize_name(_name),
            number: sanitize_number(_number),
          });
        }
      }
    }
  }

  // if pins is empty, try checking a different format
  if (_pins.length == 0) {
    for (const i in l) {
      for (const ii in l[i]) {
        if (l[i][ii][0] == "symbol") {
          for (const iii in l[i][ii]) {
            if (l[i][ii][iii][0] == "pin") {
              for (const iiii in l[i][ii][iii]) {
                _type = l[i][ii][iii][1];
                if (l[i][ii][iii][iiii][0] == "name") {
                  _name = l[i][ii][iii][iiii][1];
                }
                if (l[i][ii][iii][iiii][0] == "number") {
                  _number = l[i][ii][iii][iiii][1];
                }
              }

              // Accept both numeric and alphanumeric pin numbers
              if (_number && _number.trim() !== "") {
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
  }

  // check for dups
  for (let i = 0; i <= _pins.length - 1; i++) {
    let _cnt = 0;
    for (let ii = 0; ii <= _pins.length - 1; ii++) {
      if (_pins[i].name == _pins[ii].name) {
        _cnt++;
        if (_cnt > 1) {
          _pins[ii].name = _pins[ii].name + "_" + _pins[ii].number;
        }
      }
    }
  }
  return _pins;
}

export function return_list_of_symbols(symbol_path) {
  let found_symbols = [];

  try {
    symbol_file_contents = fs.readFileSync(symbol_path, "utf8");

    const l = fsexp(symbol_file_contents).pop();

    // search through sym file for the symbol
    for (const i in l) {
      if (l[i][0] == "symbol") {
        // console.log(l[i][1].replaceAll(`\``, ''));
        found_symbols.push({ value: l[i][1].replaceAll(`\``, "") });
      }
    }
  } catch (err) {
    console.error(err);
  }

  return found_symbols;
}

export function local_symbol_to_footprint(symbol_path) {
  try {
    symbol_file_contents = fs.readFileSync(symbol_path, "utf8");

    const l = fsexp(symbol_file_contents).pop();

    for (const i in l) {
      for (const ii in l[i]) {
        if (l[i][ii][1] == "Footprint") {
          // some footprints come with the form xx:xx
          if (l[i][ii][2].split(":")[1]) {
            return "lib:" + l[i][ii][2].split(":")[1];
          } else {
            // some don't
            return "lib:" + l[i][ii][2];
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }

  return "";
}

export function sanitize_name(string) {
  let _string = string;
  // catch invalid symbols and replace with _
  _string = _string.replace(/[\|~{}//&;\$%@"*=<>#\(\)\+,-]/g, "_");
  _string = _string.replaceAll("__", "_");
  if (_string.startsWith("_")) {
    _string = _string.substring(1);
  }
  if (_string.endsWith("_")) {
    _string = _string.substring(0, _string.length - 1);
  }
  // catch if starts with a number
  if (!isNaN(_string.charAt(0))) {
    //If is a number
    _string = "_" + _string;
  }
  return _string;
}

export function return_list_of_footprints(footprint_path) {
  let found_footprints = [];

  try {
    const footprint_file_contents = fs.readFileSync(footprint_path, "utf8");

    const l = fsexp(footprint_file_contents);

    // .kicad_mod files have a different structure than .kicad_sym files
    // The parsed structure is an array with one element containing the module
    if (l.length > 0 && l[0][0] === "module") {
      // Extract footprint name - remove quotes if present
      let footprintName = l[0][1];
      if (footprintName.startsWith('"') && footprintName.endsWith('"')) {
        footprintName = footprintName.slice(1, -1);
      }
      found_footprints.push({ value: footprintName });
    }
  } catch (err) {
    console.error(err);
  }

  return found_footprints;
}

export function sanitize_number(number) {
  let _number = number;

  if (isNaN(_number)) {
    _number = "'" + _number + "'";
  }
  return _number;
}
