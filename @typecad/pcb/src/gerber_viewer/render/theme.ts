/**
 * PcbDraw-style flat-color themes for the PCBA image renderer. Every visual
 * role is a single fill color — the render is pure 2D (no lighting, no
 * perspective), so a theme is just the palette.
 */
export interface PcbaTheme {
  /** bare substrate (FR4) — visible through mask openings without copper */
  board: string;
  /** soldermask film — the dominant board surface */
  clad: string;
  /** soldermask where copper runs beneath it — the film is translucent in
   * reality, so traces/pours ghost through as a darker mask tone */
  maskCopper: string;
  /** copper under the mask — visible only where openings hit bare traces */
  copper: string;
  /** pad surface finish (ENIG gold, HASL silver, ...) */
  pads: string;
  /** silkscreen ink */
  silk: string;
  /** board outline stroke */
  outline: string;
  /** drilled holes */
  hole: string;
  /** component IC body */
  body: string;
  /** MLCC ceramic body (capacitor semantics) */
  bodyMlcc: string;
  /** axial through-hole resistor body — classic tan */
  bodyResistor: string;
  /** inductor / ferrite body */
  bodyInductor: string;
  /** trimmer potentiometer body — classic light blue */
  bodyTrimmer: string;
  /** diode cathode stripe */
  stripe: string;
  /** LED package tint */
  ledTint: string;
  /** crystal metal can */
  crystal: string;
  /** component lead / pad-lead metal */
  lead: string;
  /** pin-1 marker on component bodies */
  pin1: string;
  /** font-family for synthetic refdes labels (the board's own text arrives
   * vectorized in the gerbers; this styles OUR labels to match) */
  labelFont: string;
  /** refdes labels on components (default true) */
  labels?: boolean;
}

/**
 * The default palette — the physical-realism classic: green soldermask,
 * copper-tone ENIG pads, white silk. The house look lives on as the named
 * `typecad` builtin (`--theme typecad`).
 */
export const DEFAULT_PCBA_THEME: PcbaTheme = {
  board: '#285e3a',
  clad: '#1a7a44',
  maskCopper: '#0d5030',
  copper: '#b87333',
  pads: '#cf8a4d',
  silk: '#f2f2f2',
  outline: '#101418',
  hole: '#0c0f12',
  body: '#2b2f33',
  bodyMlcc: '#b7a487',
  bodyResistor: '#c9b790',
  bodyInductor: '#4a4e57',
  bodyTrimmer: '#7db8e8',
  stripe: '#d8d8d8',
  ledTint: '#d94a4a',
  crystal: '#b9bec4',
  lead: '#c8cdd2',
  pin1: '#d8dadf',
  labelFont: "'OCR A Std', 'Courier New', monospace",
};

/** Builtin themes, keyed by the `--theme` name. */
export const PCBA_THEMES: Record<string, PcbaTheme> = {
  'green-enig': DEFAULT_PCBA_THEME,
  typecad: {
    ...DEFAULT_PCBA_THEME,
    board: '#20565a',
    clad: '#115257',
    maskCopper: '#0b3d42',
    pads: '#d5ad62',
    silk: '#eef4ef',
    outline: '#0b2224',
    hole: '#091a1c',
    body: '#33383d',
    pin1: '#dfe2e6',
  },
  'purple-enig': {
    ...DEFAULT_PCBA_THEME,
    board: '#3a2a5c',
    clad: '#5e3d99',
    maskCopper: '#3f2770',
    pads: '#d0a94f',
    silk: '#efe9f7',
    outline: '#17131f',
  },
  'black-hasl': {
    ...DEFAULT_PCBA_THEME,
    board: '#1f1f22',
    clad: '#26262b',
    maskCopper: '#17171b',
    copper: '#9aa0a6',
    pads: '#c9ced4',
    silk: '#e8e8e8',
    outline: '#000000',
    hole: '#000000',
  },
  'blue-enig': {
    ...DEFAULT_PCBA_THEME,
    board: '#173a6b',
    clad: '#1d509e',
    maskCopper: '#123868',
    pads: '#c8a951',
    silk: '#eef2f8',
    outline: '#0d1522',
  },
  'red-enig': {
    ...DEFAULT_PCBA_THEME,
    board: '#5e2320',
    clad: '#8a2c28',
    maskCopper: '#5c1d1a',
    pads: '#d0a94f',
    outline: '#1c0b0a',
    hole: '#200d0c',
  },
  'white-hasl': {
    ...DEFAULT_PCBA_THEME,
    board: '#d8d8d0',
    clad: '#e9e9e2',
    maskCopper: '#c6c6bc',
    pads: '#c9ced4',
    silk: '#1c1c1c',
    outline: '#8a8a80',
    hole: '#9c9c92',
  },
  'yellow-hasl': {
    ...DEFAULT_PCBA_THEME,
    board: '#a38b20',
    clad: '#c7a92c',
    maskCopper: '#8a741c',
    pads: '#c9ced4',
    silk: '#1c1c1c',
    outline: '#4a3e10',
    hole: '#544612',
  },
  'oshpark-after-dark': {
    ...DEFAULT_PCBA_THEME,
    board: '#131318',
    clad: '#0b0b0e',
    maskCopper: '#33291a',
    pads: '#d4af5a',
    silk: '#e6e6e6',
    outline: '#000000',
    hole: '#000000',
  },
};

/** Friendly names for the theme picker, keyed like PCBA_THEMES. */
export const PCBA_THEME_LABELS: Record<string, string> = {
  'green-enig': 'Green ENIG',
  'red-enig': 'Red ENIG',
  'blue-enig': 'Blue ENIG',
  'purple-enig': 'Purple ENIG',
  'black-hasl': 'Black HASL',
  'white-hasl': 'White · black silk',
  'yellow-hasl': 'Yellow · black silk',
  'oshpark-after-dark': 'OSH Park After Dark',
  typecad: 'typeCAD house',
};

/** XML-escape a string that is about to land inside an SVG attribute. */
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * A theme is a partial palette over the defaults — unknown keys are kept
 * out. String fields are XML-escaped here (the one boundary user JSON
 * crosses): they land in SVG attributes unescaped elsewhere, so a crafted
 * theme file must not be able to inject markup into the output.
 */
export function mergeTheme(overrides: Partial<PcbaTheme>): PcbaTheme {
  const theme: PcbaTheme = { ...DEFAULT_PCBA_THEME };
  for (const key of Object.keys(theme) as Array<keyof PcbaTheme>) {
    if (key === 'labels') continue;
    const value = overrides[key];
    if (typeof value === 'string' && value.length > 0) theme[key] = escapeXml(value);
  }
  if (typeof overrides.labels === 'boolean') theme.labels = overrides.labels;
  return theme;
}
