import { parse, SNode, isList } from '@typecad/typecad/dist/sexpr/index.js';

export interface ChangeDescription {
    type: 'added' | 'removed' | 'modified';
    category: 'component' | 'track' | 'via' | 'zone' | 'text' | 'graphic' | 'setup';
    description: string;
    ref?: string;
    layer?: string;
    x?: number;
    y?: number;
}

export interface TextualDiff {
    changes: ChangeDescription[];
    summary: string;
}

interface FootprintData {
    uuid: string;
    ref: string;
    value: string;
    footprintName: string;
    layer: string;
    x: number;
    y: number;
    rotation: number;
}

interface SegmentData {
    uuid: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    width: number;
    layer: string;
    net: string;
}

interface ViaData {
    uuid: string;
    x: number;
    y: number;
    size: number;
    drill: number;
    layers: string;
    net: string;
}

function extractFootprints(tree: SNode): Map<string, FootprintData> {
    const map = new Map<string, FootprintData>();
    for (const fp of tree.findAll('footprint')) {
        const uuid = fp.child('uuid')?.stringValue || '';
        if (!uuid) continue;

        let ref = '';
        let value = '';
        for (const prop of fp.children('property')) {
            const propName = prop.getString(1);
            if (propName === 'Reference') ref = prop.getString(2) || '';
            if (propName === 'Value') value = prop.getString(2) || '';
        }

        const atNode = fp.child('at');
        map.set(uuid, {
            uuid,
            ref,
            value,
            footprintName: fp.getString(1) || '',
            layer: fp.child('layer')?.stringValue || '',
            x: atNode?.getNumber(1) || 0,
            y: atNode?.getNumber(2) || 0,
            rotation: atNode?.getNumber(3, 0) || 0,
        });
    }
    return map;
}

function extractSegments(tree: SNode): Map<string, SegmentData> {
    const map = new Map<string, SegmentData>();
    for (const seg of tree.findAll('segment')) {
        const uuid = seg.child('uuid')?.stringValue || '';
        if (!uuid) continue;

        const start = seg.child('start');
        const end = seg.child('end');
        map.set(uuid, {
            uuid,
            startX: start?.getNumber(1) || 0,
            startY: start?.getNumber(2) || 0,
            endX: end?.getNumber(1) || 0,
            endY: end?.getNumber(2) || 0,
            width: seg.child('width')?.getNumber(1) || 0,
            layer: seg.child('layer')?.stringValue || '',
            net: seg.child('net')?.stringValue || '',
        });
    }
    return map;
}

function extractVias(tree: SNode): Map<string, ViaData> {
    const map = new Map<string, ViaData>();
    for (const via of tree.findAll('via')) {
        const uuid = via.child('uuid')?.stringValue || '';
        if (!uuid) continue;

        const atNode = via.child('at');
        const layersStr = via.child('layers')?.joinedStringValue || '';
        map.set(uuid, {
            uuid,
            x: atNode?.getNumber(1) || 0,
            y: atNode?.getNumber(2) || 0,
            size: via.child('size')?.getNumber(1) || 0,
            drill: via.child('drill')?.getNumber(1) || 0,
            layers: layersStr.replace(/\s+/g, ' \u2194 '),
            net: via.child('net')?.stringValue || '',
        });
    }
    return map;
}

function fmt(x: number, y: number): string {
    return `(${x}, ${y})`;
}

function netLabel(net: string): string {
    return net ? `net: ${net}` : 'unassigned';
}

function compareFootprints(
    orig: Map<string, FootprintData>,
    mod: Map<string, FootprintData>,
    changes: ChangeDescription[]
) {
    for (const [uuid, fp] of mod) {
        if (!orig.has(uuid)) {
            changes.push({
                type: 'added',
                category: 'component',
                description: `${fp.ref} added (${fp.value}, ${fp.layer})`,
                ref: fp.ref,
                layer: fp.layer,
                x: fp.x,
                y: fp.y,
            });
        }
    }
    for (const [uuid, fp] of orig) {
        if (!mod.has(uuid)) {
            changes.push({
                type: 'removed',
                category: 'component',
                description: `${fp.ref} removed (${fp.value})`,
                ref: fp.ref,
                layer: fp.layer,
                x: fp.x,
                y: fp.y,
            });
        }
    }
    for (const [uuid, m] of mod) {
        const o = orig.get(uuid);
        if (!o) continue;

        const parts: string[] = [];
        if (o.x !== m.x || o.y !== m.y || o.rotation !== m.rotation) {
            if (o.rotation !== m.rotation) {
                parts.push(`moved ${fmt(o.x, o.y)} \u2192 ${fmt(m.x, m.y)}, rotated ${o.rotation}\u00B0 \u2192 ${m.rotation}\u00B0`);
            } else {
                parts.push(`moved ${fmt(o.x, o.y)} \u2192 ${fmt(m.x, m.y)}`);
            }
        }
        if (o.layer !== m.layer) parts.push(`layer ${o.layer} \u2192 ${m.layer}`);
        if (o.value !== m.value) parts.push(`value "${o.value}" \u2192 "${m.value}"`);

        if (parts.length > 0) {
            changes.push({
                type: 'modified',
                category: 'component',
                description: `${m.ref} ${parts.join(', ')}`,
                ref: m.ref,
                layer: m.layer,
                x: m.x,
                y: m.y,
            });
        }
    }
}

function compareSegments(
    orig: Map<string, SegmentData>,
    mod: Map<string, SegmentData>,
    changes: ChangeDescription[]
) {
    for (const [uuid, seg] of mod) {
        if (!orig.has(uuid)) {
            changes.push({
                type: 'added',
                category: 'track',
                description: `Track added on ${seg.layer} ${fmt(seg.startX, seg.startY)} \u2192 ${fmt(seg.endX, seg.endY)} (${netLabel(seg.net)})`,
                layer: seg.layer,
                x: (seg.startX + seg.endX) / 2,
                y: (seg.startY + seg.endY) / 2,
            });
        }
    }
    for (const [uuid, seg] of orig) {
        if (!mod.has(uuid)) {
            changes.push({
                type: 'removed',
                category: 'track',
                description: `Track removed on ${seg.layer} ${fmt(seg.startX, seg.startY)} \u2192 ${fmt(seg.endX, seg.endY)} (${netLabel(seg.net)})`,
                layer: seg.layer,
                x: (seg.startX + seg.endX) / 2,
                y: (seg.startY + seg.endY) / 2,
            });
        }
    }
    for (const [uuid, m] of mod) {
        const o = orig.get(uuid);
        if (!o) continue;

        const parts: string[] = [];
        if (o.startX !== m.startX || o.startY !== m.startY) parts.push(`start ${fmt(o.startX, o.startY)} \u2192 ${fmt(m.startX, m.startY)}`);
        if (o.endX !== m.endX || o.endY !== m.endY) parts.push(`end ${fmt(o.endX, o.endY)} \u2192 ${fmt(m.endX, m.endY)}`);
        if (o.width !== m.width) parts.push(`width ${o.width} \u2192 ${m.width}`);
        if (o.layer !== m.layer) parts.push(`layer ${o.layer} \u2192 ${m.layer}`);
        if (o.net !== m.net) parts.push(`net "${o.net || 'unassigned'}" \u2192 "${m.net || 'unassigned'}"`);

        if (parts.length > 0) {
            changes.push({
                type: 'modified',
                category: 'track',
                description: `Track modified on ${m.layer} (${parts.join(', ')})`,
                layer: m.layer,
                x: (m.startX + m.endX) / 2,
                y: (m.startY + m.endY) / 2,
            });
        }
    }
}

function compareVias(
    orig: Map<string, ViaData>,
    mod: Map<string, ViaData>,
    changes: ChangeDescription[]
) {
    for (const [uuid, via] of mod) {
        if (!orig.has(uuid)) {
            changes.push({
                type: 'added',
                category: 'via',
                description: `Via added at ${fmt(via.x, via.y)} (${via.layers}, ${netLabel(via.net)})`,
                layer: via.layers,
                x: via.x,
                y: via.y,
            });
        }
    }
    for (const [uuid, via] of orig) {
        if (!mod.has(uuid)) {
            changes.push({
                type: 'removed',
                category: 'via',
                description: `Via removed at ${fmt(via.x, via.y)} (${via.layers})`,
                layer: via.layers,
                x: via.x,
                y: via.y,
            });
        }
    }
    for (const [uuid, m] of mod) {
        const o = orig.get(uuid);
        if (!o) continue;

        const parts: string[] = [];
        if (o.x !== m.x || o.y !== m.y) parts.push(`moved ${fmt(o.x, o.y)} \u2192 ${fmt(m.x, m.y)}`);
        if (o.size !== m.size) parts.push(`size ${o.size} \u2192 ${m.size}`);
        if (o.drill !== m.drill) parts.push(`drill ${o.drill} \u2192 ${m.drill}`);
        if (o.net !== m.net) parts.push(`net "${o.net || 'unassigned'}" \u2192 "${m.net || 'unassigned'}"`);

        if (parts.length > 0) {
            changes.push({
                type: 'modified',
                category: 'via',
                description: `Via modified at ${fmt(m.x, m.y)} (${parts.join(', ')})`,
                layer: m.layers,
                x: m.x,
                y: m.y,
            });
        }
    }
}

export function computeTextualDiff(originalContent: string, modifiedContent: string): TextualDiff {
    const origParsed = parse(originalContent);
    const modParsed = parse(modifiedContent);

    if (!isList(origParsed) || !isList(modParsed)) {
        return { changes: [], summary: 'Unable to parse PCB files' };
    }

    const origTree = SNode.from(origParsed);
    const modTree = SNode.from(modParsed);

    const changes: ChangeDescription[] = [];

    compareFootprints(extractFootprints(origTree), extractFootprints(modTree), changes);
    compareSegments(extractSegments(origTree), extractSegments(modTree), changes);
    compareVias(extractVias(origTree), extractVias(modTree), changes);

    const added = changes.filter(c => c.type === 'added').length;
    const removed = changes.filter(c => c.type === 'removed').length;
    const modified = changes.filter(c => c.type === 'modified').length;

    let summary: string;
    if (changes.length === 0) {
        summary = 'No differences found';
    } else {
        const detailParts: string[] = [];
        if (added) detailParts.push(`${added} added`);
        if (removed) detailParts.push(`${removed} removed`);
        if (modified) detailParts.push(`${modified} modified`);
        summary = `${changes.length} change${changes.length !== 1 ? 's' : ''}: ${detailParts.join(', ')}`;
    }

    return { changes, summary };
}
