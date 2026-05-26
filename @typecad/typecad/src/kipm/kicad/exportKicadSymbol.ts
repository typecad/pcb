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
    EeSymbolRectangle
} from "../easyeda/parametersEasyeda.js";
import { SvgPathEllipticalArc, SvgPathMoveTo } from "../easyeda/svgPathParser.js";
import { getMiddleArcPos } from "../arcUtils.js";
import { computeArc } from "./exportKicadFootprint.js";
import {
    KiPinType,
    KiPinStyle,
    KiSymbolPin,
    KiSymbolRectangle,
    KiSymbolCircle,
    KiSymbolArc,
    KiSymbolPolygon,
    KiSymbolInfo,
    KiSymbol,
    KicadVersion
} from "./parametersKicadSymbol.js";

const eePinTypeToKiPinType = {
    [EasyedaPinType.unspecified]: KiPinType.unspecified,
    [EasyedaPinType._input]: KiPinType._input,
    [EasyedaPinType.output]: KiPinType.output,
    [EasyedaPinType.bidirectional]: KiPinType.bidirectional,
    [EasyedaPinType.power]: KiPinType.power_in,
};

function pxToMil(dim: any) {
    return Math.floor(10 * dim);
}

function pxToMm(dim: any) {
    return 10.0 * dim * 0.0254;
}

function convertEePins(eePins: any, eeBbox: any, kicadVersion: any) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
    const kicadPins: any[] = [];

    eePins.forEach((eePin: any) => {
        const pathParts = eePin.pin_path.path.split("h");
        const pinLength = Math.abs(Math.round(parseFloat(pathParts[pathParts.length - 1])));

        const kiPin = new KiSymbolPin({
            name: eePin.name.text.replace(" ", ""),
            number: String(eePin.settings.spice_pin_number).replace(" ", ""),
            style: KiPinStyle.line,
            length: toKi(pinLength),
            type: eePinTypeToKiPinType[eePin.settings.type as keyof typeof eePinTypeToKiPinType],
            orientation: eePin.settings.rotation,
            pos_x: toKi(parseInt(eePin.settings.pos_x) - parseInt(eeBbox.x)),
            pos_y: -toKi(parseInt(eePin.settings.pos_y) - parseInt(eeBbox.y)),
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

function convertEeRectangles(eeRectangles: any, eeBbox: any, kicadVersion: any) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
    const kicadRectangles: any[] = [];

    eeRectangles.forEach((eeRect: any) => {
        const kiRect = new KiSymbolRectangle({
            pos_x0: toKi(parseInt(eeRect.pos_x) - parseInt(eeBbox.x)),
            pos_y0: -toKi(parseInt(eeRect.pos_y) - parseInt(eeBbox.y)),
        });
        kiRect.pos_x1 = toKi(parseInt(eeRect.width)) + kiRect.pos_x0;
        kiRect.pos_y1 = -toKi(parseInt(eeRect.height)) + kiRect.pos_y0;

        kicadRectangles.push(kiRect);
    });

    return kicadRectangles;
}

function convertEeCircles(eeCircles: any, eeBbox: any, kicadVersion: any) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;

    return eeCircles.map((eeCircle: any) => new KiSymbolCircle({
        pos_x: toKi(parseInt(eeCircle.center_x) - parseInt(eeBbox.x)),
        pos_y: -toKi(parseInt(eeCircle.center_y) - parseInt(eeBbox.y)),
        radius: toKi(eeCircle.radius),
        background_filling: eeCircle.fill_color,
    }));
}

function convertEeEllipses(eeEllipses: any, eeBbox: any, kicadVersion: any) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;

    return eeEllipses
        .filter((ellipse: any) => ellipse.radius_x === ellipse.radius_y)
        .map((ellipse: any) => new KiSymbolCircle({
            pos_x: toKi(parseInt(ellipse.center_x) - parseInt(eeBbox.x)),
            pos_y: -toKi(parseInt(ellipse.center_y) - parseInt(eeBbox.y)),
            radius: toKi(ellipse.radius_x),
        }));
}

function convertEeArcs(eeArcs: any, eeBbox: any, kicadVersion: any) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
    const kicadArcs: any[] = [];

    eeArcs.forEach((eeArc: any) => {
        if (
            !(eeArc.path[0] instanceof SvgPathMoveTo ||
                eeArc.path[1] instanceof SvgPathEllipticalArc)
        ) {
            console.error("Can't convert this arc");
        } else {
            const kiArc = new KiSymbolArc({
                radius: toKi(Math.max(eeArc.path[1].radius_x, eeArc.path[1].radius_y)),
                angle_start: eeArc.path[1].x_axis_rotation,
                start_x: toKi(eeArc.path[0].start_x - eeBbox.x),
                start_y: toKi(eeArc.path[0].start_y - eeBbox.y),
                end_x: toKi(eeArc.path[1].end_x - eeBbox.x),
                end_y: toKi(eeArc.path[1].end_y - eeBbox.y),
            });

            const { center_x, center_y, angle_end } = (computeArc as any)({
                start_x: kiArc.start_x,
                start_y: kiArc.start_y,
                radius_x: toKi(eeArc.path[1].radius_x),
                radius_y: toKi(eeArc.path[1].radius_y),
                angle: kiArc.angle_start,
                large_arc_flag: eeArc.path[1].flag_large_arc,
                sweep_flag: eeArc.path[1].flag_sweep,
                end_x: kiArc.end_x,
                end_y: kiArc.end_y,
            });
            kiArc.center_x = center_x;
            kiArc.center_y = eeArc.path[1].flag_large_arc ? center_y : -center_y;
            kiArc.angle_end = eeArc.path[1].flag_large_arc ? (360 - angle_end) : angle_end;

            const { x: middleX, y: middleY } = getMiddleArcPos({
                center_x: kiArc.center_x,
                center_y: kiArc.center_y,
                radius: kiArc.radius,
                angle_start: kiArc.angle_start,
                angle_end: kiArc.angle_end,
            });
            kiArc.middle_x = middleX;
            kiArc.middle_y = middleY;

            kiArc.start_y = eeArc.path[1].flag_large_arc ? kiArc.start_y : -kiArc.start_y;
            kiArc.end_y = eeArc.path[1].flag_large_arc ? kiArc.end_y : -kiArc.end_y;

            kicadArcs.push(kiArc);
        }
    });

    return kicadArcs;
}

function convertEePolylines(eePolylines: any, eeBbox: any, kicadVersion: any) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
    const kicadPolygons: any[] = [];

    eePolylines.forEach((eePolyline: any) => {
        const rawPts = eePolyline.points.split(" ");
        const xPoints: any[] = [];
        const yPoints: any[] = [];

        for (let i = 0; i < rawPts.length; i += 2) {
            xPoints.push(toKi(Math.round(parseFloat(rawPts[i])) - parseInt(String(eeBbox.x))));
            yPoints.push(-toKi(Math.round(parseFloat(rawPts[i + 1])) - parseInt(String(eeBbox.y))));
        }

        if (eePolyline instanceof EeSymbolPolygon || eePolyline.fill_color) {
            xPoints.push(xPoints[0]);
            yPoints.push(yPoints[0]);
        }
        if (xPoints.length > 0 && yPoints.length > 0) {
            const points: any[] = [];
            const numPoints = Math.min(xPoints.length, yPoints.length);
            for (let i = 0; i < numPoints; i++) {
                points.push([xPoints[i], yPoints[i]]);
            }
            const isClosed =
                xPoints[0] === xPoints[xPoints.length - 1] &&
                yPoints[0] === yPoints[yPoints.length - 1];
            const kicadPolygon = new KiSymbolPolygon({
                points,
                points_number: numPoints,
                is_closed: isClosed,
            });
            kicadPolygons.push(kicadPolygon);
        } else {
            console.warn("Skipping polygon with no parseable points");
        }
    });

    return kicadPolygons;
}

function convertEePolygons(eePolygons: any, eeBbox: any, kicadVersion: any) {
    return convertEePolylines(eePolygons, eeBbox, kicadVersion);
}

function convertEePaths(eePaths: any, eeBbox: any, kicadVersion: any) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
    const kicadPolygons: any[] = [];
    const kicadBeziers: any[] = [];

    eePaths.forEach((eePath: any) => {
        const rawPts = eePath.paths.split(" ");
        const xPoints: any[] = [];
        const yPoints: any[] = [];
        let i = 0;
        while (i < rawPts.length) {
            const cmd = rawPts[i];
            if (cmd === "M" || cmd === "L") {
                const x = toKi(Math.round(parseFloat(rawPts[i + 1])) - parseInt(String(eeBbox.x)));
                const y = -toKi(Math.round(parseFloat(rawPts[i + 2])) - parseInt(String(eeBbox.y)));
                xPoints.push(x);
                yPoints.push(y);
                i += 3;
            } else if (cmd === "Z") {
                if (xPoints.length > 0 && yPoints.length > 0) {
                    xPoints.push(xPoints[0]);
                    yPoints.push(yPoints[0]);
                }
                i++;
            } else if (cmd === "C") {
                i += 7;
            } else {
                i++;
            }
        }
        if (xPoints.length > 0 && yPoints.length > 0) {
            const points: any[] = [];
            const numPoints = Math.min(xPoints.length, yPoints.length);
            for (let j = 0; j < numPoints; j++) {
                points.push([xPoints[j], yPoints[j]]);
            }
            const isClosed =
                xPoints[0] === xPoints[xPoints.length - 1] &&
                yPoints[0] === yPoints[yPoints.length - 1];
            const kiPolygon = new KiSymbolPolygon({
                points,
                points_number: numPoints,
                is_closed: isClosed,
            });
            kicadPolygons.push(kiPolygon);
        } else {
            console.warn("Skipping path with no parseable points");
        }
    });

    return [kicadPolygons, kicadBeziers];
}

function convertToKicad(eeSymbol: any, kicadVersion: any) {
    const kiInfo = new KiSymbolInfo({
        name: eeSymbol.info.name,
        prefix: eeSymbol.info.prefix.replace("?", ""),
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

    kicadSymbol.circles = kicadSymbol.circles.concat(
        convertEeEllipses(eeSymbol.ellipses, eeSymbol.bbox, kicadVersion)
    );

    const [polygonsFromPaths, beziers] = convertEePaths(eeSymbol.paths, eeSymbol.bbox, kicadVersion);
    kicadSymbol.polygons = polygonsFromPaths;
    kicadSymbol.beziers = beziers;

    kicadSymbol.polygons = kicadSymbol.polygons.concat(
        convertEePolylines(eeSymbol.polylines, eeSymbol.bbox, kicadVersion),
        convertEePolygons(eeSymbol.polygons, eeSymbol.bbox, kicadVersion)
    );

    return kicadSymbol;
}

function tuneFootprintRefPath(kiSymbol: any, footprintLibName: any) {
    kiSymbol.info.package = `${footprintLibName}:${kiSymbol.info.package}`;
}

class ExporterSymbolKicad {
    input: any;
    version: any;
    output: any;

    constructor(symbol: any, kicadVersion: any) {
        this.input = symbol;
        this.version = kicadVersion;
        if (this.input instanceof EeSymbol) {
            this.output = convertToKicad(this.input, kicadVersion);
        } else {
            console.error("Unknown input symbol format");
        }
    }

    export(footprintLibName: any) {
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
