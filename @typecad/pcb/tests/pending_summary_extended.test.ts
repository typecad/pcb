import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setActiveSummaryHost,
  setupPendingSummary,
  setPendingSchematicPath,
  setPendingBoardFilePath,
  printTypecadOutputSummary,
} from '../src/cli/pending_summary.js';
import type { IPendingSummaryHost, PendingTypecadSummary } from '../src/cli/pending_summary.js';

describe('PendingSummary', () => {
  let host: IPendingSummaryHost;
  let data: PendingTypecadSummary | undefined;

  beforeEach(() => {
    data = undefined;
    host = {
      pendingSummaryData: () => data,
      setPendingSummaryData: (d) => {
        data = d;
      },
    };
    setActiveSummaryHost(host);
  });

  describe('setupPendingSummary', () => {
    it('should create summary data', () => {
      setupPendingSummary(host, 'test', './build/test.net');
      expect(data).toBeDefined();
      expect(data!.sheetName).toBe('test');
      expect(data!.netPath).toBe('./build/test.net');
      expect(data!.printed).toBe(false);
    });

    it('should set projectTree when provided', () => {
      setupPendingSummary(host, 'test', './build/test.net', 'tree content');
      expect(data!.projectTree).toBe('tree content');
    });

    it('should update existing data on subsequent calls', () => {
      setupPendingSummary(host, 'first', './build/first.net');
      setupPendingSummary(host, 'second', './build/second.net');
      expect(data!.sheetName).toBe('second');
      expect(data!.netPath).toBe('./build/second.net');
    });
  });

  describe('setPendingSchematicPath', () => {
    it('should update schPath on active data', () => {
      setupPendingSummary(host, 'test', './build/test.net');
      setPendingSchematicPath('./build/test.kicad_sch');
      expect(data!.schPath).toBe('./build/test.kicad_sch');
    });

    it('should do nothing when no active data', () => {
      setActiveSummaryHost(null);
      expect(() => setPendingSchematicPath('./test.kicad_sch')).not.toThrow();
    });
  });

  describe('setPendingBoardFilePath', () => {
    it('should update boardFilePath on active data', () => {
      setupPendingSummary(host, 'test', './build/test.net');
      setPendingBoardFilePath('./build/test.kicad_pcb');
      expect(data!.boardFilePath).toBe('./build/test.kicad_pcb');
    });
  });

  describe('printTypecadOutputSummary', () => {
    it('should return false when no data', () => {
      setActiveSummaryHost(null);
      expect(printTypecadOutputSummary()).toBe(false);
    });

    it('should return false when already printed', () => {
      setupPendingSummary(host, 'test', './build/test.net');
      data!.printed = true;
      expect(printTypecadOutputSummary()).toBe(false);
    });

    it('should mark as printed after printing', () => {
      setupPendingSummary(host, 'test', './build/test.net');
      const result = printTypecadOutputSummary();
      expect(result).toBe(true);
      expect(data!.printed).toBe(true);
    });

    it('should not print twice', () => {
      setupPendingSummary(host, 'test', './build/test.net');
      expect(printTypecadOutputSummary()).toBe(true);
      expect(printTypecadOutputSummary()).toBe(false);
    });
  });
});
