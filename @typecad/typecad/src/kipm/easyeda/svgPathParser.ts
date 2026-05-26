export class SvgPathMoveTo {
    start_x: number;
    start_y: number;
    constructor({ start_x, start_y }: Record<string, any>) {
        this.start_x = parseFloat(start_x);
        this.start_y = parseFloat(start_y);
    }
    static get fields() {
        return ["start_x", "start_y"];
    }
}

export class SvgPathLineTo {
    pos_x: number;
    pos_y: number;
    constructor({ pos_x, pos_y }: Record<string, any>) {
        this.pos_x = parseFloat(pos_x);
        this.pos_y = parseFloat(pos_y);
    }
    static get fields() {
        return ["pos_x", "pos_y"];
    }
}

export class SvgPathEllipticalArc {
    radius_x: number;
    radius_y: number;
    x_axis_rotation: number;
    flag_large_arc: boolean;
    flag_sweep: boolean;
    end_x: number;
    end_y: number;
    constructor({
                    radius_x,
                    radius_y,
                    x_axis_rotation,
                    flag_large_arc,
                    flag_sweep,
                    end_x,
                    end_y,
                }: Record<string, any>) {
        this.radius_x = parseFloat(radius_x);
        this.radius_y = parseFloat(radius_y);
        this.x_axis_rotation = parseFloat(x_axis_rotation);
        this.flag_large_arc = flag_large_arc === "1" || flag_large_arc === 1;
        this.flag_sweep = flag_sweep === "1" || flag_sweep === 1;
        this.end_x = parseFloat(end_x);
        this.end_y = parseFloat(end_y);
    }
    static get fields() {
        return [
            "radius_x",
            "radius_y",
            "x_axis_rotation",
            "flag_large_arc",
            "flag_sweep",
            "end_x",
            "end_y",
        ];
    }
}

export class SvgPathClosePath {
    constructor() {
    }
    static get fields() {
        return [];
    }
}

const svgPathHandlers: Record<string, [any, number]> = {
    "M": [SvgPathMoveTo, 2],
    "A": [SvgPathEllipticalArc, 7],
    "L": [SvgPathLineTo, 2],
    "Z": [SvgPathClosePath, 0],
};

export function parseSvgPath(svgPath: string) {
    if (!svgPath.endsWith(" ")) {
        svgPath += " ";
    }
    svgPath = svgPath.replace(/,/g, " ");

    const regex = /([a-zA-Z])([ ,\-\+.\d]+)/g;
    const matches = svgPath.matchAll(regex);
    const parsedPath: any[] = [];

    for (const match of matches) {
        const command = match[1];
        const argStr = match[2];
        if (svgPathHandlers.hasOwnProperty(command)) {
            const [CmdClass, nbArgs] = svgPathHandlers[command];
            const args = argStr.trim().split(/\s+/);
            if (nbArgs === 0) {
                parsedPath.push(new CmdClass());
            } else {
                for (let i = 0; i < args.length; i += nbArgs) {
                    const fields = CmdClass.fields;
                    const obj: Record<string, any> = {};
                    for (let j = 0; j < nbArgs; j++) {
                        obj[fields[j]] = args[i + j];
                    }
                    parsedPath.push(new CmdClass(obj));
                }
            }
        } else {
            console.warn(`SVG command "${command}" not supported`);
        }
    }
    return parsedPath;
}
