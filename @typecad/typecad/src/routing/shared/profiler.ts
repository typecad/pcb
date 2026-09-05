import chalk from 'chalk';
import * as fs from 'fs';
import logger from '../../utils/logging.js';
import * as path from 'path';
import process from 'node:process';

interface MemoryUsage {
  rss: number; // Resident Set Size in bytes
  heapTotal: number; // Total size of the heap in bytes
  heapUsed: number; // Actual memory usage in bytes
  external: number; // Memory used by C++ objects
}

interface ProfileEntry {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  callCount: number;
  totalDuration: number;
  maxDuration: number;
  minDuration: number;
  parent?: string; // Parent function name for hierarchical profiling
  children: string[]; // Child function names
  memoryBefore?: MemoryUsage; // Memory usage before function execution
  memoryAfter?: MemoryUsage; // Memory usage after function execution
  memoryDelta?: MemoryUsage; // Memory change during execution
  maxMemoryDelta?: MemoryUsage; // Maximum memory change observed
}

interface PerformanceAlert {
  functionName: string;
  threshold: number;
  actualValue: number;
  alertType: 'execution_time' | 'memory_usage';
  timestamp: number;
}

interface Hotspot {
  functionName: string;
  impact: number; // Calculated impact score (0-100)
  totalDuration: number;
  callCount: number;
  averageDuration: number;
  percentageOfTotal: number;
}

interface BaselineEntry {
  functionName: string;
  averageDuration: number;
  totalDuration: number;
  callCount: number;
  timestamp: number;
}

interface RegressionReport {
  functionName: string;
  baselineAverage: number;
  currentAverage: number;
  regressionPercentage: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface ProfilerConfig {
  enableMemoryTracking: boolean;
  enableHierarchicalProfiling: boolean;
  enablePerformanceAlerts: boolean;
  executionTimeThreshold: number; // in milliseconds
  memoryThreshold: number; // in MB
  enableHotspotDetection: boolean;
  hotspotThreshold: number; // minimum impact score (0-100)
  enableRegressionDetection: boolean;
  baselineFile?: string; // Path to baseline data file
}

interface ProfileHierarchyNode {
  name: string;
  callCount: number;
  totalDuration: number;
  averageDuration: number;
  children: Record<string, ProfileHierarchyNode | null>;
  circular?: boolean;
  truncated?: boolean;
}

/**
 * Advanced performance profiler for timing function execution
 * Tracks call counts, total time, memory usage, hierarchical relationships, and performance metrics
 */
export class Profiler {
  private static instance: Profiler;
  private entries: Map<string, ProfileEntry> = new Map();
  private callStack: string[] = [];
  private enabled: boolean = false;
  private config: ProfilerConfig;
  private alerts: PerformanceAlert[] = [];
  private baselines: Map<string, BaselineEntry> = new Map();
  private baselineLoaded: boolean = false;
  private debug: boolean = false;

  private constructor() {
    // Default configuration
    this.config = {
      enableMemoryTracking: true,
      enableHierarchicalProfiling: true,
      enablePerformanceAlerts: true,
      executionTimeThreshold: 100, // 100ms
      memoryThreshold: 50, // 50MB
      enableHotspotDetection: true,
      hotspotThreshold: 10, // 10% impact threshold
      enableRegressionDetection: true,
      baselineFile: 'profiler_baseline.json',
    };
  }

  public static getInstance(): Profiler {
    if (!Profiler.instance) {
      Profiler.instance = new Profiler();
    }
    return Profiler.instance;
  }

  /**
   * Configure profiler settings
   * @param config - Configuration options
   */
  public configure(config: Partial<ProfilerConfig>): void {
    this.config = { ...this.config, ...config };

    // Load baseline data if regression detection is enabled and baseline file is specified
    if (this.config.enableRegressionDetection && this.config.baselineFile) {
      this.loadBaseline();
    }
  }

  /**
   * Set debug mode for controlling console output
   * @param debug - Whether to enable debug output
   */
  public setDebug(debug: boolean): void {
    this.debug = debug;
    if (debug) {
      this.enabled = true;
    }
  }

  /**
   * Get current debug mode
   */
  public getDebug(): boolean {
    return this.debug;
  }

  /**
   * Get current profiler configuration
   */
  public getConfig(): ProfilerConfig {
    return { ...this.config };
  }

  /**
   * Start timing a function
   * @param name - Name of the function being profiled
   */
  public start(name: string): void {
    if (!this.enabled) return;

    const entry = this.entries.get(name) || {
      name,
      startTime: 0,
      callCount: 0,
      totalDuration: 0,
      maxDuration: 0,
      minDuration: Infinity,
      children: [],
    };

    entry.startTime = performance.now();

    // Track memory usage if enabled
    if (this.config.enableMemoryTracking && process.memoryUsage) {
      entry.memoryBefore = process.memoryUsage();
    }

    // Set up hierarchical relationship
    if (this.config.enableHierarchicalProfiling && this.callStack.length > 0) {
      const parentName = this.callStack[this.callStack.length - 1];
      entry.parent = parentName;

      const parentEntry = this.entries.get(parentName);
      if (parentEntry && !parentEntry.children.includes(name)) {
        parentEntry.children.push(name);
      }
    }

    this.entries.set(name, entry);
    this.callStack.push(name);
  }

  /**
   * End timing a function
   * @param name - Name of the function being profiled
   */
  public end(name: string): void {
    if (!this.enabled) return;

    const entry = this.entries.get(name);
    if (!entry || entry.startTime === 0) {
      if (this.debug) logger.warn(chalk.yellow(`[Profiler] Warning: No start time found for '${name}'`));
      return;
    }

    const endTime = performance.now();
    const duration = endTime - entry.startTime;

    entry.endTime = endTime;
    entry.duration = duration;
    entry.callCount++;
    entry.totalDuration += duration;
    entry.maxDuration = Math.max(entry.maxDuration, duration);
    entry.minDuration = Math.min(entry.minDuration, duration);

    // Track memory usage if enabled
    if (this.config.enableMemoryTracking && process.memoryUsage) {
      entry.memoryAfter = process.memoryUsage();

      if (entry.memoryBefore && entry.memoryAfter) {
        entry.memoryDelta = {
          rss: entry.memoryAfter.rss - entry.memoryBefore.rss,
          heapTotal: entry.memoryAfter.heapTotal - entry.memoryBefore.heapTotal,
          heapUsed: entry.memoryAfter.heapUsed - entry.memoryBefore.heapUsed,
          external: entry.memoryAfter.external - entry.memoryBefore.external,
        };

        // Track maximum memory delta
        if (!entry.maxMemoryDelta || Math.abs(entry.memoryDelta.heapUsed) > Math.abs(entry.maxMemoryDelta.heapUsed)) {
          entry.maxMemoryDelta = { ...entry.memoryDelta };
        }
      }
    }

    // Remove from call stack
    const stackIndex = this.callStack.lastIndexOf(name);
    if (stackIndex !== -1) {
      this.callStack.splice(stackIndex, 1);
    }

    // Check for performance alerts
    if (this.config.enablePerformanceAlerts) {
      this.checkPerformanceAlerts(name, duration, entry.memoryDelta);
    }

    // Log immediate timing for long-running functions
    if (duration > this.config.executionTimeThreshold && this.debug) {
      logger.warn(chalk.yellow(`[Profiler] ${name} took ${duration.toFixed(2)}ms`));
    }
  }

  /**
   * Profile a function execution using a decorator pattern
   * @param name - Name to use for profiling
   * @param fn - Function to profile
   * @returns Wrapped function that will be profiled
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public profile<T extends (...args: any[]) => any>(name: string, fn: T): T {
    return ((...args: Parameters<T>) => {
      this.start(name);
      try {
        const result = fn(...args);
        // Handle async functions
        if (result && typeof result.then === 'function') {
          return result
            .then((value: unknown) => {
              this.end(name);
              return value;
            })
            .catch((error: unknown) => {
              this.end(name);
              throw error;
            });
        }
        // For synchronous functions, end timing here
        this.end(name);
        return result;
      } catch (error) {
        this.end(name);
        throw error;
      }
    }) as T;
  }

  /**
   * Print profiling results to console
   */
  public printResults(): void {
    if (!this.enabled || this.entries.size === 0 || !this.debug) return;

    logger.debug(chalk.bold.blue('\n=== PERFORMANCE PROFILING RESULTS ==='));

    // Sort by total time descending
    const sortedEntries = Array.from(this.entries.values())
      .filter((entry) => entry.callCount > 0)
      .sort((a, b) => b.totalDuration - a.totalDuration);

    if (sortedEntries.length === 0) {
      logger.debug(chalk.gray('No profiling data available'));
      return;
    }

    // Calculate totals
    const totalTime = sortedEntries.reduce((sum, entry) => sum + entry.totalDuration, 0);
    const totalCalls = sortedEntries.reduce((sum, entry) => sum + entry.callCount, 0);

    logger.debug(chalk.bold(`Total execution time: ${totalTime.toFixed(2)}ms`));
    logger.debug(chalk.bold(`Total function calls: ${totalCalls}`));
    logger.debug('');

    // Table header
    logger.debug(
      chalk.bold(
        'Function'.padEnd(35) +
          'Calls'.padEnd(8) +
          'Total (ms)'.padEnd(12) +
          'Avg (ms)'.padEnd(10) +
          'Max (ms)'.padEnd(10) +
          'Min (ms)'.padEnd(10) +
          '% Total',
      ),
    );
    logger.debug('-'.repeat(95));

    // Table rows
    sortedEntries.forEach((entry) => {
      const avgDuration = entry.totalDuration / entry.callCount;
      const percentTotal = (entry.totalDuration / totalTime) * 100;

      // Color code based on performance impact
      let nameColor = chalk.white;
      if (percentTotal > 20) nameColor = chalk.red;
      else if (percentTotal > 10) nameColor = chalk.yellow;
      else if (percentTotal > 5) nameColor = chalk.blue;

      logger.debug(
        nameColor(entry.name.padEnd(35)) +
          chalk.white(entry.callCount.toString().padEnd(8)) +
          chalk.white(entry.totalDuration.toFixed(2).padEnd(12)) +
          chalk.white(avgDuration.toFixed(2).padEnd(10)) +
          chalk.white(entry.maxDuration.toFixed(2).padEnd(10)) +
          chalk.white(entry.minDuration.toFixed(2).padEnd(10)) +
          chalk.gray(percentTotal.toFixed(1).padEnd(8) + '%'),
      );
    });

    logger.debug('-'.repeat(95));
    logger.debug('');

    // Print performance alerts if any
    if (this.config.enablePerformanceAlerts && this.alerts.length > 0) {
      this.printAlerts();
    }

    // Print hotspots if enabled
    if (this.config.enableHotspotDetection) {
      this.printHotspots();
    }

    // Print regression report if enabled
    if (this.config.enableRegressionDetection) {
      this.printRegressionReport();
    }
  }

  /**
   * Export profiling data to JSON format
   * @param filePath - Path to save the export file
   */
  public exportToJSON(filePath: string): void {
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        config: this.config,
        entries: Array.from(this.entries.values()),
        alerts: this.alerts,
        hotspots: this.detectHotspots(),
        regressionReport: this.detectRegressions(),
      };

      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
      if (this.debug) logger.debug(chalk.green(`[Profiler] Data exported to ${filePath}`));
    } catch (error) {
      if (this.debug) logger.error(chalk.red(`[Profiler] Error exporting to JSON: ${error}`));
    }
  }

  /**
   * Export profiling data to CSV format
   * @param filePath - Path to save the export file
   */
  public exportToCSV(filePath: string): void {
    try {
      const entries = Array.from(this.entries.values())
        .filter((entry) => entry.callCount > 0)
        .sort((a, b) => b.totalDuration - a.totalDuration);

      const headers = [
        'Function',
        'Calls',
        'Total Duration (ms)',
        'Average Duration (ms)',
        'Max Duration (ms)',
        'Min Duration (ms)',
        'Parent',
        'Children',
        'Memory Delta (MB)',
        'Max Memory Delta (MB)',
      ];

      const rows = entries.map((entry) => {
        const avgDuration = entry.totalDuration / entry.callCount;
        const memoryDeltaMB = entry.memoryDelta ? (entry.memoryDelta.heapUsed / 1024 / 1024).toFixed(2) : 'N/A';
        const maxMemoryDeltaMB = entry.maxMemoryDelta
          ? (entry.maxMemoryDelta.heapUsed / 1024 / 1024).toFixed(2)
          : 'N/A';

        return [
          entry.name,
          entry.callCount.toString(),
          entry.totalDuration.toFixed(2),
          avgDuration.toFixed(2),
          entry.maxDuration.toFixed(2),
          entry.minDuration.toFixed(2),
          entry.parent || 'N/A',
          entry.children.join(';'),
          memoryDeltaMB,
          maxMemoryDeltaMB,
        ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      fs.writeFileSync(filePath, csvContent);
      if (this.debug) logger.debug(chalk.green(`[Profiler] Data exported to ${filePath}`));
    } catch (error) {
      if (this.debug) logger.error(chalk.red(`[Profiler] Error exporting to CSV: ${error}`));
    }
  }

  /**
   * Save current performance data as baseline for regression detection
   * @param filePath - Optional custom path for baseline file
   */
  public saveBaseline(filePath?: string): void {
    try {
      const baselinePath = filePath || this.config.baselineFile || 'profiler_baseline.json';
      const baselineData: BaselineEntry[] = [];

      this.entries.forEach((entry, name) => {
        if (entry.callCount > 0) {
          baselineData.push({
            functionName: name,
            averageDuration: entry.totalDuration / entry.callCount,
            totalDuration: entry.totalDuration,
            callCount: entry.callCount,
            timestamp: Date.now(),
          });
        }
      });

      fs.writeFileSync(baselinePath, JSON.stringify(baselineData, null, 2));
      if (this.debug) logger.debug(chalk.green(`[Profiler] Baseline saved to ${baselinePath}`));
    } catch (error) {
      if (this.debug) logger.error(chalk.red(`[Profiler] Error saving baseline: ${error}`));
    }
  }

  /**
   * Load baseline data for regression detection
   */
  private loadBaseline(): void {
    if (this.baselineLoaded || !this.config.baselineFile) return;

    try {
      if (fs.existsSync(this.config.baselineFile)) {
        const baselineData = JSON.parse(fs.readFileSync(this.config.baselineFile, 'utf8')) as BaselineEntry[];
        baselineData.forEach((entry) => {
          this.baselines.set(entry.functionName, entry);
        });
        this.baselineLoaded = true;
        if (this.debug) logger.debug(chalk.green(`[Profiler] Baseline loaded from ${this.config.baselineFile}`));
      }
    } catch (error) {
      if (this.debug) logger.error(chalk.red(`[Profiler] Error loading baseline: ${error}`));
    }
  }

  /**
   * Check for performance alerts based on configured thresholds
   */
  private checkPerformanceAlerts(functionName: string, duration: number, memoryDelta?: MemoryUsage): void {
    // Check execution time threshold
    if (duration > this.config.executionTimeThreshold) {
      this.alerts.push({
        functionName,
        threshold: this.config.executionTimeThreshold,
        actualValue: duration,
        alertType: 'execution_time',
        timestamp: Date.now(),
      });
    }

    // Check memory threshold
    if (memoryDelta && this.config.enableMemoryTracking) {
      const memoryDeltaMB = memoryDelta.heapUsed / 1024 / 1024;
      if (Math.abs(memoryDeltaMB) > this.config.memoryThreshold) {
        this.alerts.push({
          functionName,
          threshold: this.config.memoryThreshold,
          actualValue: Math.abs(memoryDeltaMB),
          alertType: 'memory_usage',
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Detect performance hotspots based on execution time and call frequency
   */
  private detectHotspots(): Hotspot[] {
    const hotspots: Hotspot[] = [];
    const totalTime = Array.from(this.entries.values()).reduce((sum, entry) => sum + entry.totalDuration, 0);

    this.entries.forEach((entry, name) => {
      if (entry.callCount === 0) return;

      const averageDuration = entry.totalDuration / entry.callCount;
      const percentageOfTotal = (entry.totalDuration / totalTime) * 100;

      // Calculate impact score (0-100)
      const impact = Math.min(100, percentageOfTotal * 2 + entry.callCount / 10);

      if (impact >= this.config.hotspotThreshold) {
        hotspots.push({
          functionName: name,
          impact,
          totalDuration: entry.totalDuration,
          callCount: entry.callCount,
          averageDuration,
          percentageOfTotal,
        });
      }
    });

    return hotspots.sort((a, b) => b.impact - a.impact);
  }

  /**
   * Detect performance regressions by comparing current data with baseline
   */
  private detectRegressions(): RegressionReport[] {
    const regressions: RegressionReport[] = [];

    if (!this.baselineLoaded) return regressions;

    this.entries.forEach((entry, name) => {
      if (entry.callCount === 0) return;

      const baseline = this.baselines.get(name);
      if (!baseline) return;

      const currentAverage = entry.totalDuration / entry.callCount;
      const regressionPercentage = ((currentAverage - baseline.averageDuration) / baseline.averageDuration) * 100;

      if (regressionPercentage > 10) {
        // 10% regression threshold
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
        if (regressionPercentage > 50) severity = 'critical';
        else if (regressionPercentage > 30) severity = 'high';
        else if (regressionPercentage > 20) severity = 'medium';

        regressions.push({
          functionName: name,
          baselineAverage: baseline.averageDuration,
          currentAverage,
          regressionPercentage,
          severity,
        });
      }
    });

    return regressions.sort((a, b) => b.regressionPercentage - a.regressionPercentage);
  }

  /**
   * Print performance alerts
   */
  private printAlerts(): void {
    if (!this.debug) return;

    logger.debug(chalk.bold.red('\n=== PERFORMANCE ALERTS ==='));

    this.alerts.forEach((alert) => {
      const alertType = alert.alertType === 'execution_time' ? 'Execution Time' : 'Memory Usage';
      const unit = alert.alertType === 'execution_time' ? 'ms' : 'MB';

      logger.debug(
        chalk.red(
          `${alertType} Alert: ${alert.functionName} - ` +
            `${alert.actualValue.toFixed(2)}${unit} (threshold: ${alert.threshold}${unit})`,
        ),
      );
    });
    logger.debug('');
  }

  /**
   * Print detected hotspots
   */
  private printHotspots(): void {
    if (!this.debug) return;

    const hotspots = this.detectHotspots();

    if (hotspots.length === 0) return;

    logger.debug(chalk.bold.yellow('\n=== PERFORMANCE HOTSPOTS ==='));

    hotspots.forEach((hotspot) => {
      const impactColor = hotspot.impact > 50 ? chalk.red : hotspot.impact > 30 ? chalk.yellow : chalk.white;

      logger.debug(
        impactColor(`Impact: ${hotspot.impact.toFixed(1)}% - ${hotspot.functionName}`) +
          chalk.gray(` (${hotspot.totalDuration.toFixed(2)}ms total, `) +
          chalk.gray(`${hotspot.callCount} calls, `) +
          chalk.gray(`${hotspot.averageDuration.toFixed(2)}ms avg, `) +
          chalk.gray(`${hotspot.percentageOfTotal.toFixed(1)}% of total)`),
      );
    });
    logger.debug('');
  }

  /**
   * Print regression report
   */
  private printRegressionReport(): void {
    if (!this.debug) return;

    const regressions = this.detectRegressions();

    if (regressions.length === 0) return;

    logger.debug(chalk.bold.magenta('\n=== PERFORMANCE REGRESSIONS ==='));

    regressions.forEach((regression) => {
      const severityColor =
        regression.severity === 'critical'
          ? chalk.red
          : regression.severity === 'high'
            ? chalk.magenta
            : regression.severity === 'medium'
              ? chalk.yellow
              : chalk.white;

      logger.debug(
        severityColor(`${regression.severity.toUpperCase()}: ${regression.functionName}`) +
          chalk.gray(` - ${regression.regressionPercentage.toFixed(1)}% slower`) +
          chalk.gray(` (baseline: ${regression.baselineAverage.toFixed(2)}ms, `) +
          chalk.gray(`current: ${regression.currentAverage.toFixed(2)}ms)`),
      );
    });
    logger.debug('');
  }

  /**
   * Get hierarchical view of function calls
   */
  public getHierarchicalView(): Record<string, ProfileHierarchyNode | null> {
    const hierarchy: Record<string, ProfileHierarchyNode | null> = {};

    this.entries.forEach((entry, name) => {
      if (!entry.parent) {
        hierarchy[name] = this.buildsubtree(name);
      }
    });

    return hierarchy;
  }

  /**
   * Build subtree for hierarchical view
   */
  private buildsubtree(name: string, visited: Set<string> = new Set(), depth: number = 0): ProfileHierarchyNode | null {
    const entry = this.entries.get(name);
    if (!entry) return null;

    const node: ProfileHierarchyNode = {
      name,
      callCount: entry.callCount,
      totalDuration: entry.totalDuration,
      averageDuration: entry.totalDuration / entry.callCount,
      children: {},
    };

    // Prevent cycles from causing infinite recursion by tracking visited nodes
    if (visited.has(name)) {
      // Already visited in this path; mark as circular and stop recursion
      return { ...node, circular: true };
    }

    // Depth guard to avoid pathological cases
    const MAX_HIERARCHY_DEPTH = 128;
    if (depth >= MAX_HIERARCHY_DEPTH) {
      return { ...node, truncated: true };
    }

    visited.add(name);
    entry.children.forEach((childName) => {
      node.children[childName] = this.buildsubtree(childName, visited, depth + 1);
    });
    visited.delete(name);

    return node;
  }

  /**
   * Print hierarchical view of function calls
   */
  public printHierarchicalView(): void {
    if (!this.config.enableHierarchicalProfiling) {
      if (this.debug) logger.debug(chalk.yellow('Hierarchical profiling is disabled'));
      return;
    }

    if (!this.debug) return;

    const hierarchy = this.getHierarchicalView();
    logger.debug(chalk.bold.blue('\n=== HIERARCHICAL PROFILING VIEW ==='));
    logger.debug(JSON.stringify(hierarchy, null, 2));
    logger.debug('');
  }

  /**
   * Get memory usage statistics
   */
  public getMemoryStats(): { [key: string]: MemoryUsage } {
    const stats: { [key: string]: MemoryUsage } = {};

    this.entries.forEach((entry, name) => {
      if (entry.memoryDelta) {
        stats[name] = entry.memoryDelta;
      }
    });

    return stats;
  }

  /**
   * Get performance alerts
   */
  public getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  /**
   * Get detected hotspots
   */
  public getHotspots(): Hotspot[] {
    return this.detectHotspots();
  }

  /**
   * Get regression report
   */
  public getRegressionReport(): RegressionReport[] {
    return this.detectRegressions();
  }

  /**
   * Clear all alerts
   */
  public clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Reset all profiling data
   */
  public reset(): void {
    this.entries.clear();
    this.callStack = [];
    this.alerts = [];
  }

  /**
   * Enable or disable profiling
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if profiling is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current call stack (for debugging)
   */
  public getCallStack(): string[] {
    return [...this.callStack];
  }

  /**
   * Get all profiling entries
   */
  public getEntries(): Map<string, ProfileEntry> {
    return new Map(this.entries);
  }
}

// Export singleton instance for easy use
export const profiler = Profiler.getInstance();
