export interface ComponentConfig {
    symbol: string;
    footprint: string;
    prefix: string;
}

export interface SizeConfig {
    Resistor: ComponentConfig;
    Capacitor: ComponentConfig;
    Inductor: ComponentConfig;
    Diode: ComponentConfig;
    LED: ComponentConfig;
    Fuse?: ComponentConfig;
}

export const sizes: Record<string, SizeConfig> = {
    '0201': {
        Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_0201_0603Metric', prefix: 'R' },
        Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_0201_0603Metric', prefix: 'C' },
        Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_0201_0603Metric', prefix: 'L' },
        Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_0201_0603Metric', prefix: 'D' },
        LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_0201_0603Metric', prefix: 'D' },
    },
    '0402': {
        Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_0402_1005Metric', prefix: 'R' },
        Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_0402_1005Metric', prefix: 'C' },
        Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_0402_1005Metric', prefix: 'L' },
        Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_0402_1005Metric', prefix: 'D' },
        LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_0402_1005Metric', prefix: 'D' },
    },
    '0603': {
        Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_0603_1608Metric', prefix: 'R' },
        Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_0603_1608Metric', prefix: 'C' },
        Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_0603_1608Metric', prefix: 'L' },
        Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_0603_1608Metric', prefix: 'D' },
        LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_0603_1608Metric', prefix: 'D' },
        Fuse: { symbol: 'Device:Fuse_Small', footprint: 'Fuse:Fuse_0603_1608Metric', prefix: 'F' },
    },
    '0805': {
        Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_0805_2012Metric', prefix: 'R' },
        Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_0805_2012Metric', prefix: 'C' },
        Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_0805_2012Metric', prefix: 'L' },
        Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_0805_2012Metric', prefix: 'D' },
        LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_0805_2012Metric', prefix: 'D' },
        Fuse: { symbol: 'Device:Fuse_Small', footprint: 'Fuse:Fuse_0805_2012Metric', prefix: 'F' },
    },
    '1206': {
        Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_1206_3216Metric', prefix: 'R' },
        Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_1206_3216Metric', prefix: 'C' },
        Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_1206_3216Metric', prefix: 'L' },
        Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_1206_3216Metric', prefix: 'D' },
        LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_1206_3216Metric', prefix: 'D' },
        Fuse: { symbol: 'Device:Fuse_Small', footprint: 'Fuse:Fuse_1206_3216Metric', prefix: 'F' },
    },
    '1210': {
        Resistor: { symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_1210_3225Metric', prefix: 'R' },
        Capacitor: { symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_1210_3225Metric', prefix: 'C' },
        Inductor: { symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_1210_3225Metric', prefix: 'L' },
        Diode: { symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_1210_3225Metric', prefix: 'D' },
        LED: { symbol: 'Device:LED_Small', footprint: 'LED_SMD:LED_1210_3225Metric', prefix: 'D' },
        Fuse: { symbol: 'Device:Fuse_Small', footprint: 'Fuse:Fuse_1210_3225Metric', prefix: 'F' },
    },
};
