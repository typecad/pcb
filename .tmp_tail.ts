  it('skips rewrite (with a note) when routing statements are not contiguous', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      "import { PCB, TrackBuilder } from '@typecad/pcb';\n" +
        "const typecad = new PCB('t');\n" +
        'let track_VCC: TrackBuilder[] = [];\n' +
        `track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 10, y: 20 }, "F.Cu", 0.2).to({ x: 20, y: 20, layer: "F.Cu", width: 0.2 }));\n` +
        'const notARoute = 42;\n' +
        `track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 30, y: 20 }, "F.Cu", 0.2).to({ x: 40, y: 20, layer: "F.Cu", width: 0.2 }));\n` +
        'typecad.create(\n  ...track_VCC\n);',
    );
    const ir = buildIr(boardWithTrack(25));
    const { changes, notes } = computeRoutingChanges(ir, [file]);
    expect(changes).toEqual([]);
    expect(notes.length).toBe(1);
    expect(notes[0]).toContain('not contiguous');
    expect(fs.readFileSync(file, 'utf-8')).toContain('const notARoute = 42;');
  });

  it('deletes the routing section when the board has no tracks left', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithTrack(20));
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew) (net 0 ""))`);
    const { changes } = computeRoutingChanges(ir, [file]);
    expect(changes.length).toBe(1);
    expect(changes[0].changedProps).toContain('tracks');
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).not.toContain('track_VCC.push');
    expect(applied).not.toContain('...track_VCC');
    expect(analyzeFile(file)).not.toBeNull();
  });
});
