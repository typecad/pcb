import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/routing/shared/pad_resolver.js', () => ({
  PadResolver: {
    getPadCenter: vi.fn(() => ({ x: 0, y: 0 })),
  },
}));

describe('pcb_autoroute_batch', () => {
  it('should return success with default options', async () => {
    const { autorouteBatch } = await import('../src/pcb/pcb_autoroute_batch.js');
    const mockPcb = {
      _state: { stagedOutlines: [] },
      route: vi.fn(() => ({ success: true, routeCount: 1, completedCount: 1, routeDetails: [] }) as any),
    };
    const { Pin } = await import('../src/pin.js');
    const items = [{ from: new Pin(1, 'R1'), to: new Pin(2, 'R1') }];
    const result = autorouteBatch(mockPcb as any, items);
    expect(result.success).toBe(true);
    // rounds reports rounds actually executed, not the configured maximum
    expect(result.rounds).toBe(1);
    // per-item results are always present and parallel to items
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });

  it('should retry after failure', async () => {
    const { autorouteBatch } = await import('../src/pcb/pcb_autoroute_batch.js');
    let callCount = 0;
    const mockPcb = {
      _state: { stagedOutlines: [] },
      route: vi.fn(() => {
        callCount++;
        if (callCount < 3) {
          return { success: false, routeCount: 1, completedCount: 0, routeDetails: [] } as any;
        }
        return { success: true, routeCount: 1, completedCount: 1, routeDetails: [] } as any;
      }),
    };
    const { Pin } = await import('../src/pin.js');
    const items = [{ from: new Pin(1, 'R1'), to: new Pin(2, 'R1') }];
    const result = autorouteBatch(mockPcb as any, items, { rounds: 5 });
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  it('should fail after exhausting rounds', async () => {
    const { autorouteBatch } = await import('../src/pcb/pcb_autoroute_batch.js');
    const mockPcb = {
      _state: { stagedOutlines: [] },
      route: vi.fn(() => ({ success: false, routeCount: 1, completedCount: 0, routeDetails: [] }) as any),
    };
    const { Pin } = await import('../src/pin.js');
    const items = [{ from: new Pin(1, 'R1'), to: new Pin(2, 'R1') }];
    const result = autorouteBatch(mockPcb as any, items, { rounds: 2 });
    expect(result.success).toBe(false);
    // unrouted items return a failed result instead of being dropped
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    expect(result.rounds).toBe(2);
  });

  it('should skip already completed items', async () => {
    const { autorouteBatch } = await import('../src/pcb/pcb_autoroute_batch.js');
    let callCount = 0;
    const mockPcb = {
      _state: { stagedOutlines: [] },
      route: vi.fn(() => {
        callCount++;
        return { success: true, routeCount: 1, completedCount: 1, routeDetails: [] } as any;
      }),
    };
    const { Pin } = await import('../src/pin.js');
    const items = [
      { from: new Pin(1, 'R1'), to: new Pin(2, 'R1') },
      { from: new Pin(1, 'R2'), to: new Pin(2, 'R2') },
    ];
    const result = autorouteBatch(mockPcb as any, items, { rounds: 3 });
    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
  });

  it('should handle reverse reorder', async () => {
    const { autorouteBatch } = await import('../src/pcb/pcb_autoroute_batch.js');
    const mockPcb = {
      _state: { stagedOutlines: [] },
      route: vi.fn(() => ({ success: true, routeCount: 1, completedCount: 1, routeDetails: [] }) as any),
    };
    const { Pin } = await import('../src/pin.js');
    const items = [
      { from: new Pin(1, 'R1'), to: new Pin(2, 'R1') },
      { from: new Pin(1, 'R2'), to: new Pin(2, 'R2') },
    ];
    const result = autorouteBatch(mockPcb as any, items, { reorder: 'reverse', rounds: 1 });
    expect(result.success).toBe(true);
  });

  it('should handle none reorder', async () => {
    const { autorouteBatch } = await import('../src/pcb/pcb_autoroute_batch.js');
    const mockPcb = {
      _state: { stagedOutlines: [] },
      route: vi.fn(() => ({ success: true, routeCount: 1, completedCount: 1, routeDetails: [] }) as any),
    };
    const { Pin } = await import('../src/pin.js');
    const items = [
      { from: new Pin(1, 'R1'), to: new Pin(2, 'R1') },
      { from: new Pin(1, 'R2'), to: new Pin(2, 'R2') },
    ];
    const result = autorouteBatch(mockPcb as any, items, { reorder: 'none', rounds: 1 });
    expect(result.success).toBe(true);
  });

  it('should rip up non-preserved tracks on retry', async () => {
    const { autorouteBatch } = await import('../src/pcb/pcb_autoroute_batch.js');
    const stagedOutlines: any[] = ['preserved'];
    const mockPcb = {
      _state: { stagedOutlines },
      route: vi.fn(() => ({ success: false, routeCount: 1, completedCount: 0, routeDetails: [] }) as any),
    };
    const { Pin } = await import('../src/pin.js');
    const items = [{ from: new Pin(1, 'R1'), to: new Pin(2, 'R1') }];
    autorouteBatch(mockPcb as any, items, { rounds: 2 });
    expect(stagedOutlines.length).toBe(1);
    expect(stagedOutlines[0]).toBe('preserved');
  });
});
