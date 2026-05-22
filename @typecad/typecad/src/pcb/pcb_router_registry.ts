import { RoutingGrid } from '../routing/shared/routing_grid.js';
import { RoutingError } from '../errors.js';

export interface IRouterContext {
    [key: string]: unknown;
}

export type RouterFactory = (grid: RoutingGrid, options: unknown) => IRouterContext;
export type RouterGridConfigurator = (context: IRouterContext) => void;

interface RouterRegistration {
    factory: RouterFactory;
    configureGrid?: RouterGridConfigurator;
}

const registry = new Map<string, RouterRegistration>();

export function registerRouter(
    registerFn: (
        registry: {
            register(
                name: string,
                factory: RouterFactory,
                options?: { configureGrid?: RouterGridConfigurator }
            ): void;
        },
        algorithm?: string
    ) => void
): void {
    const instanceRegistry = {
        register: (
            name: string,
            factory: RouterFactory,
            options?: { configureGrid?: RouterGridConfigurator }
        ) => {
            registry.set(name, {
                factory,
                configureGrid: options?.configureGrid
            });
        }
    };
    registerFn(instanceRegistry);
}

export function createRouter(name: string, grid: RoutingGrid, options: unknown): IRouterContext {
    const registration = registry.get(name);
    if (!registration) {
        throw new RoutingError(`Routing algorithm '${name}' is not registered with this PCB instance. Use typecad.registerRouter() first.`);
    }
    return registration.factory(grid, options);
}

export function getRouterGridConfigurator(name: string): RouterGridConfigurator | undefined {
    return registry.get(name)?.configureGrid;
}

export function getRegisteredRouters(): string[] {
    return Array.from(registry.keys());
}
