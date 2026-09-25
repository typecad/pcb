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
  /** real part of every variable, one entry per data point */
  values: Record<string, number[]>;
  /** imaginary part per variable — populated for complex (ac analysis) results */
  imaginary: Record<string, number[]>;
  /** signed conventional-current injection at each component pad, by net
   * (positive = current flows out of the pad into the net) — the per-pad
   * view of the solved device currents, for flow visualization */
  branches?: Record<string, Array<{ ref: string; pin: string; i: number }>>;

  /** first data point of a variable (operating-point semantics) */
  get(variableName: string): number;
  getVoltage(netName: string): number;
  getCurrent(reference: string): number;
  getPower(reference: string): number;
  /** full data column of a variable — every point of a sweep or transient */
  getWaveform(variableName: string): number[];
  /** value of a variable at a specific point index */
  getAt(variableName: string, index: number): number;
  /** magnitude of a complex variable (ac analysis); defaults to the last point */
  getMagnitude(variableName: string, index?: number): number;
  /** magnitude in dB, 20*log10(|value|); defaults to the last point */
  getDb(variableName: string, index?: number): number;
  /** phase in degrees of a complex variable (ac analysis); defaults to the last point */
  getPhaseDeg(variableName: string, index?: number): number;
}
