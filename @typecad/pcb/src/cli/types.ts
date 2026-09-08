export interface CliPinInfo {
  type: string;
  name: string;
  number: string | number;
}

export interface ErcViolation {
  severity?: string;
  type?: string;
  description?: string;
  items?: Array<{ description?: string; pos?: { x: number; y: number } }>;
}

export interface ProjectAnswers {
  name: string;
  pio: boolean;
  board: string;
  git: boolean;
}

export interface SymbolData {
  symbol: string;
  name: string;
  pins: CliPinInfo[];
  symbol_path?: string;
  footprint_recommendation?: string;
  convertedComponent?: unknown;
  c_component?: unknown;
  prettyFolder?: string;
  cleanup?: () => void;
}

export interface FootprintData {
  footprint: string;
  footprint_path?: string;
  cleanup?: () => void;
}

export interface ComponentRenderData {
  name?: string;
  pins: CliPinInfo[];
  footprint: string;
  symbol: string;
  symbol_path?: string;
  footprint_path?: string;
  folder?: string;
}

export interface PackageComponentRenderData extends ComponentRenderData {
  component_name: string;
  package_name: string;
}

export interface PackageRenderData {
  package_name: string;
  package_name_pascal?: string;
  component_name?: string;
  folder: string;
}

export type CliArgs = Record<string, string | boolean | undefined>;
