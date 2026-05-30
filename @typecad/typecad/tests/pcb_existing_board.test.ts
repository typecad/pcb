import { describe, it, expect } from 'vitest';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { parse, s, sym, nameOf } from '../src/sexpr/index.js';
import type { SExpr } from '../src/sexpr/types.js';
import { normalizeNetName } from '../src/pcb/pcb_utils.js';
import { insertNetsIntoBoardContents } from '../src/pcb/pcb_existing_board.js';

describe('pcb_existing_board', () => {
    describe('insertNetsIntoBoardContents', () => {
        it('should return boardContents unchanged when nets is empty', () => {
            const contents: SExpr[] = [sym('version'), sym('setup')];
            const result = insertNetsIntoBoardContents(contents, []);
            expect(result).toEqual(contents);
        });

        it('should insert nets and remove existing net definitions', () => {
            const existingNet: SExpr[] = [sym('net'), 1, 'VCC'];
            const newNet: SExpr[] = [sym('net'), 2, 'GND'];
            const contents: SExpr[] = [sym('version'), existingNet, sym('setup')];
            const result = insertNetsIntoBoardContents(contents, [newNet]);
            expect(result.some((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'net' && item[2] === 'GND')).toBe(true);
            expect(result.some((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'net' && item[2] === 'VCC')).toBe(false);
        });

        it('should insert nets after setup/layers/paper/general markers', () => {
            const net1: SExpr[] = [sym('net'), 0, ''];
            const net2: SExpr[] = [sym('net'), 1, 'VCC'];
            const contents: SExpr[] = [s('version'), s('general'), s('setup')];
            const result = insertNetsIntoBoardContents(contents, [net1, net2]);
            const setupIdx = result.findIndex((item) => {
                if (Array.isArray(item) && item.length > 0) return nameOf(item[0]) === 'setup';
                return false;
            });
            expect(setupIdx).toBeGreaterThanOrEqual(0);
            const net0Idx = result.findIndex((item) => {
                if (Array.isArray(item) && item.length > 1) return nameOf(item[0]) === 'net' && item[1] === 0;
                return false;
            });
            expect(net0Idx).toBeGreaterThan(setupIdx);
        });
    });
});

describe('normalizeNetName in existing board context', () => {
    it('should strip leading / for board net lookup', () => {
        expect(normalizeNetName('/VCC')).toBe('vcc');
        expect(normalizeNetName('GND')).toBe('gnd');
    });

    it('should return lowercase', () => {
        expect(normalizeNetName('MyNet')).toBe('mynet');
    });
});
