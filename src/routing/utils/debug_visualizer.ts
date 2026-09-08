import { RoutingGrid, IRoutingObstacle } from '../shared/routing_grid.js';
import { IRoutePath } from '../../pcb/pcb_interfaces.js';
import { ISteinerPoint } from '../router/steiner_optimizer.js';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

/**
 * Color representation for debug visualization.
 */
interface IColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Generates debug visualizations of routing grids and paths.
 * Creates simple PPM (Portable PixMap) images that can be viewed with most image viewers.
 */
export class DebugVisualizer {
  /**
   * Generate a debug visualization of the routing grid with obstacles and paths.
   *
   * @param grid - The routing grid
   * @param obstacles - Array of obstacles
   * @param paths - Array of routed paths
   * @param filename - Output filename (without extension)
   * @param layer - Which layer to visualize (default: first layer in grid)
   * @param cellSize - Pixels per grid cell (default: 1, max 2 for large grids)
   * @param steinerPoints - Optional Steiner points to highlight
   *
   * @example
   * ```ts
   * DebugVisualizer.visualizeRouting(grid, obstacles, [path], 'debug_route', 'F.Cu', 1);
   * ```
   */
  static visualizeRouting(
    grid: RoutingGrid,
    obstacles: IRoutingObstacle[],
    paths: IRoutePath[],
    filename: string = 'routing_debug',
    layer?: string,
    cellSize: number = 1,
    steinerPoints?: ISteinerPoint[],
    debug: boolean = false,
  ): void {
    const dimensions = grid.getDimensions();
    const targetLayer = layer || grid.getLayers()[0];
    const bounds = grid.getBounds();

    const width = dimensions.width;
    const height = dimensions.height;

    // Limit image size to prevent OOM
    const maxDimension = 4000; // Max 4000 pixels in any dimension
    const imgWidth = Math.min(width * cellSize, maxDimension);
    const imgHeight = Math.min(height * cellSize, maxDimension);

    // Auto-adjust cell size if needed
    if (width * cellSize > maxDimension || height * cellSize > maxDimension) {
      cellSize = Math.max(1, Math.floor(maxDimension / Math.max(width, height)));
    }

    // Use a flat Uint8Array for memory efficiency (3 bytes per pixel: RGB)
    const pixelData = new Uint8Array(imgWidth * imgHeight * 3);

    // Initialize with white background (255, 255, 255)
    pixelData.fill(255);

    // Draw grid cells (occupied = gray)
    for (let gy = 0; gy < height && gy * cellSize < imgHeight; gy++) {
      for (let gx = 0; gx < width && gx * cellSize < imgWidth; gx++) {
        const cell = grid.getCell(gx, gy, targetLayer);
        if (cell?.occupied) {
          const color = this.getObstacleColor(cell!.net);
          this.fillRect(pixelData, imgWidth, imgHeight, gx * cellSize, gy * cellSize, cellSize, cellSize, color);
        }
      }
    }

    // Draw obstacles with distinct colors by type
    for (const obstacle of obstacles) {
      // Handle wildcard copper layer specification ('*.Cu') for visualization
      const appliesToTarget =
        obstacle.layers.includes(targetLayer) || (obstacle.layers.includes('*.Cu') && targetLayer.includes('.Cu'));

      if (!appliesToTarget) {
        continue;
      }

      const color = this.getObstacleTypeColor(obstacle.type, obstacle.net);

      // Tracks: if precise segment geometry exists, draw a line instead of a bounding box
      if (obstacle.type === 'track' && obstacle.segment) {
        const segment = obstacle.segment!; // Non-null assertion
        const a = grid.worldToGrid(segment.x1, segment.y1);
        const b = grid.worldToGrid(segment.x2, segment.y2);
        // Draw through cell centers for better alignment
        this.drawLine(
          pixelData,
          imgWidth,
          imgHeight,
          a.x * cellSize + Math.floor(cellSize / 2),
          a.y * cellSize + Math.floor(cellSize / 2),
          b.x * cellSize + Math.floor(cellSize / 2),
          b.y * cellSize + Math.floor(cellSize / 2),
          color,
        );
      } else if (obstacle.type === 'pad' && obstacle.padShape) {
        // Draw a small rotated rectangle/ellipse approximation by outlining the AABB; precise shape will show via occupancy shading
        const minGrid = grid.worldToGrid(obstacle.bounds.minX, obstacle.bounds.minY);
        const maxGrid = grid.worldToGrid(obstacle.bounds.maxX, obstacle.bounds.maxY);
        this.drawRect(
          pixelData,
          imgWidth,
          imgHeight,
          minGrid.x * cellSize,
          minGrid.y * cellSize,
          (maxGrid.x - minGrid.x + 1) * cellSize,
          (maxGrid.y - minGrid.y + 1) * cellSize,
          color,
        );
      } else if (obstacle.polygon && obstacle.polygon!.points && obstacle.polygon!.points.length >= 3) {
        // Draw polygon outline by connecting vertices
        const polygon = obstacle.polygon!; // Non-null assertion
        const pts = polygon.points.map((p) => grid.worldToGrid(p.x, p.y));
        for (let i = 0; i < pts.length; i++) {
          const p0 = pts[i];
          const p1 = pts[(i + 1) % pts.length];
          this.drawLine(
            pixelData,
            imgWidth,
            imgHeight,
            p0.x * cellSize + Math.floor(cellSize / 2),
            p0.y * cellSize + Math.floor(cellSize / 2),
            p1.x * cellSize + Math.floor(cellSize / 2),
            p1.y * cellSize + Math.floor(cellSize / 2),
            color,
          );
        }
      } else {
        // Convert world bounds to grid bounds
        const minGrid = grid.worldToGrid(obstacle.bounds.minX, obstacle.bounds.minY);
        const maxGrid = grid.worldToGrid(obstacle.bounds.maxX, obstacle.bounds.maxY);

        // Draw obstacle outline AABB
        this.drawRect(
          pixelData,
          imgWidth,
          imgHeight,
          minGrid.x * cellSize,
          minGrid.y * cellSize,
          (maxGrid.x - minGrid.x + 1) * cellSize,
          (maxGrid.y - minGrid.y + 1) * cellSize,
          color,
        );
      }
    }

    // Draw paths (bright colors)
    const pathColors = [
      { r: 255, g: 0, b: 0 }, // Red
      { r: 0, g: 0, b: 255 }, // Blue
      { r: 0, g: 255, b: 0 }, // Green
      { r: 255, g: 0, b: 255 }, // Magenta
      { r: 255, g: 165, b: 0 }, // Orange
      { r: 0, g: 255, b: 255 }, // Cyan
    ];

    paths.forEach((pathResult, pathIndex) => {
      if (!pathResult.success) return;

      const pathColor = pathColors[pathIndex % pathColors.length];

      // Use gridNodes if available (more accurate), otherwise convert from world coordinates
      const useGridNodes = pathResult.gridNodes && pathResult.gridNodes.length === pathResult.nodes.length;

      for (let i = 0; i < pathResult.nodes.length; i++) {
        const node = pathResult.nodes[i];
        if (node.layer !== targetLayer) continue;

        // Get grid position - prefer gridNodes for accuracy
        const gridPos = useGridNodes
          ? { x: pathResult.gridNodes![i].gridX, y: pathResult.gridNodes![i].gridY }
          : grid.worldToGrid(node.x, node.y);

        // Draw node as filled circle
        this.fillCircle(
          pixelData,
          imgWidth,
          imgHeight,
          gridPos.x * cellSize + Math.floor(cellSize / 2),
          gridPos.y * cellSize + Math.floor(cellSize / 2),
          Math.max(1, Math.floor(cellSize / 2)),
          pathColor,
        );

        // Draw line to next node
        if (i < pathResult.nodes.length - 1) {
          const nextNode = pathResult.nodes[i + 1];
          if (nextNode.layer === targetLayer) {
            const nextGridPos = useGridNodes
              ? { x: pathResult.gridNodes![i + 1].gridX, y: pathResult.gridNodes![i + 1].gridY }
              : grid.worldToGrid(nextNode.x, nextNode.y);
            this.drawLine(
              pixelData,
              imgWidth,
              imgHeight,
              gridPos.x * cellSize + Math.floor(cellSize / 2),
              gridPos.y * cellSize + Math.floor(cellSize / 2),
              nextGridPos.x * cellSize + Math.floor(cellSize / 2),
              nextGridPos.y * cellSize + Math.floor(cellSize / 2),
              pathColor,
            );
          }
        }
      }
    });

    // Draw Steiner points if provided (yellow stars)
    if (steinerPoints?.length) {
      const steinerColor = { r: 255, g: 255, b: 0 }; // Yellow
      for (const steinerPoint of steinerPoints!) {
        if (steinerPoint.layer !== targetLayer) continue;

        const gridPos = grid.worldToGrid(steinerPoint.x, steinerPoint.y);
        const centerX = gridPos.x * cellSize + Math.floor(cellSize / 2);
        const centerY = gridPos.y * cellSize + Math.floor(cellSize / 2);
        const radius = Math.max(2, Math.floor(cellSize * 1.5));

        // Draw as a star (draw a larger circle with cross)
        this.fillCircle(pixelData, imgWidth, imgHeight, centerX, centerY, radius, steinerColor);

        // Draw cross lines to make it more visible
        const crossSize = radius + 2;
        this.drawLine(pixelData, imgWidth, imgHeight, centerX - crossSize, centerY, centerX + crossSize, centerY, {
          r: 0,
          g: 0,
          b: 0,
        });
        this.drawLine(pixelData, imgWidth, imgHeight, centerX, centerY - crossSize, centerX, centerY + crossSize, {
          r: 0,
          g: 0,
          b: 0,
        });
      }
    }

    // Only save if debug is enabled
    if (debug) {
      // Save as PPM file (simple text-based format, no dependencies needed)
      const outputPath = path.resolve(filename + '.ppm');
      this.savePPM(pixelData, imgWidth, imgHeight, outputPath);
    }
  }

  /**
   * Get color for obstacle based on net ownership.
   * @private
   */
  private static getObstacleColor(net?: string): IColor {
    if (!net) {
      return { r: 200, g: 200, b: 200 }; // Light gray for no-net obstacles
    }

    // Hash net name to generate consistent color
    let hash = 0;
    for (let i = 0; i < net.length; i++) {
      hash = net.charCodeAt(i) + ((hash << 5) - hash);
    }

    return {
      r: 150 + (hash % 106),
      g: 150 + ((hash >> 8) % 106),
      b: 150 + ((hash >> 16) % 106),
    };
  }

  /**
   * Get color for obstacle based on type.
   * @private
   */
  private static getObstacleTypeColor(type: string, net?: string): IColor {
    switch (type) {
      case 'pad':
        return net ? { r: 100, g: 150, b: 255 } : { r: 180, g: 180, b: 180 };
      case 'track':
        return { r: 50, g: 50, b: 50 };
      case 'component':
        return { r: 150, g: 150, b: 150 };
      case 'zone':
        return { r: 200, g: 200, b: 100 };
      case 'keepout':
        return { r: 255, g: 100, b: 100 };
      case 'outline':
        return { r: 100, g: 100, b: 100 };
      default:
        return { r: 128, g: 128, b: 128 };
    }
  }

  /**
   * Fill a rectangle with a color.
   * @private
   */
  private static fillRect(
    pixelData: Uint8Array,
    imgWidth: number,
    imgHeight: number,
    x: number,
    y: number,
    width: number,
    height: number,
    color: IColor,
  ): void {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const px = Math.floor(x + dx);
        const py = Math.floor(y + dy);
        this.setPixel(pixelData, imgWidth, imgHeight, px, py, color);
      }
    }
  }

  /**
   * Draw a rectangle outline.
   * @private
   */
  private static drawRect(
    pixelData: Uint8Array,
    imgWidth: number,
    imgHeight: number,
    x: number,
    y: number,
    width: number,
    height: number,
    color: IColor,
  ): void {
    // Top and bottom
    for (let dx = 0; dx < width; dx++) {
      this.setPixel(pixelData, imgWidth, imgHeight, x + dx, y, color);
      this.setPixel(pixelData, imgWidth, imgHeight, x + dx, y + height - 1, color);
    }
    // Left and right
    for (let dy = 0; dy < height; dy++) {
      this.setPixel(pixelData, imgWidth, imgHeight, x, y + dy, color);
      this.setPixel(pixelData, imgWidth, imgHeight, x + width - 1, y + dy, color);
    }
  }

  /**
   * Fill a circle with a color.
   * @private
   */
  private static fillCircle(
    pixelData: Uint8Array,
    imgWidth: number,
    imgHeight: number,
    cx: number,
    cy: number,
    radius: number,
    color: IColor,
  ): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          this.setPixel(pixelData, imgWidth, imgHeight, cx + dx, cy + dy, color);
        }
      }
    }
  }

  /**
   * Draw a line using Bresenham's algorithm.
   * @private
   */
  private static drawLine(
    pixelData: Uint8Array,
    imgWidth: number,
    imgHeight: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: IColor,
  ): void {
    x0 = Math.floor(x0);
    y0 = Math.floor(y0);
    x1 = Math.floor(x1);
    y1 = Math.floor(y1);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this.setPixel(pixelData, imgWidth, imgHeight, x0, y0, color);

      if (x0 === x1 && y0 === y1) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /**
   * Set a single pixel in the flat Uint8Array.
   * @private
   */
  private static setPixel(
    pixelData: Uint8Array,
    imgWidth: number,
    imgHeight: number,
    x: number,
    y: number,
    color: IColor,
  ): void {
    x = Math.floor(x);
    y = Math.floor(y);

    if (x >= 0 && x < imgWidth && y >= 0 && y < imgHeight) {
      const index = (y * imgWidth + x) * 3;
      pixelData[index] = color.r;
      pixelData[index + 1] = color.g;
      pixelData[index + 2] = color.b;
    }
  }

  /**
   * Save image as PPM (Portable PixMap) format.
   * This is a simple text-based format that requires no dependencies.
   * Uses binary PPM (P6) for smaller file sizes.
   * @private
   */
  private static savePPM(pixelData: Uint8Array, width: number, height: number, filepath: string): void {
    // PPM P6 header (binary format)
    const header = `P6\n${width} ${height}\n255\n`;
    const headerBuffer = Buffer.from(header, 'ascii');

    // Combine header and pixel data
    const fullBuffer = Buffer.concat([headerBuffer, Buffer.from(pixelData)]);

    fs.writeFileSync(filepath, fullBuffer);
  }

  /**
   * Visualize multiple layers side by side.
   *
   * @param grid - The routing grid
   * @param obstacles - Array of obstacles
   * @param paths - Array of routed paths
   * @param filename - Output filename (without extension)
   * @param cellSize - Pixels per grid cell (default: 2)
   */
  static visualizeAllLayers(
    grid: RoutingGrid,
    obstacles: IRoutingObstacle[],
    paths: IRoutePath[],
    filename: string = 'routing_debug_all_layers',
    cellSize: number = 2,
    steinerPoints?: ISteinerPoint[],
    debug: boolean = false,
  ): void {
    const layers = grid.getLayers();

    if (layers.length === 0) {
      return;
    }

    if (layers.length === 1) {
      // Just one layer, use single-layer visualization
      this.visualizeRouting(grid, obstacles, paths, filename, layers[0], cellSize, steinerPoints, debug);
      return;
    }

    // Generate separate images for each layer
    layers.forEach((layer, index) => {
      const layerFilename = `${filename}_${layer.replace('.', '_')}`;
      this.visualizeRouting(grid, obstacles, paths, layerFilename, layer, cellSize, steinerPoints, debug);
    });
  }
}
