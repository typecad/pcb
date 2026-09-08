import { parentPort } from 'worker_threads';
import logger from '../../utils/logging.js';
import type { IRoutingObstacle } from '../shared/routing_grid.js';
import type { IRoutePath, IRoutingOptions, RouteEndpoint } from './types.js';

const DEBUG_ENABLED = Boolean(process.env.TYPECAD_DEBUG && process.env.TYPECAD_DEBUG === '1');

interface SegmentWorkerPayload {
  taskId: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  resolution: number;
  layers: string[];
  obstacles?: IRoutingObstacle[];
  start: RouteEndpoint;
  end: RouteEndpoint;
  options: IRoutingOptions;
}

interface RoutingGridInstanceLike {
  addObstacle(obstacle: IRoutingObstacle): void;
}

interface RoutingGridConstructorLike {
  new (
    bounds: SegmentWorkerPayload['bounds'],
    resolution: number,
    layers: string[],
    debug?: boolean,
  ): RoutingGridInstanceLike;
}

interface RoutingGridModuleLike {
  RoutingGrid: RoutingGridConstructorLike;
}

interface AStarRouterInstanceLike {
  routeSegment(start: RouteEndpoint, end: RouteEndpoint): IRoutePath;
}

interface AStarRouterConstructorLike {
  new (grid: RoutingGridInstanceLike, options: IRoutingOptions): AStarRouterInstanceLike;
}

interface AStarRouterModuleLike {
  AStarRouter?: AStarRouterConstructorLike;
  default?: {
    AStarRouter?: AStarRouterConstructorLike;
  };
}

// This worker will be run from the built dist directory and therefore will import runtime
// modules from the installed host packages. To avoid TypeScript "cannot find module"
// problems, use dynamic import() here at runtime.

// The worker expects a message payload with:
// { taskId, bounds, resolution, layers, obstacles, start, end, options }

parentPort?.on('message', async (payload: SegmentWorkerPayload) => {
  const { taskId, bounds, resolution, layers, obstacles, start, end, options } = payload;

  // DEBUG: Log received payload (only when TYPECAD_DEBUG=1)
  if (DEBUG_ENABLED) {
    logger.debug(`[segment_worker] Task ${taskId}: layers=${JSON.stringify(layers)}, resolution=${resolution}`);
    logger.debug(`[segment_worker] Task ${taskId}: start=${JSON.stringify(start)}, end=${JSON.stringify(end)}`);
    logger.debug(
      `[segment_worker] Task ${taskId}: bounds=${JSON.stringify(bounds)}, obstacles=${(obstacles || []).length}`,
    );
    // Environment information to aid debugging
    logger.debug(`[segment_worker] env: cwd=${process.cwd()}, import.meta.url=${import.meta.url}`);
  }

  try {
    // Import RoutingGrid dynamically (prefer the specific module to avoid
    // executing top-level side-effects in the package entrypoint).
    let hostModule: RoutingGridModuleLike | undefined;
    try {
      const routingGridSpec = '../../routing/shared/routing_grid.js';
      hostModule = (await import(routingGridSpec)) as RoutingGridModuleLike;
    } catch (err: unknown) {
      if (DEBUG_ENABLED)
        logger.debug(
          `[segment_worker] primary import of routing_grid failed: ${err instanceof Error ? err.stack || err.message : String(err)}`,
        );
      // Fallback: first try sibling workspace package, then fall back to the
      // internal SimpleRoutingGrid implementation shipped with this plugin.
      try {
        const { pathToFileURL } = await import('url');
        const path = await import('path');
        const fs = await import('fs/promises');
        const { fileURLToPath } = await import('url');
        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        const fallbackPath = path.resolve(
          currentDir,
          '..',
          '..',
          '..',
          '@typecad-typecad',
          'dist',
          'routing',
          'shared',
          'routing_grid.js',
        );
        if (DEBUG_ENABLED)
          logger.debug(`[segment_worker] Trying fallback host routing grid from ${currentDir} -> ${fallbackPath}`);
        // Ensure file exists before attempting to import
        await fs.access(fallbackPath);
        hostModule = (await import(pathToFileURL(fallbackPath).href)) as RoutingGridModuleLike;
      } catch (err2: unknown) {
        if (DEBUG_ENABLED)
          logger.debug(
            `[segment_worker] sibling fallback failed: ${err2 instanceof Error ? err2.stack || err2.message : String(err2)}; using local SimpleRoutingGrid`,
          );
        // Local implementation
        hostModule = (await import('./simple_routing_grid.js')) as RoutingGridModuleLike;
      }
    }
    const RoutingGrid = hostModule.RoutingGrid;

    // Import the plugin's AStarRouter directly from the compiled router file
    // to avoid importing the package entrypoint which may have host-only
    // dependencies.
    const astarUrl = new URL('./astar_router.js', import.meta.url).href;
    const pluginModule = (await import(astarUrl)) as AStarRouterModuleLike;
    const AStarRouter = pluginModule.AStarRouter ?? pluginModule.default?.AStarRouter;
    if (!AStarRouter) {
      throw new Error('AStarRouter export not found in worker module');
    }

    const grid = new RoutingGrid(bounds, resolution, layers, options.debug);
    for (const obs of obstacles || []) {
      grid.addObstacle(obs);
    }

    const router = new AStarRouter(grid, options);
    const path = router.routeSegment(start, end);

    // DEBUG: Log result
    if (DEBUG_ENABLED)
      logger.debug(
        `[segment_worker] Task ${taskId}: result success=${path.success}, error=${path.error || 'none'}, nodes=${path.nodes?.length || 0}`,
      );

    parentPort!.postMessage({ id: taskId, result: path });
  } catch (err: unknown) {
    logger.error(
      `[segment_worker] Task ${taskId}: caught error: ${err instanceof Error ? err.stack || err.message : String(err)}`,
    );
    parentPort!.postMessage({ id: taskId, error: String(err) });
  }
});
