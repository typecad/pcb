import type { ITextPositioning } from './pcb_interfaces.js';

export type TextString = string;
export type TextPositioning = ITextPositioning;
export type TextWithPositioning = [string | undefined | null, ITextPositioning];
export type TextOrPositioning = TextString | TextPositioning | TextWithPositioning;

export function parseTextOrPositioning(input: TextOrPositioning | undefined): {
  text: string | undefined;
  positioning: ITextPositioning | undefined;
} {
  if (input === undefined) {
    return { text: undefined, positioning: undefined };
  }
  if (Array.isArray(input)) {
    const [str, pos] = input;
    return { text: str && str !== '' ? str : undefined, positioning: pos };
  }
  if (typeof input === 'object') {
    return { text: undefined, positioning: input };
  }
  return { text: input, positioning: undefined };
}

/**
 * Names of footprint text properties. The conventional KiCad set is listed for
 * autocomplete; any other footprint-specific name is still accepted.
 */
export type FootprintPropertyName =
  'Reference' | 'Value' | 'Footprint' | 'Datasheet' | 'Description' | 'MPN' | (string & {});

export type TextEntry = {
  /** Which footprint property this entry controls. */
  property: FootprintPropertyName;
  /**
   * Replacement text. Omit to keep the property's own content (e.g. the
   * component's reference or the footprint's original value). Required when
   * creating a property the footprint does not have.
   */
  text?: string;
  /** Omitted fields keep the footprint's existing layout. */
  x?: number;
  y?: number;
  rotation?: number;
  layer?: string;
  font?: string;
  width?: number;
  height?: number;
  fontSize?: number;
  thickness?: number;
  bold?: boolean;
  italic?: boolean;
  justify?: { horizontal?: 'left' | 'right' | 'center'; vertical?: 'top' | 'bottom' | 'middle'; mirror?: boolean };
  show?: boolean;
};

export type FabEntry = {
  text: string;
  x?: number;
  y?: number;
  rotation?: number;
  layer?: string;
  font?: string;
  width?: number;
  height?: number;
  fontSize?: number;
  thickness?: number;
  bold?: boolean;
  italic?: boolean;
  justify?: { horizontal?: 'left' | 'right' | 'center'; vertical?: 'top' | 'bottom' | 'middle'; mirror?: boolean };
  show?: boolean;
};

export function applyTextPositioning(
  textEntries: TextEntry[],
  property: 'Reference' | 'Value',
  text: string,
  positioning: ITextPositioning | undefined,
): void {
  if (!positioning) return;

  const entry: TextEntry = {
    property,
    text,
    x: positioning.x,
    y: positioning.y,
    rotation: positioning.rotation,
    layer: positioning.layer,
    font: positioning.font,
    width: positioning.width,
    height: positioning.height,
    fontSize: positioning.fontSize,
    thickness: positioning.thickness,
    bold: positioning.bold,
    italic: positioning.italic,
    justify: positioning.justify,
    show: positioning.show,
  };

  const existingIndex = textEntries.findIndex((t) => t.property === property);
  if (existingIndex >= 0) {
    textEntries[existingIndex] = entry;
  } else {
    textEntries.push(entry);
  }
}

export type FabLayout = ITextPositioning & { text?: string };

export function parseFab(fab: TextPositioning | TextWithPositioning | undefined): FabEntry | undefined {
  if (fab == undefined) return undefined;

  let fabText: string;
  let fabPositioning: ITextPositioning;

  if (Array.isArray(fab)) {
    fabText = fab[0] || '${REFERENCE}';
    if (!fabText || fabText === '') fabText = '${REFERENCE}';
    fabPositioning = fab[1];
  } else {
    fabText = '${REFERENCE}';
    fabPositioning = fab;
  }

  return {
    text: fabText,
    x: fabPositioning.x,
    y: fabPositioning.y,
    rotation: fabPositioning.rotation,
    layer: fabPositioning.layer,
    width: fabPositioning.width,
    height: fabPositioning.height,
    fontSize: fabPositioning.fontSize,
    thickness: fabPositioning.thickness,
    bold: fabPositioning.bold,
    italic: fabPositioning.italic,
    justify: fabPositioning.justify,
    show: fabPositioning.show,
  };
}
