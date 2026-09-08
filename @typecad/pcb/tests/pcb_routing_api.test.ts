import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAutoroute } = vi.hoisted(() => ({
  mockAutoroute: vi.fn(() => ({ success: true, routeCount: 1, completedCount: 1, routeDetails: [] })),
}));

vi.mock('../src/pcb/pcb_routing_core.js', () => ({
  routeNet: vi.fn(() => ({ success: true, routeCount: 1, completedCount: 1, routeDetails: [] })),
}));

vi.mock('../src/pcb/pcb_autoroute.js', () => ({
  autoroute: mockAutoroute,
}));

vi.mock('../src/pcb/pcb_autoroute_batch.js', () => ({
  autorouteBatch: vi.fn(() => ({ results: [], success: true, rounds: 1 })),
}));

vi.mock('../src/utils/logging.js', () => {
  const m = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn(), success: vi.fn() };
  return { default: m, ...m };
});

describe('pcb_routing_api', () => {
  let pcbRoute: any;
  let pcbAutoroute: any;
  let pcbWaitForPendingAutoroutes: any;
  let pcbAutorouteBatch: any;
  let mockPcb: any;
  let mockState: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAutoroute.mockReturnValue({ success: true, routeCount: 1, completedCount: 1, routeDetails: [] });

    const mod = await import('../src/pcb/pcb_routing_api.js');
    pcbRoute = mod.pcbRoute;
    pcbAutoroute = mod.pcbAutoroute;
    pcbWaitForPendingAutoroutes = mod.pcbWaitForPendingAutoroutes;
    pcbAutorouteBatch = mod.pcbAutorouteBatch;

    mockPcb = {
      boardName: 'test',
      options: {},
      state: {},
      outlines: [],
      tracks: [],
      copper_thickness: 35,
      resolveNet: vi.fn(() => ({ found: false, netCode: 0, netName: '' })),
      route: vi.fn(() => ({ success: true, routeCount: 1, completedCount: 1, routeDetails: [] })),
    };

    mockState = {};
  });

  describe('pcbRoute', () => {
    it('should delegate to extractRouteNet when given a schematic net definition', async () => {
      const netDef = { name: 'VCC', pins: [] };
      const result = pcbRoute(mockPcb, mockState, netDef);
      expect(result.success).toBe(true);
    });

    it('should delegate to pcbAutoroute when given autoroute options', async () => {
      const { Pin } = await import('../src/pin.js');
      const fromPin = new Pin(1, 'R1');
      const toPin = new Pin(2, 'R1');
      const opts = { from: fromPin, to: toPin };
      const result = pcbRoute(mockPcb, mockState, opts);
      expect(result.success).toBe(true);
    });

    it('should log warning on incomplete route', async () => {
      mockAutoroute.mockReturnValue({
        success: false,
        routeCount: 2,
        completedCount: 1,
        routeDetails: [],
      });
      const { Pin } = await import('../src/pin.js');
      const fromPin = new Pin(1, 'R1');
      const toPin = new Pin(2, 'R1');
      const opts = { from: fromPin, to: toPin };
      pcbRoute(mockPcb, mockState, opts);
      const logger = await import('../src/utils/logging.js');
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('pcbAutoroute', () => {
    it('should call autoroute and return its result', async () => {
      const { Pin } = await import('../src/pin.js');
      const opts = { from: new Pin(1, 'R1'), to: new Pin(2, 'R1') };
      const result = pcbAutoroute(mockPcb, mockState, opts);
      expect(result.success).toBe(true);
      expect(mockAutoroute).toHaveBeenCalled();
    });
  });

  describe('pcbWaitForPendingAutoroutes', () => {
    it('should be callable without error', () => {
      pcbWaitForPendingAutoroutes(mockState);
      expect(true).toBe(true);
    });
  });

  describe('pcbAutorouteBatch', () => {
    it('should delegate to autorouteBatch', () => {
      const result = pcbAutorouteBatch(mockPcb, [], { rounds: 2 });
      expect(result.success).toBe(true);
      expect(result.rounds).toBe(1);
    });
  });
});
