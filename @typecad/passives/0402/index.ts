import { Component, type ComponentInit } from '@typecad/typecad'
import { sizes } from '../src/configs.js'
const c = sizes['0402'];

export class Resistor extends Component {
    constructor(opts: ComponentInit = {}) {
        super({ ...opts, footprint: opts.footprint || c.Resistor.footprint, symbol: opts.symbol || c.Resistor.symbol });
    }
}

export class Capacitor extends Component {
    constructor(opts: ComponentInit = {}) {
        super({ ...opts, footprint: opts.footprint || c.Capacitor.footprint, symbol: opts.symbol || c.Capacitor.symbol });
    }
}

export class Inductor extends Component {
    constructor(opts: ComponentInit = {}) {
        super({ ...opts, footprint: opts.footprint || c.Inductor.footprint, symbol: opts.symbol || c.Inductor.symbol });
    }
}

export class Diode extends Component {
    constructor(opts: ComponentInit = {}) {
        super({ ...opts, footprint: opts.footprint || c.Diode.footprint, symbol: opts.symbol || c.Diode.symbol });
    }
}

export class LED extends Component {
    constructor(opts: ComponentInit = {}) {
        super({ ...opts, footprint: opts.footprint || c.LED.footprint, symbol: opts.symbol || c.LED.symbol, prefix: 'D' });
    }
}
