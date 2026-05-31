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
export declare const sizes: Record<string, SizeConfig>;
