import { EasyedaPinType, EeSymbol, EeSymbolArc, EeSymbolBbox, EeSymbolCircle, EeSymbolEllipse, EeSymbolPath, EeSymbolPin, EeSymbolPolygon, EeSymbolPolyline, EeSymbolRectangle } from '../easyeda/parametersEasyeda.js';
import { SvgPathEllipticalArc, SvgPathMoveTo } from '../easyeda/svgPathParser.js';
import { getMiddleArcPos } from '../arcUtils.js';
import { computeArc } from './exportKicadFootprint.js';
import { KiPinType, KiPinStyle, KiSymbolPin, KiSymbolRectangle, KiSymbolCircle, KiSymbolArc, KiSymbolPolygon, KiSymbolInfo, KiSymbol, KicadVersion } from './parametersKicadSymbol.js';

const eePinTypeToKiPinType = {
    [EasyedaPinType.unspecified]: KiPinType.unspecified,
    [EasyedaPinType._input]: KiPinType._input,
    [EasyedaPinType.output]: KiPinType.output,
    [EasyedaPinType.bidirectional]: KiPinType.bidirectional,
    [EasyedaPinType.power]: KiPinType.power_in,
};

function pxToMil(dim) {
    // Multiply by 10 and truncate to an integer (like Python's int())
    return Math.floor(10 * dim);
}

function pxToMm(dim) {
    return 10.0 * dim * 0.0254;
}

function convertEePins(eePins, eeBbox, kicadVersion) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
    const kicadPins = [];

    eePins.forEach(eePin => {
        // Parse the pin length from the pin_path string.
        const pathParts = eePin.pin_path.path.split("h");
        const pinLength = Math.abs(parseInt(parseFloat(pathParts[pathParts.length - 1])));

        const kiPin = new KiSymbolPin({
            name: eePin.name.text.replace(" ", ""),
            number: eePin.settings.spice_pin_number.replace(" ", ""),
            style: KiPinStyle.line,
            length: toKi(pinLength),
            type: eePinTypeToKiPinType[eePin.settings.type],
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

        // (The Python code contained commented-out adjustments based on rotation.)

        kicadPins.push(kiPin);
    });

    return kicadPins;
}

function convertEeRectangles(eeRectangles, eeBbox, kicadVersion) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
    const kicadRectangles = [];

    eeRectangles.forEach(eeRect => {
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

function convertEeCircles(eeCircles, eeBbox, kicadVersion) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;

    return eeCircles.map(eeCircle => new KiSymbolCircle({
        pos_x: toKi(parseInt(eeCircle.center_x) - parseInt(eeBbox.x)),
        pos_y: -toKi(parseInt(eeCircle.center_y) - parseInt(eeBbox.y)),
        radius: toKi(eeCircle.radius),
        background_filling: eeCircle.fill_color,
    }));
}

function convertEeEllipses(eeEllipses, eeBbox, kicadVersion) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;

    // Ellipses are not supported in KiCad; only process circles.
    return eeEllipses
        .filter(ellipse => ellipse.radius_x === ellipse.radius_y)
        .map(ellipse => new KiSymbolCircle({
            pos_x: toKi(parseInt(ellipse.center_x) - parseInt(eeBbox.x)),
            pos_y: -toKi(parseInt(ellipse.center_y) - parseInt(eeBbox.y)),
            radius: toKi(ellipse.radius_x),
        }));
}

function convertEeArcs(eeArcs, eeBbox, kicadVersion) {
    const toKi = kicadVersion === KicadVersion.v5 ? pxToMil : pxToMm;
    const kicadArcs = [];

    eeArcs.forEach(eeArc => {
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

            const { center_x, center_y, angle_end } = computeArc({
