export interface Variable {
  index: number;
  name: string;
  type: string;
}

export interface NgspiceResult {
  title: string;
  date: string;
  command: string;
  plotname: string;
  flags: string[];
  numVariables: number;
  numPoints: number;
  variables: Variable[];
  values: Record<string, number[]>;

  get(variableName: string): number;
  getVoltage(netName: string): number;
  getCurrent(reference: string): number;
  getPower(reference: string): number;
}
