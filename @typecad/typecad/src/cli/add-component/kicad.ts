import fs from "node:fs";
import { parse, serialize, Sym, nameOf, type SExpr } from "../../sexpr/index.js";
import os from "node:os";
import { join } from "node:path";

import { KiCAD } from "../../kicad.js";
import type { CliPinInfo } from '../types.js';
import logger from '../../logging.js';
import { sanitize_name as sharedSanitizeName, sanitize_number as sharedSanitizeNumber } from '../shared/cli_utils.js';

const MAX_EXTENDS_DEPTH = 10;

let symbol_file_contents = "";
let _parsed: SExpr | null = null;
let _pins: CliPinInfo[] = [];
let symbol_lib = "";

export function kicad_cli() {
  return KiCAD.cliPath;
}

export function kicad_symbol(symbol: string, folder = "./", depth = 0): string | undefined {
  if (depth >= MAX_EXTENDS_DEPTH) {
    logger.error(`Max extends depth (${MAX_EXTENDS_DEPTH}) reached for symbol: ${symbol}`);
    return undefined;
  }

  let symbol_file_name = symbol.split(":");

  const kicad = KiCAD.instance;
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

    const l = parse(symbol_file_contents) as SExpr[];

    for (const i in l) {
      if (!Array.isArray(l[i])) continue;
      if (l[i][1] === symbol_file_name[1]) {
        for (const ii in l[i]) {
          if (!Array.isArray(l[i][ii])) continue;

          if (nameOf(l[i][ii][0]) === "extends") {
            const extends_name = String(l[i][ii][1]);

            l[i][ii][1] = `${symbol_file_name[0]}:${extends_name}`;
            symbol_lib = `${symbol_file_name[0]}:${extends_name}`;
            return kicad_symbol(
              `${symbol_file_name[0]}:${extends_name}`,
              folder
            );
          }

          symbol_file_contents = serialize(l[i]);
          _parsed = l[i];

          if (l[i][ii][1] === "Footprint") {
            const fp = String(l[i][ii][2] || "");
            return fp;
          }
        }
        return "";
      }
    }
  } catch (err) {
    logger.error(err);
  }
}

export function kicad_pins(_symbol?: string): CliPinInfo[] {
_pins = [];
let _type = "";
let _name = "";
let _number: string | number = -1;

const l = (_parsed || parse(symbol_file_contents)) as SExpr[];
for (const i in l) {
  if (!Array.isArray(l[i])) continue;
  for (const ii in l[i]) {
    if (!Array.isArray(l[i][ii])) continue;
    if (nameOf(l[i][ii][0]) === "pin") {
      _type = String(l[i][ii][1]);
      for (const iii in l[i][ii]) {
        if (!Array.isArray(l[i][ii][iii])) continue;
        if (nameOf(l[i][ii][iii][0]) === "name") {
          _name = String(l[i][ii][iii][1]);
        }
        if (nameOf(l[i][ii][iii][0]) === "number") {
          _number = String(l[i][ii][iii][1]);
        }
      }

      if (typeof _number === 'string' && _number.trim() !== "") {
        _pins.push({
          type: _type,
          name: sanitize_name(_name),
          number: sanitize_number(_number),
        });
      }
    }
  }
}

if (_pins.length == 0) {
  for (const i in l) {
    if (!Array.isArray(l[i])) continue;
    for (const ii in l[i]) {
      if (!Array.isArray(l[i][ii])) continue;
      if (nameOf(l[i][ii][0]) === "symbol") {
        for (const iii in l[i][ii]) {
          if (!Array.isArray(l[i][ii][iii])) continue;
          if (nameOf(l[i][ii][iii][0]) === "pin") {
            for (const iiii in l[i][ii][iii]) {
              if (!Array.isArray(l[i][ii][iii][iiii])) continue;
              _type = String(l[i][ii][iii][1]);
              if (nameOf(l[i][ii][iii][iiii][0]) === "name") {
                _name = String(l[i][ii][iii][iiii][1]);
              }
              if (nameOf(l[i][ii][iii][iiii][0]) === "number") {
                _number = String(l[i][ii][iii][iiii][1]);
              }
            }

            if (typeof _number === 'string' && _number.trim() !== "") {
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

export function return_list_of_symbols(symbol_path: string) {
  let found_symbols: { value: string }[] = [];

  try {
    symbol_file_contents = fs.readFileSync(symbol_path, "utf8");

    const l = parse(symbol_file_contents) as SExpr[];

    for (const i in l) {
      if (!Array.isArray(l[i])) continue;
      if (nameOf(l[i][0]) === "symbol") {
        found_symbols.push({ value: String(l[i][1]) });
      }
    }
  } catch (err) {
    logger.error(err);
  }

  return found_symbols;
}

export function local_symbol_to_footprint(symbol_path: string) {
  try {
    symbol_file_contents = fs.readFileSync(symbol_path, "utf8");

    const l = parse(symbol_file_contents) as SExpr[];

    for (const i in l) {
      if (!Array.isArray(l[i])) continue;
      for (const ii in l[i]) {
        if (!Array.isArray(l[i][ii])) continue;
        if (l[i][ii][1] === "Footprint") {
          const fp = String(l[i][ii][2] || "");
          if (fp.split(":")[1]) {
            return "lib:" + fp.split(":")[1];
          } else {
            return "lib:" + fp;
          }
        }
      }
    }
  } catch (err) {
    logger.error(err);
  }

  return "";
}

export const sanitize_name = sharedSanitizeName;

export function return_list_of_footprints(footprint_path: string) {
  let found_footprints = [];

  try {
    const footprint_file_contents = fs.readFileSync(footprint_path, "utf8");

    const l = parse(footprint_file_contents);

    // .kicad_mod files have a different structure than .kicad_sym files
    // The parsed structure is the top-level module/footprint node
    if (Array.isArray(l) && (nameOf(l[0]) === "module" || nameOf(l[0]) === "footprint")) {
      let footprintName = String(l[1] || "");
      found_footprints.push({ value: footprintName });
    }
  } catch (err) {
    logger.error(err);
  }

  return found_footprints;
}

export const sanitize_number = sharedSanitizeNumber;
