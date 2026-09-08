import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerRouter,
  createRouter,
  getRegisteredRouters,
  getRouterGridConfigurator,
} from '../src/pcb/pcb_router_registry.js';
import { RoutingError } from '../src/utils/errors.js';

describe('pcb_router_registry', () => {
  beforeEach(() => {
    const routers = getRegisteredRouters();
    routers.forEach((name) => {
      registerRouter((reg) => {
        reg.register(name, () => ({}) as any);
      });
    });
  });

  it('should register and list a router', () => {
    registerRouter((reg) => {
      reg.register('test-algo', () => ({ routeNet: vi.fn() }) as any);
    });
    expect(getRegisteredRouters()).toContain('test-algo');
  });

  it('should throw RoutingError for unregistered algorithm', () => {
    expect(() => createRouter('nonexistent', {} as any, {})).toThrow(RoutingError);
  });

  it('should return undefined grid configurator for unregistered algorithm', () => {
    expect(getRouterGridConfigurator('nonexistent')).toBeUndefined();
  });
});
