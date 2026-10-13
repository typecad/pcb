/**
 * Programmatic assembly-export core (the `export pos` / `export bom` /
 * `export assembly` commands are thin CLI wrappers around these). Reads a
 * .kicad_pcb, computes placement/BOM rows per a provider profile, writes
 * CSV artifacts — no kicad-cli involved.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { BoardModel } from '../cli/typecad/board_model.js';
import { buildBoardModel } from '../cli/typecad/board_model.js';
import { buildNetlistModel } from '../cli/diagnostics/netlist_model.js';
import type { NetlistModel } from '../cli/diagnostics/netlist_model.js';
import {
  BOM_PROFILES,
  PLACEMENT_PROFILES,
  type BomProfile,
  type CentroidMode,
  type PlacementProfile,
} from './profiles.js';
import {
  buildPlacementRows,
  renderPlacementCsv,
  type PlacementRow,
} from './centroid.js';
import { buildBomRows, renderBomCsv, type BomRow } from './bom.js';
import { renderOpenPnpBoardXml, mergeOpenPnpBoardXml } from './openpnp.js';
import { renderOpenPnpPackagesXml, renderOpenPnpPartsXml } from './openpnp_config.js';

export interface PlacementExportOptions {
  profileId?: string;
  side?: 'front' | 'back' | 'both';
  centroid?: CentroidMode;
  origin?: 'board' | 'aux';
  units?: 'mm' | 'in' | 'mils';
  decimals?: number;
  rotationDecimals?: number;
  rotationOffset?: number;
  bottomRotation?: number;
  /** Ref globs appended to the profile's own exclude list. */
  exclude?: string[];
  includeDnp?: boolean;
  /** Regenerate the OpenPnP board.xml from scratch, discarding edits made
   *  in OpenPnP (part associations, type=Ignore, enabled, comments). */
  freshBoardXml?: boolean;
  /** Merge source when the file on disk is about to be wiped (the assembly
   *  staging dir) — the board.xml text to preserve associations from. */
  existingBoardXml?: string;
  outputDir: string;
}

export interface PlacementExportResult {
  file: string;
  /** Native OpenPnP board file, written beside the CSV by profiles that
   *  carry boardXml (currently openpnp). */
  boardFile?: string;
  /** OpenPnP package definitions (footprints for bottom vision). */
  packagesFile?: string;
  /** OpenPnP part definitions matching the board's part-ids. */
  partsFile?: string;
  /** What the board.xml merge did — absent on a fresh write. */
  boardMerge?: {
    preserved: number;
    added: number;
    keptExisting: string[];
    dropped: string[];
  };
  profile: PlacementProfile;
  rows: PlacementRow[];
  skipped: { ref: string; reason: string }[];
  /** Resolved centroid datum + origin actually used (for logs/json). */
  centroid: CentroidMode;
  origin: 'board' | 'aux';
}

export interface BomExportOptions {
  profileId?: string;
  /** Placement profile family to fall back to (jlcpcb → the JLC BOM shape). */
  fallbackProfileId?: string;
  grouped?: boolean;
  exclude?: string[];
  outputDir: string;
}

export interface BomExportResult {
  file: string;
  profile: BomProfile;
  rows: BomRow[];
  skipped: { ref: string; reason: string }[];
  netlist: string | null;
}

/** Resolve + validate a placement profile id. */
export function resolvePlacementProfile(id: string | undefined): PlacementProfile {
  const key = id ?? 'generic';
  const profile = PLACEMENT_PROFILES[key];
  if (!profile) {
    throw new Error(
      `Unknown placement profile '${key}'. Available: ${Object.keys(PLACEMENT_PROFILES).join(', ')}`,
    );
  }
  return profile;
}

/** Resolve + validate a BOM profile id. An explicit id must name a BOM
 *  profile; the fallback (a placement profile's family) maps to its BOM
 *  shape when one exists and generic otherwise (openpnp/pcbway/seeed have
 *  no BOM shape of their own). */
export function resolveBomProfile(id: string | undefined, fallbackProfileId?: string): BomProfile {
  if (id && BOM_PROFILES[id] === undefined) {
    throw new Error(`Unknown BOM profile '${id}'. Available: ${Object.keys(BOM_PROFILES).join(', ')}`);
  }
  const key = id ?? fallbackProfileId ?? '';
  return BOM_PROFILES[key] ?? BOM_PROFILES.generic;
}

/** The netlist a build leaves beside the board, when present. */
export function loadNetlistBesideBoard(pcbPath: string): NetlistModel | null {
  const netPath = pcbPath.replace(/\.kicad_pcb$/i, '.net');
  try {
    return buildNetlistModel(netPath);
  } catch {
    return null;
  }
}

export function exportPlacement(
  board: BoardModel,
  opts: PlacementExportOptions,
): PlacementExportResult {
  const profile = resolvePlacementProfile(opts.profileId);
  const mode = opts.centroid ?? profile.centroid;
  const originMode = opts.origin ?? 'board';
  if (originMode === 'aux' && !board.auxOrigin) {
    throw new Error('--origin aux: this board has no aux (drill/place) origin');
  }
  const origin =
    originMode === 'aux' && board.auxOrigin ? board.auxOrigin : { x: 0, y: 0 };
  const exclude = [...profile.exclude, ...(opts.exclude ?? [])];

  const { rows, skipped } = buildPlacementRows(board.components, {
    mode,
    side: opts.side ?? 'both',
    origin,
    rotationOffset: (opts.rotationOffset ?? 0) + profile.rotationOffset,
    bottomRotation: (opts.bottomRotation ?? 0) + profile.bottomRotation,
    flipBottomX: profile.flipBottomX,
    mirrorBottomRotation: profile.mirrorBottomRotation,
    exclude,
    includeDnp: opts.includeDnp ?? profile.includeDnp,
    fiducials: profile.fiducials,
  });

  const csv = renderPlacementCsv(rows, profile, {
    units: opts.units,
    decimals: opts.decimals,
    rotationDecimals: opts.rotationDecimals,
  });

  const stem = path.basename(board.file, '.kicad_pcb');
  fs.mkdirSync(opts.outputDir, { recursive: true });
  const file = path.join(opts.outputDir, `${stem}${profile.fileSuffix}`);
  fs.writeFileSync(file, csv, 'utf8');

  let boardFile: string | undefined;
  let packagesFile: string | undefined;
  let partsFile: string | undefined;
  let boardMerge: PlacementExportResult['boardMerge'];
  if (profile.boardXml) {
    const boardXmlOpts = {
      name: stem,
      dimensions: board.summary.board
        ? {
            width: board.summary.board.maxX - board.summary.board.minX,
            height: board.summary.board.maxY - board.summary.board.minY,
          }
        : undefined,
      outline: board.outline,
      components: board.components,
    };
    boardFile = path.join(opts.outputDir, `${stem}.board.xml`);
    // A previous export (or an OpenPnP save) may carry work worth keeping:
    // part associations and per-placement settings. Geometry always follows
    // the board; the rest rides over unless --fresh-board.
    const existing =
      opts.existingBoardXml ??
      (opts.freshBoardXml === true ? null : (() => {
        try {
          return fs.readFileSync(boardFile!, 'utf8');
        } catch {
          return null;
        }
      })());
    if (existing !== null && existing !== undefined && existing !== '') {
      const merge = mergeOpenPnpBoardXml(
        rows,
        boardXmlOpts,
        existing,
        new Set(board.components.map((c) => c.reference)),
      );
      fs.writeFileSync(boardFile, merge.xml, 'utf8');
      boardMerge = {
        preserved: merge.preserved,
        added: merge.added,
        keptExisting: merge.keptExisting,
        dropped: merge.dropped,
      };
    } else {
      fs.writeFileSync(boardFile, renderOpenPnpBoardXml(rows, boardXmlOpts), 'utf8');
    }
    // package + part definitions the board's part-ids reference — pads for
    // bottom vision, body size from the fab outline
    packagesFile = path.join(opts.outputDir, `${stem}-packages.xml`);
    fs.writeFileSync(packagesFile, renderOpenPnpPackagesXml(board.components), 'utf8');
    partsFile = path.join(opts.outputDir, `${stem}-parts.xml`);
    fs.writeFileSync(partsFile, renderOpenPnpPartsXml(board.components), 'utf8');
  }

  return {
    file,
    boardFile,
    packagesFile,
    partsFile,
    boardMerge,
    profile,
    rows,
    skipped,
    centroid: mode,
    origin: originMode,
  };
}

export function exportBom(
  board: BoardModel,
  netlist: NetlistModel | null,
  opts: BomExportOptions,
): BomExportResult {
  const profile = resolveBomProfile(opts.profileId, opts.fallbackProfileId);
  const { rows, skipped } = buildBomRows(board.components, netlist, {
    grouped: opts.grouped ?? profile.grouped,
    exclude: [...profile.exclude, ...(opts.exclude ?? [])],
  });
  const csv = renderBomCsv(rows, profile);
  const stem = path.basename(board.file, '.kicad_pcb');
  fs.mkdirSync(opts.outputDir, { recursive: true });
  const file = path.join(opts.outputDir, `${stem}${profile.fileSuffix}`);
  fs.writeFileSync(file, csv, 'utf8');
  return {
    file,
    profile,
    rows,
    skipped,
    netlist: netlist ? netlist.file : null,
  };
}

export { zipStore, crc32 } from './zip.js';
export type { ZipEntry } from './zip.js';
export { PLACEMENT_PROFILES, BOM_PROFILES } from './profiles.js';
export { footprintLocalToBoard, componentCentroid, refMatches } from './centroid.js';
export { renderOpenPnpBoardXml, openPnpPartId, chainOutline } from './openpnp.js';
export { renderOpenPnpPackagesXml, renderOpenPnpPartsXml } from './openpnp_config.js';
