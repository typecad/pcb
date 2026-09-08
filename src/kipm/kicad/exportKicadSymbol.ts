import {
  EasyedaPinType,
  EeSymbol,
  EeSymbolArc,
  EeSymbolBbox,
  EeSymbolCircle,
  EeSymbolEllipse,
  EeSymbolPath,
  EeSymbolPin,
  EeSymbolPolygon,
  EeSymbolPolyline,
  EeSymbolRectangle,
} from '../easyeda/parametersEasyeda.js';
import { SvgPathEllipticalArc, SvgPathMoveTo } from '../easyeda/svgPathParser.js';
import { getMiddleArcPos } from '../arcUtils.js';
import { computeArc } from './exportKicadFootprint.js';
import logger from '../../utils/logging.js';
import {
  KiPinType,
  KiPinStyle,
  KiSymbolPin,
  KiSymbolRectangle,
  KiSymbolCircle,
  KiSymbolArc,
  KiSymbolPolygon,
  KiSymbolBezier,
  KiSymbolInfo,
  KiSymbol,
  KicadVersion,
} from './parametersKicadSymbol.js';

const eePinTypeToKiPinType = {
  [EasyedaPinType.unspecified]: KiPinType.unspecified,
  [EasyedaPinType._input]: KiPinType._input,
  [EasyedaPinType.output]: KiPinType.output,
  [EasyedaPinType.bidirectional]: KiPinType.bidirectional,
  [EasyedaPinType.power]: KiPinType.power_in,
};

function pxToMil(dim: number) {
  return Math.floor(10 * dim);
}

function pxToMm(dim: number) {
  return 10.0 * dim * 0.0254;
}

function convertEePins(eePins: EeSymbolPin[], eeBbox: EeSymbolBbox, kicadVersion: string) {
  const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
  const kicadPins: KiSymbolPin[] = [];

  eePins.forEach((eePin: EeSymbolPin) => {
    const pathParts = eePin.pin_path.path.split('h');
    const pinLength = Math.abs(Math.round(parseFloat(pathParts[pathParts.length - 1])));

    const kiPin = new KiSymbolPin({
      name: eePin.name.text.replace(' ', ''),
      number: String(eePin.settings.spice_pin_number).replace(' ', ''),
      style: KiPinStyle.line,
      length: toKi(pinLength),
      type: eePinTypeToKiPinType[eePin.settings.type as keyof typeof eePinTypeToKiPinType],
      orientation: eePin.settings.rotation,
      pos_x: toKi(parseInt(String(eePin.settings.pos_x)) - parseInt(String(eeBbox.x))),
      pos_y: -toKi(parseInt(String(eePin.settings.pos_y)) - parseInt(String(eeBbox.y))),
    });

    if (+eePin.dot.is_displayed && +eePin.clock.is_displayed) {
      kiPin.style = KiPinStyle.inverted_clock;
    } else if (+eePin.dot.is_displayed) {
      kiPin.style = KiPinStyle.inverted;
    } else if (+eePin.clock.is_displayed) {
      kiPin.style = KiPinStyle.clock;
    }

    kicadPins.push(kiPin);
  });

  return kicadPins;
}

function convertEeRectangles(eeRectangles: EeSymbolRectangle[], eeBbox: EeSymbolBbox, kicadVersion: string) {
  const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
  const kicadRectangles: KiSymbolRectangle[] = [];

  eeRectangles.forEach((eeRect: EeSymbolRectangle) => {
    const kiRect = new KiSymbolRectangle({
      pos_x0: toKi(parseInt(String(eeRect.pos_x)) - parseInt(String(eeBbox.x))),
      pos_y0: -toKi(parseInt(String(eeRect.pos_y)) - parseInt(String(eeBbox.y))),
    });
    kiRect.pos_x1 = toKi(parseInt(String(eeRect.width))) + kiRect.pos_x0;
    kiRect.pos_y1 = -toKi(parseInt(String(eeRect.height))) + kiRect.pos_y0;

    kicadRectangles.push(kiRect);
  });

  return kicadRectangles;
}

function convertEeCircles(eeCircles: EeSymbolCircle[], eeBbox: EeSymbolBbox, kicadVersion: string) {
  const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;

  return eeCircles.map(
    (eeCircle: EeSymbolCircle) =>
      new KiSymbolCircle({
        pos_x: toKi(parseInt(String(eeCircle.center_x)) - parseInt(String(eeBbox.x))),
        pos_y: -toKi(parseInt(String(eeCircle.center_y)) - parseInt(String(eeBbox.y))),
        radius: toKi(Number(eeCircle.radius)),
        background_filling: eeCircle.fill_color,
      }),
  );
}

function convertEeEllipses(eeEllipses: EeSymbolEllipse[], eeBbox: EeSymbolBbox, kicadVersion: string) {
  const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;

  return eeEllipses
    .filter((ellipse: EeSymbolEllipse) => ellipse.radius_x === ellipse.radius_y)
    .map(
      (ellipse: EeSymbolEllipse) =>
        new KiSymbolCircle({
          pos_x: toKi(parseInt(String(ellipse.center_x)) - parseInt(String(eeBbox.x))),
          pos_y: -toKi(parseInt(String(ellipse.center_y)) - parseInt(String(eeBbox.y))),
          radius: toKi(Number(ellipse.radius_x)),
        }),
    );
}

function convertEeArcs(eeArcs: EeSymbolArc[], eeBbox: EeSymbolBbox, kicadVersion: string) {
  const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
  const kicadArcs: KiSymbolArc[] = [];

  eeArcs.forEach((eeArc: EeSymbolArc) => {
    const pathMove = eeArc.path[0];
    const pathArc = eeArc.path[1];
    if (!(pathMove instanceof SvgPathMoveTo || pathArc instanceof SvgPathEllipticalArc)) {
      logger.error("Can't convert this arc");
    } else {
      const svgMove = pathMove as SvgPathMoveTo;
      const svgArc = pathArc as SvgPathEllipticalArc;
      const kiArc = new KiSymbolArc({
        radius: toKi(Math.max(svgArc.radius_x, svgArc.radius_y)),
        angle_start: svgArc.x_axis_rotation,
        start_x: toKi(svgMove.start_x - Number(eeBbox.x)),
        start_y: toKi(svgMove.start_y - Number(eeBbox.y)),
        end_x: toKi(svgArc.end_x - Number(eeBbox.x)),
        end_y: toKi(svgArc.end_y - Number(eeBbox.y)),
      });

      const [center_x, center_y, angle_end] = computeArc(
        kiArc.start_x,
        kiArc.start_y,
        toKi(svgArc.radius_x),
        toKi(svgArc.radius_y),
        kiArc.angle_start,
        svgArc.flag_large_arc,
        svgArc.flag_sweep,
        kiArc.end_x,
        kiArc.end_y,
      );
      kiArc.center_x = center_x;
      kiArc.center_y = svgArc.flag_large_arc ? center_y : -center_y;
      kiArc.angle_end = svgArc.flag_large_arc ? 360 - angle_end : angle_end;

      const { x: middleX, y: middleY } = getMiddleArcPos({
        center_x: kiArc.center_x,
        center_y: kiArc.center_y,
        radius: kiArc.radius,
        angle_start: kiArc.angle_start,
        angle_end: kiArc.angle_end,
      });
      kiArc.middle_x = middleX;
      kiArc.middle_y = middleY;

      kiArc.start_y = svgArc.flag_large_arc ? kiArc.start_y : -kiArc.start_y;
      kiArc.end_y = svgArc.flag_large_arc ? kiArc.end_y : -kiArc.end_y;

      kicadArcs.push(kiArc);
    }
  });

  return kicadArcs;
}

function convertEePolylines(eePolylines: EeSymbolPolyline[], eeBbox: EeSymbolBbox, kicadVersion: string) {
  const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
  const kicadPolygons: KiSymbolPolygon[] = [];

  eePolylines.forEach((eePolyline: EeSymbolPolyline) => {
    const rawPts = eePolyline.points.split(' ');
    const xPoints: number[] = [];
    const yPoints: number[] = [];

    for (let i = 0; i < rawPts.length; i += 2) {
      xPoints.push(toKi(Math.round(parseFloat(rawPts[i])) - parseInt(String(eeBbox.x))));
      yPoints.push(-toKi(Math.round(parseFloat(rawPts[i + 1])) - parseInt(String(eeBbox.y))));
    }

    if (eePolyline instanceof EeSymbolPolygon || eePolyline.fill_color) {
      xPoints.push(xPoints[0]);
      yPoints.push(yPoints[0]);
    }
    if (xPoints.length > 0 && yPoints.length > 0) {
      const points: number[][] = [];
      const numPoints = Math.min(xPoints.length, yPoints.length);
      for (let i = 0; i < numPoints; i++) {
        points.push([xPoints[i], yPoints[i]]);
      }
      const isClosed = xPoints[0] === xPoints[xPoints.length - 1] && yPoints[0] === yPoints[yPoints.length - 1];
      const kicadPolygon = new KiSymbolPolygon({
        points: points as number[][],
        points_number: numPoints,
        is_closed: isClosed,
      });
      kicadPolygons.push(kicadPolygon);
    } else {
      logger.warn('Skipping polygon with no parseable points');
    }
  });

  return kicadPolygons;
}

function convertEePolygons(eePolygons: EeSymbolPolygon[], eeBbox: EeSymbolBbox, kicadVersion: string) {
  return convertEePolylines(eePolygons, eeBbox, kicadVersion);
}

function convertEePaths(eePaths: EeSymbolPath[], eeBbox: EeSymbolBbox, kicadVersion: string) {
  const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
  const kicadPolygons: KiSymbolPolygon[] = [];
  const kicadBeziers: (KiSymbolPolygon | KiSymbolBezier)[] = [];

  eePaths.forEach((eePath: EeSymbolPath) => {
    const rawPts = eePath.paths.split(' ');
    const xPoints: number[] = [];
    const yPoints: number[] = [];
    let i = 0;
    while (i < rawPts.length) {
      const cmd = rawPts[i];
      if (cmd === 'M' || cmd === 'L') {
        const x = toKi(Math.round(parseFloat(rawPts[i + 1])) - parseInt(String(eeBbox.x)));
        const y = -toKi(Math.round(parseFloat(rawPts[i + 2])) - parseInt(String(eeBbox.y)));
        xPoints.push(x);
        yPoints.push(y);
        i += 3;
      } else if (cmd === 'Z') {
        if (xPoints.length > 0 && yPoints.length > 0) {
          xPoints.push(xPoints[0]);
          yPoints.push(yPoints[0]);
        }
        i++;
      } else if (cmd === 'C') {
        i += 7;
      } else {
        i++;
      }
    }
    if (xPoints.length > 0 && yPoints.length > 0) {
      const points: number[][] = [];
      const numPoints = Math.min(xPoints.length, yPoints.length);
      for (let j = 0; j < numPoints; j++) {
        points.push([xPoints[j], yPoints[j]]);
      }
      const isClosed = xPoints[0] === xPoints[xPoints.length - 1] && yPoints[0] === yPoints[yPoints.length - 1];
      const kiPolygon = new KiSymbolPolygon({
        points: points as number[][],
        points_number: numPoints,
        is_closed: isClosed,
      });
      kicadPolygons.push(kiPolygon);
    } else {
      logger.warn('Skipping path with no parseable points');
    }
  });

  return [kicadPolygons, kicadBeziers];
}

function convertToKicad(eeSymbol: EeSymbol, kicadVersion: string) {
  const kiInfo = new KiSymbolInfo({
    name: eeSymbol.info.name,
    prefix: eeSymbol.info.prefix.replace('?', ''),
    package: eeSymbol.info.package,
    manufacturer: eeSymbol.info.manufacturer,
    datasheet: eeSymbol.info.datasheet,
    lcsc_id: eeSymbol.info.lcsc_id,
    jlc_id: eeSymbol.info.jlc_id,
  });

  const kicadSymbol = new KiSymbol({
    info: kiInfo,
    pins: convertEePins(eeSymbol.pins, eeSymbol.bbox, kicadVersion),
    rectangles: convertEeRectangles(eeSymbol.rectangles, eeSymbol.bbox, kicadVersion),
    circles: convertEeCircles(eeSymbol.circles, eeSymbol.bbox, kicadVersion),
    arcs: convertEeArcs(eeSymbol.arcs, eeSymbol.bbox, kicadVersion),
  });

  kicadSymbol.circles = kicadSymbol.circles.concat(convertEeEllipses(eeSymbol.ellipses, eeSymbol.bbox, kicadVersion));

  const [polygonsFromPaths, beziers] = convertEePaths(eeSymbol.paths, eeSymbol.bbox, kicadVersion);
  kicadSymbol.polygons = polygonsFromPaths;
  kicadSymbol.beziers = beziers;

  kicadSymbol.polygons = kicadSymbol.polygons.concat(
    convertEePolylines(eeSymbol.polylines, eeSymbol.bbox, kicadVersion),
    convertEePolygons(eeSymbol.polygons, eeSymbol.bbox, kicadVersion),
  );

  return kicadSymbol;
}

function tuneFootprintRefPath(kiSymbol: KiSymbol, footprintLibName: string) {
  kiSymbol.info.package = `${footprintLibName}:${kiSymbol.info.package}`;
}

class ExporterSymbolKicad {
  input: EeSymbol;
  version: string;
  output!: KiSymbol;

  constructor(symbol: EeSymbol, kicadVersion: string) {
    this.input = symbol;
    this.version = kicadVersion;
    if (this.input instanceof EeSymbol) {
      this.output = convertToKicad(this.input, kicadVersion);
    } else {
      logger.error('Unknown input symbol format');
    }
  }

  export(footprintLibName: string) {
    tuneFootprintRefPath(this.output, footprintLibName);
    return this.output.export(this.version);
  }
}

export {
  pxToMil,
  pxToMm,
  convertEePins,
  convertEeRectangles,
  convertEeCircles,
  convertEeEllipses,
  convertEeArcs,
  convertEePolylines,
  convertEePolygons,
  convertEePaths,
  convertToKicad,
  tuneFootprintRefPath,
  ExporterSymbolKicad,
};
