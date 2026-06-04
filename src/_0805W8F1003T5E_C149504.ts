import { Component } from "@typecad/typecad";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | _1  | unspecified      |
 | 2     | _2  | unspecified      |
 */
export class _0805W8F1003T5E_C149504 extends Component {
    _1 = this.pin(1, { type: 'unspecified' });
    _2 = this.pin(2, { type: 'unspecified' });
    
    constructor(reference?: string | undefined) {
        super("lib:R0805");
        this.symbol = "0805W8F1003T5E_C149504:0805W8F1003T5E_C149504";
        if (reference) this.reference = reference;
    }
}