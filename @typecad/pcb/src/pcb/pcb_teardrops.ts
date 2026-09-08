/**
 * Teardrops: reinforcement wedges at track-to-via junctions, plus the KiCad
 * teardrop tool configuration in the `.kicad_pro`.
 *
 * KiCad 10 stores teardrop settings under
 * `board.design_settings.teardrop_options` / `teardrop_parameters` in the
 * project file (shape mirrors the `one_hz.kicad_pro` fixture); typeCAD writes
 * them when `pcb.teardrops()` is called so boards open with the tool
 * preconfigured. For router-placed vias, typeCAD additionally generates the
 * teardrop geometry itself — two tapered side segments per junction,
 * electrically part of the net — so rebuilt boards carry real teardrops
 * without a KiCad round-trip.
 */

/** Options for `pcb.teardrops()`. */
export interface ITeardropsOptions {
  /** Enable teardrops. Default true (calling `teardrops()` opts in). */
  enabled?: boolean;
  /** Teardrops on via junctions — also generated as geometry by the autorouter. Default true. */
  vias?: boolean;
  /** Teardrops on through-hole pads (KiCad tool flag). Default true. */
  throughHolePads?: boolean;
  /** Teardrops on SMD pads (KiCad tool flag). Default true. */
  smdPads?: boolean;
  /** Teardrops on track ends (KiCad tool flag). Default false. */
  trackEnds?: boolean;
  /** Wedge profile: 'round' adds a curved mid segment, 'rect' is straight-sided. Default 'round'. */
  shape?: 'round' | 'rect';
  /** Maximum teardrop length in mm (KiCad `td_maxlen`). Default 1.0. */
  maxLength?: number;
  /** Maximum teardrop height in mm (KiCad `td_maxheight`). Default 2.0. */
  maxHeight?: number;
}

/** Resolved teardrop policy; `enabled: false` means no settings are written and no geometry is generated. */
export interface ITeardropPolicy {
  enabled: boolean;
  vias: boolean;
  throughHolePads: boolean;
  smdPads: boolean;
  trackEnds: boolean;
  shape: 'round' | 'rect';
  maxLength: number;
  maxHeight: number;
}

export const DEFAULT_TEARDROPS: ITeardropPolicy = {
  enabled: false,
  vias: true,
  throughHolePads: true,
  smdPads: true,
  trackEnds: false,
  shape: 'round',
  maxLength: 1.0,
  maxHeight: 2.0,
};

export function resolveTeardrops(options: ITeardropsOptions | undefined): ITeardropPolicy {
  const o = options ?? {};
  return {
    enabled: o.enabled ?? true,
    vias: o.vias ?? true,
    throughHolePads: o.throughHolePads ?? true,
    smdPads: o.smdPads ?? true,
    trackEnds: o.trackEnds ?? false,
    shape: o.shape === 'rect' ? 'rect' : 'round',
    maxLength: Number.isFinite(o.maxLength) && o.maxLength! > 0 ? o.maxLength! : DEFAULT_TEARDROPS.maxLength,
    maxHeight: Number.isFinite(o.maxHeight) && o.maxHeight! > 0 ? o.maxHeight! : DEFAULT_TEARDROPS.maxHeight,
  };
}

/**
 * Teardrop wedge geometry for one side of a junction.
 *
 * The wedge reinforces the joint between a circular pad (radius `padRadiusMm`)
 * and a track leaving it along the unit direction `dir`: side segments run
 * from the pad edge to the track point at distance `lengthMm`, tapering the
 * copper gradually. 'round' inserts a bulged mid segment per side.
 *
 * @returns Track segments `{start, end, width}` in mm.
 */
export function teardropWedge(
  center: { x: number; y: number },
  dir: { x: number; y: number },
  options: { padRadiusMm: number; trackWidthMm: number; lengthMm: number; shape: 'round' | 'rect' },
): Array<{ start: { x: number; y: number }; end: { x: number; y: number }; width: number }> {
  const len = Math.min(options.lengthMm, Math.max(0.2, options.padRadiusMm * 2));
  const r = options.padRadiusMm;
  const u = dir;
  const n = { x: -u.y, y: u.x };
  const tip = { x: center.x + u.x * len, y: center.y + u.y * len };
  const segments: Array<{ start: { x: number; y: number }; end: { x: number; y: number }; width: number }> = [];

  for (const side of [1, -1] as const) {
    const base = { x: center.x + n.x * r * side, y: center.y + n.y * r * side };
    if (options.shape === 'round') {
      // bulged midpoint: out along the normal less than the pad edge,
      // about halfway to the tip
      const mid = {
        x: center.x + u.x * len * 0.5 + n.x * r * 0.75 * side,
        y: center.y + u.y * len * 0.5 + n.y * r * 0.75 * side,
      };
      segments.push({ start: base, end: mid, width: options.trackWidthMm });
      segments.push({ start: mid, end: tip, width: options.trackWidthMm });
    } else {
      segments.push({ start: base, end: tip, width: options.trackWidthMm });
    }
  }
  return segments;
}

/** `board.design_settings.teardrop_options` array (fixture shape). */
export function teardropOptionsJson(policy: ITeardropPolicy): Array<Record<string, unknown>> {
  return [
    {
      td_onpthpad: policy.throughHolePads,
      td_onroundshapesonly: false,
      td_onsmdpad: policy.smdPads,
      td_ontrackend: policy.trackEnds,
      td_onvia: policy.vias,
    },
  ];
}

/** `board.design_settings.teardrop_parameters` array — one entry per KiCad target. */
export function teardropParametersJson(policy: ITeardropPolicy): Array<Record<string, unknown>> {
  const entry = (targetName: string) => ({
    td_allow_use_two_tracks: true,
    td_curve_segcount: policy.shape === 'round' ? 4 : 0,
    td_height_ratio: 1.0,
    td_length_ratio: 0.5,
    td_maxheight: policy.maxHeight,
    td_maxlen: policy.maxLength,
    td_on_pad_in_zone: false,
    td_target_name: targetName,
    td_width_to_size_filter_ratio: 0.9,
  });
  return [entry('td_round_shape'), entry('td_rect_shape'), entry('td_track_end')];
}
