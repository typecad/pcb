/**
 * Lookup tables for the built-in passive component factories.
 *
 * Every chip passive class (Resistor, Capacitor, ...) resolves its default
 * KiCad symbol/footprint from these tables via the `size` constructor
 * option; an explicit `footprint`/`symbol` always wins over the preset.
 */

/** Chip package sizes with preset symbol/footprint pairs. */
export type PassiveSize = '0201' | '0402' | '0603' | '0805' | '1206' | '1210';

/** Sizes that carry a Fuse preset (smaller chip sizes have none). */
export type FuseSize = '0603' | '0805' | '1206' | '1210';

/** Default size when a passive is constructed without `size`. */
export const PASSIVE_DEFAULT_SIZE: PassiveSize = '0603';

export interface PassiveConfigEntry {
  symbol: string;
  footprint: string;
}

export interface SizeConfig {
  Resistor: PassiveConfigEntry;
  Capacitor: PassiveConfigEntry;
  Inductor: PassiveConfigEntry;
  Diode: PassiveConfigEntry;
  LED: PassiveConfigEntry;
  Fuse?: PassiveConfigEntry;
}

export const sizes: Record<PassiveSize, SizeConfig> = {
  '0201': {
    Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_0201_0603Metric' },
    Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_0201_0603Metric' },
    Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_0201_0603Metric' },
    Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_0201_0603Metric' },
    LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_0201_0603Metric' },
  },
  '0402': {
    Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_0402_1005Metric' },
    Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_0402_1005Metric' },
    Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_0402_1005Metric' },
    Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_0402_1005Metric' },
    LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_0402_1005Metric' },
  },
  '0603': {
    Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_0603_1608Metric' },
    Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_0603_1608Metric' },
    Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_0603_1608Metric' },
    Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_0603_1608Metric' },
    LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_0603_1608Metric' },
    Fuse: { symbol: 'Device:Fuse_Small', footprint: 'Fuse:Fuse_0603_1608Metric' },
  },
  '0805': {
    Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_0805_2012Metric' },
    Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_0805_2012Metric' },
    Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_0805_2012Metric' },
    Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_0805_2012Metric' },
    LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_0805_2012Metric' },
    Fuse: { symbol: 'Device:Fuse_Small', footprint: 'Fuse:Fuse_0805_2012Metric' },
  },
  '1206': {
    Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_1206_3216Metric' },
    Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_1206_3216Metric' },
    Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_1206_3216Metric' },
    Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_1206_3216Metric' },
    LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_1206_3216Metric' },
    Fuse: { symbol: 'Device:Fuse_Small', footprint: 'Fuse:Fuse_1206_3216Metric' },
  },
  '1210': {
    Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_1210_3225Metric' },
    Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_1210_3225Metric' },
    Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_1210_3225Metric' },
    Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_1210_3225Metric' },
    LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_1210_3225Metric' },
    Fuse: { symbol: 'Device:Fuse_Small', footprint: 'Fuse:Fuse_1210_3225Metric' },
  },
};

/**
 * Curated connector series. Each entry templates the KiCad symbol and
 * footprint from the pin count, so `number` is the single source of truth
 * (writing the count into a footprint string by hand risks a mismatch).
 */
export type ConnectorSeries = 'pin-header' | 'JST-SH';

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

export const connectorSeries: Record<ConnectorSeries, (pinCount: number) => PassiveConfigEntry> = {
  'pin-header': (n) => ({
    symbol: `Connector:Conn_01x${pad2(n)}_Pin`,
    footprint: `Connector_PinHeader_2.54mm:PinHeader_1x${pad2(n)}_P2.54mm_Vertical`,
  }),
  'JST-SH': (n) => ({
    symbol: `Connector:Conn_01x${pad2(n)}_Pin`,
    footprint: `Connector_JST:JST_SH_SM${pad2(n)}B-SRSS-TB_1x${pad2(n)}-1MP_P1.00mm_Horizontal`,
  }),
};
