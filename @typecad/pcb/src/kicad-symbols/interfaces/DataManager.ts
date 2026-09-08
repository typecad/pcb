import { ComponentRecord } from '../types/index.js';

/**
 * Interface for the data management system that handles CSV data
 */
export interface DataManager {
  /**
   * Ensures data is available, downloading if necessary
   * @returns Promise that resolves when data is available
   */
  ensureDataAvailable(): Promise<void>;

  /**
   * Gets the parsed CSV data as component records
   * @returns Array of component records
   */
  getCsvData(): Promise<ComponentRecord[]>;

  /**
   * Checks if the data is stale and needs to be refreshed
   * @returns Promise that resolves to true if data is stale, false otherwise
   */
  isDataStale(): Promise<boolean>;
}
