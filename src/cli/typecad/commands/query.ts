import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import {
  buildBoardModel,
  findComponent,
  findNet,
  isPowerNet,
  singlePinNets,
  unconnectedPads,
  type BoardComponent,
  type BoardModel,
  type BoardNet,
} from '../board_model.js';

function findPcbFile(argPath?: string): string | null {
  if (argPath) {
    const resolved = path.resolve(argPath);
    return fs.existsSync(resolved) ? resolved : null;
  }
  const buildDir = path.join(process.cwd(), 'build');
  if (!fs.existsSync(buildDir)) return null;
  const pcbFiles = fs.readdirSync(buildDir).filter((f) => f.endsWith('.kicad_pcb'));
  if (pcbFiles.length === 1) return path.join(buildDir, pcbFiles[0]);
  return null;
}

function netSummaryJson(net: BoardNet) {
  return {
    name: net.name,
    code: net.code,
    pinCount: net.pins.length,
    viaCount: net.vias.length,
    zones: net.zones.map((z) => z.layers),
    power: isPowerNet(net),
    pins: net.pins,
    route: net.route,
  };
}

function routeJson(net: BoardNet) {
  return {
    net: net.name,
    power: isPowerNet(net),
    ...(net.route ?? {
      segments: net.segments.length,
      length: net.segments.reduce((acc, s) => acc + s.length, 0),
      layers: [...new Set(net.segments.map((s) => s.layer))],
      pinsTotal: net.pins.length,
      pinsConnected: 0,
      disconnectedGroups: [],
      routed: net.pins.length === 0,
      pourAssisted: net.zones.length > 0,
    }),
    vias: net.vias.length,
    pours: net.zones.map((z) => z.layers),
  };
}

function componentJson(comp: BoardComponent) {
  return {
    reference: comp.reference,
    value: comp.value,
    footprint: comp.footprint,
    variable: comp.variable,
    source: comp.source,
    side: comp.side,
    at: comp.at,
    dimensions: comp.dimensions,
    padCount: comp.pads.length,
    unconnectedPads: comp.pads.filter((p) => p.net === null && p.type !== 'np_thru_hole').map((p) => p.pad),
    pads: comp.pads,
  };
}

function printHeader(title: string, file: string): void {
  logger.log(chalk.white.bold(title) + chalk.gray(`  (${file})`) + '\n');
}

export async function run(parsed: ParsedArgs): Promise<void> {
  let subject = parsed.subcommand;
  const json = parsed.json;

  if (!subject || subject === 'help') {
    if (json) {
      logger.log(
        JSON.stringify({
          subjects: [
            'summary',
            'nets',
            'net <name>',
            'components',
            'component <ref>',
            'unconnected',
            'power',
            'routes',
            'routes <net>',
            'zones',
          ],
        }),
      );
      return;
    }
    logger.log(chalk.white.bold('typecad-pcb query — inspect the compiled board'));
    logger.log('');
    logger.log('  typecad-pcb query summary            board totals and bounds');
    logger.log('  typecad-pcb query nets               every net with its members');
    logger.log('  typecad-pcb query net <name>         one net in detail');
    logger.log('  typecad-pcb query components         reference, value, footprint, position');
    logger.log('  typecad-pcb query component <ref>    one component, pad-by-pad');
    logger.log('  typecad-pcb query unconnected        pads with no net; single-pin nets');
    logger.log('  typecad-pcb query power              power rails, stitching vias, zones');
    logger.log('  typecad-pcb query routes             copper status per net: routed pins, lengths, layers');
    logger.log('  typecad-pcb query routes <net>       one net’s routing in detail');
    logger.log('  typecad-pcb query zones              copper pours and keepout regions');
    logger.log('');
    logger.log(chalk.gray('Queries the .kicad_pcb in ./build/ (or pass a path). Add --json for machine output.'));
    return;
  }

  const validSubjects = [
    'summary',
    'nets',
    'net',
    'components',
    'component',
    'unconnected',
    'power',
    'routes',
    'zones',
  ];
  if (!validSubjects.includes(subject)) {
    if (json) {
      logger.log(
        JSON.stringify({
          error: true,
          message: `Unknown subject '${subject}'. Valid: ${validSubjects.join(', ')}.`,
          code: 'UNKNOWN_SUBJECT',
        }),
      );
    } else {
      logger.error(chalk.red(`Unknown subject '${subject}'. Run 'typecad-pcb query' for available subjects.`));
    }
    process.exit(1);
  }

  // The path argument comes after the subject (e.g. `query net GND` → positional[0] is GND)
  const explicitPath = parsed.positional.find((p) => p.endsWith('.kicad_pcb'));
  const pcbPath = findPcbFile(explicitPath ?? undefined);
  if (!pcbPath) {
    throw new Error(
      explicitPath
        ? `PCB file not found: ${explicitPath}`
        : "No .kicad_pcb found in ./build/. Run 'typecad-pcb build' first or pass a path.",
    );
  }

  const model: BoardModel = buildBoardModel(pcbPath);

  // Plural subject with a detail argument delegates to the singular view, so
  // `query components MH3` behaves like `query component MH3` instead of
  // silently ignoring the argument.
  const detailArg = parsed.positional.find((p) => !p.endsWith('.kicad_pcb'));
  if (detailArg && subject === 'components') subject = 'component';
  if (detailArg && subject === 'nets') subject = 'net';

  switch (subject) {
    case 'summary': {
      const s = model.summary;
      if (json) {
        logger.log(JSON.stringify(s, null, 2));
        return;
      }
      printHeader('Board summary', pcbPath);
      logger.log(`  components        ${s.components}`);
      logger.log(`  named nets        ${s.namedNets}`);
      logger.log(`  vias              ${s.vias}`);
      logger.log(`  zones             ${s.zones}`);
      logger.log(`  keepouts          ${s.keepouts}`);
      logger.log(`  track segments    ${s.tracks}`);
      logger.log(`  unrouted nets     ${model.nets.filter((n) => n.route && !n.route.routed).length}`);
      logger.log(`  unconnected pads  ${chalk.yellow(s.unconnectedPads)}`);
      if (s.board) {
        const w = (s.board.maxX - s.board.minX).toFixed(2);
        const h = (s.board.maxY - s.board.minY).toFixed(2);
        logger.log(
          `  board outline     ${w} × ${h} mm  (${s.board.minX}, ${s.board.minY}) → (${s.board.maxX}, ${s.board.maxY})`,
        );
      } else {
        logger.log(chalk.gray('  board outline     (none on Edge.Cuts)'));
      }
      return;
    }

    case 'nets': {
      const sorted = [...model.nets].sort((a, b) => a.name.localeCompare(b.name));
      if (json) {
        logger.log(JSON.stringify(sorted.map(netSummaryJson), null, 2));
        return;
      }
      printHeader(`Nets (${model.nets.length})`, pcbPath);
      for (const net of sorted) {
        const power = isPowerNet(net) ? chalk.magenta(' ⏦') : '';
        const vias = net.vias.length > 0 ? chalk.gray(`  ${net.vias.length} via${net.vias.length > 1 ? 's' : ''}`) : '';
        const zones = net.zones.length > 0 ? chalk.gray(`  ${net.zones.length} zone`) : '';
        logger.log(
          `  ${chalk.white(net.name || chalk.gray('(unnamed)'))}${power} — ${net.pins.length} pin${net.pins.length === 1 ? '' : 's'}${vias}${zones}`,
        );
        if (net.pins.length > 0) {
          logger.log(chalk.gray(`      ${net.pins.join('  ')}`));
        }
      }
      return;
    }

    case 'net': {
      const name = parsed.positional.find((p) => !p.endsWith('.kicad_pcb'));
      if (!name) throw new Error('Net name required. Usage: typecad-pcb query net <name>');
      const net = findNet(model, name);
      if (!net) {
        if (json) {
          logger.log(
            JSON.stringify(
              {
                error: true,
                message: `Net '${name}' not found.`,
                code: 'NET_NOT_FOUND',
                available: model.nets.map((n) => n.name),
              },
              null,
              2,
            ),
          );
        } else {
          logger.error(chalk.red(`Net '${name}' not found. Run 'typecad-pcb query nets' to list them.`));
        }
        process.exit(1);
      }
      if (json) {
        logger.log(JSON.stringify(netSummaryJson(net), null, 2));
        return;
      }
      printHeader(`Net ${net.name}`, pcbPath);
      logger.log(`  power     ${isPowerNet(net) ? 'yes' : 'no'}`);
      logger.log(`  pins      ${net.pins.length}`);
      for (const pin of net.pins) logger.log(`    ${pin}`);
      if (net.vias.length > 0) {
        logger.log(`  vias      ${net.vias.length}`);
      }
      if (net.zones.length > 0) {
        logger.log(`  zones     ${net.zones.map((z) => z.layers.join('+')).join(', ')}`);
      }
      if (net.route) {
        const r = net.route;
        const status = r.routed
          ? chalk.green('fully routed')
          : chalk.red(`${r.pinsConnected}/${r.pinsTotal} pins connected`);
        const detail: string[] = [];
        if (r.segments > 0) detail.push(`${r.segments} segments, ${r.length} mm on ${r.layers.join('+')}`);
        if (r.pourAssisted) detail.push('pour-assisted');
        logger.log(`  copper    ${status}${detail.length > 0 ? chalk.gray(` — ${detail.join(', ')}`) : ''}`);
        for (const group of r.disconnectedGroups) {
          logger.log(chalk.yellow(`    no copper path to: ${group.join(', ')}`));
        }
      }
      return;
    }

    case 'components': {
      if (json) {
        logger.log(
          JSON.stringify(
            model.components.map((c) => ({
              reference: c.reference,
              value: c.value,
              footprint: c.footprint,
              variable: c.variable,
              side: c.side,
              at: c.at,
              dimensions: c.dimensions,
              padCount: c.pads.length,
            })),
            null,
            2,
          ),
        );
        return;
      }
      printHeader(`Components (${model.components.length})`, pcbPath);
      for (const c of [...model.components].sort((a, b) =>
        a.reference.localeCompare(b.reference, undefined, { numeric: true }),
      )) {
        const v = c.variable ? chalk.gray(` (as ${c.variable})`) : '';
        const d = c.dimensions ? ` — ${c.dimensions.width} × ${c.dimensions.height} mm` : '';
        logger.log(`  ${chalk.white(c.reference.padEnd(6))} ${c.value.padEnd(14)} ${c.footprint}${v}`);
        logger.log(
          chalk.gray(`        at (${c.at.x}, ${c.at.y}) rot ${c.at.rotation} ${c.side} — ${c.pads.length} pads${d}`),
        );
      }
      return;
    }

    case 'component': {
      const ref = parsed.positional.find((p) => !p.endsWith('.kicad_pcb'));
      if (!ref) throw new Error('Reference required. Usage: typecad-pcb query component <ref>');
      const comp = findComponent(model, ref);
      if (!comp) {
        if (json) {
          logger.log(
            JSON.stringify(
              {
                error: true,
                message: `Component '${ref}' not found.`,
                code: 'COMPONENT_NOT_FOUND',
                available: model.components.map((c) => c.reference),
              },
              null,
              2,
            ),
          );
        } else {
          logger.error(chalk.red(`Component '${ref}' not found. Run 'typecad-pcb query components' to list them.`));
        }
        process.exit(1);
      }
      if (json) {
        logger.log(JSON.stringify(componentJson(comp), null, 2));
        return;
      }
      printHeader(`${comp.reference} — ${comp.value}`, pcbPath);
      logger.log(`  footprint   ${comp.footprint}`);
      if (comp.dimensions) {
        logger.log(`  dimensions  ${comp.dimensions.width} × ${comp.dimensions.height} mm`);
      }
      if (comp.variable) logger.log(`  source var  ${comp.variable}`);
      if (comp.source) logger.log(`  source loc  ${comp.source}`);
      logger.log(`  placement   (${comp.at.x}, ${comp.at.y}) rotation ${comp.at.rotation} — ${comp.side} side`);
      logger.log(`  pads:`);
      for (const p of comp.pads) {
        const net = p.net ? chalk.white(p.net) : chalk.yellow('(no net)');
        logger.log(`    ${p.pad.padEnd(6)} ${net.padEnd(16)} ${chalk.gray(p.type)}`);
      }
      return;
    }

    case 'unconnected': {
      const pads = unconnectedPads(model);
      const single = singlePinNets(model);
      if (json) {
        logger.log(JSON.stringify({ unconnectedPads: pads, singlePinNets: single.map((n) => n.name) }, null, 2));
        return;
      }
      printHeader('Unconnected', pcbPath);
      if (pads.length === 0 && single.length === 0) {
        logger.log(chalk.green('  Everything is connected.'));
        return;
      }
      if (pads.length > 0) {
        logger.log(chalk.yellow(`  Pads with no net (${pads.length}):`));
        for (const p of pads) logger.log(`    ${p.reference}.${p.pad}  ${chalk.gray(p.type)}`);
      }
      if (single.length > 0) {
        logger.log(chalk.yellow(`  Single-pin nets (${single.length}) — possibly forgotten connections:`));
        for (const n of single) logger.log(`    ${n.name} — ${n.pins[0] ?? 'no pins'}`);
      }
      return;
    }

    case 'power': {
      const powerNets = model.nets.filter(isPowerNet);
      if (json) {
        logger.log(JSON.stringify(powerNets.map(netSummaryJson), null, 2));
        return;
      }
      printHeader('Power', pcbPath);
      if (powerNets.length === 0) {
        logger.log(chalk.gray('  No power nets detected.'));
        return;
      }
      for (const net of powerNets) {
        logger.log(`  ${chalk.white(net.name)} — ${net.pins.length} pins, ${net.vias.length} vias`);
        if (net.zones.length > 0)
          logger.log(chalk.gray(`      pours: ${net.zones.map((z) => z.layers.join('+')).join(', ')}`));
        logger.log(chalk.gray(`      ${net.pins.join('  ')}`));
      }
      return;
    }

    case 'routes': {
      const name = parsed.positional.find((p) => !p.endsWith('.kicad_pcb'));
      let nets = model.nets;
      if (name) {
        const net = findNet(model, name);
        if (!net) {
          if (json) {
            logger.log(
              JSON.stringify(
                {
                  error: true,
                  message: `Net '${name}' not found.`,
                  code: 'NET_NOT_FOUND',
                  available: model.nets.map((n) => n.name),
                },
                null,
                2,
              ),
            );
          } else {
            logger.error(chalk.red(`Net '${name}' not found. Run 'typecad-pcb query nets' to list them.`));
          }
          process.exit(1);
        }
        nets = [net];
      }
      if (json) {
        logger.log(JSON.stringify(nets.map(routeJson), null, 2));
        return;
      }
      printHeader(name ? `Routing — ${name}` : 'Routing', pcbPath);
      const unroutedCount = nets.filter((n) => n.route && !n.route.routed).length;
      if (unroutedCount === 0) {
        logger.log(chalk.green(`  All nets fully routed (${nets.length}).`) + '\n');
      }
      for (const net of nets) {
        const r = net.route;
        if (!r) continue;
        const status = r.routed ? chalk.green('✓') : chalk.red('✖');
        const detail: string[] = [`${r.pinsConnected}/${r.pinsTotal} pins`];
        if (r.segments > 0) detail.push(`${r.segments} segments`, `${r.length} mm`, r.layers.join('+'));
        if (net.vias.length > 0) detail.push(`${net.vias.length} vias`);
        if (r.pourAssisted) detail.push('pour-assisted');
        logger.log(`  ${status} ${chalk.white(net.name.padEnd(14))} ${detail.join(', ')}`);
        for (const group of r.disconnectedGroups) {
          logger.log(chalk.yellow(`      no copper path to: ${group.join(', ')}`));
        }
      }
      return;
    }

    case 'zones': {
      if (json) {
        logger.log(
          JSON.stringify(
            model.zones.map((z) => ({
              net: z.netName,
              keepout: z.keepout,
              layers: z.layers,
              filled: z.filled,
              materialized: z.materialized,
              fillMode: z.fillMode,
              bbox: z.bbox,
            })),
            null,
            2,
          ),
        );
        return;
      }
      printHeader('Zones', pcbPath);
      const pours = model.zones.filter((z) => !z.keepout);
      const keepouts = model.zones.filter((z) => z.keepout);
      if (pours.length === 0 && keepouts.length === 0) {
        logger.log(chalk.gray('  No zones on this board.'));
        return;
      }
      if (pours.length > 0) {
        logger.log(chalk.white(`Copper pours (${pours.length})`));
        for (const z of pours) {
          const fill = z.materialized
            ? `filled${z.fillMode ? ` (${z.fillMode})` : ''}`
            : z.filled
              ? chalk.yellow('fill declared, no fill polygons — build with kicad-cli to materialize')
              : 'unfilled (declared)';
          logger.log(
            `  ${chalk.white(z.netName ?? '(unnamed)')}  ${z.layers.join('+')}  ${fill}  ${z.bbox.width} × ${z.bbox.height} mm at (${z.bbox.x}, ${z.bbox.y})`,
          );
        }
        logger.log('');
      }
      if (keepouts.length > 0) {
        logger.log(chalk.white(`Keepouts (${keepouts.length})`));
        for (const z of keepouts) {
          logger.log(
            `  ${chalk.white(z.layers.join('+'))}  ${z.bbox.width} × ${z.bbox.height} mm at (${z.bbox.x}, ${z.bbox.y})`,
          );
        }
      }
      return;
    }
  }
}
