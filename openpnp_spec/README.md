# OpenPnP output verification

`typecad-pcb export pos/bom/assembly --profile openpnp` writes files in
OpenPnP's formats. OpenPnP's readers have quirks that plain "looks like
their XML" reasoning misses — three of them bit us, each found by loading
the file with the actual deserializer OpenPnP uses:

1. `winding-rule` is a **required** attribute on `<profile>` (a bare
   `@Attribute` on `GeometricPath2D` — a nullable field type means nothing).
2. `GeometricPath2D.commit()` has a **fall-through** in its switch:
   `SEG_MOVETO` also executes the `SEG_LINETO` branch, consuming 4 points
   for the first entry. OpenPnP's own `persist()` writes 2, so their
   write/read pair is asymmetric upstream; we append the first vertex once
   more so the fall-through's extra `lineTo` lands back on the start.
3. `BoardPad.pad` is the **abstract** `org.openpnp.model.Pad` — the
   concrete `Pad$RoundRectangle`/`Pad$Circle` is picked by simple-xml's
   `class=` attribute. (The `name/x/y` pad shape belongs to
   `Footprint.Pad`, which is only correct inside `packages.xml`.)

## The harness

`tools/` holds Java stubs mirroring OpenPnP's annotated model — same
package (`org.openpnp.model`), same field names (simple-xml's HyphenStyle
derives every element/attribute name from them), same `@Version` fields,
and `GeometricPath2D`'s commit body **verbatim**, fall-through included.
Run our generated files through it and you exercise the same binding +
commit logic OpenPnP runs at board load, without launching the app:

```bash
cd openpnp_spec/tools
curl -sL -o simple-xml.jar \
  https://repo1.maven.org/maven2/com/subshell/simpleframework/simple-xml/2.9.0/simple-xml-2.9.0.jar
mkdir -p org/openpnp/model && cp OpenPnpModel.java org/openpnp/model/Model.java
javac -cp simple-xml.jar -d . org/openpnp/model/Model.java Runner.java
java -cp ".;simple-xml.jar" org.openpnp.model.Runner \
  <path/to/board.board.xml> <board-packages.xml> <board-parts.xml>
```

Expected output for a healthy set: `OK placements=… pastePads=…
firstPadShape=… bounds=<the board outline rectangle>` per file.

To regression-test a quirk, hand-edit a generated file back to the broken
shape and confirm the harness fails — e.g. strip `winding-rule` (fails
with the required-attribute error), drop the duplicated first vertex
(fails with an IndexOutOfBounds, which OpenPnP's dialog shows as an empty
"board load failed"), or replace a `<pad class=…>` with a plain
`<pad name=…>` (fails to instantiate the abstract Pad).

The jar is not checked in (425 KB, fetchable from Maven Central); sources
mirror `develop` as of 2026-10 and are refreshed by copying the annotated
fields of `Board`/`PlacementsHolder`/`Placement`/`BoardPad`/`Pad`/
`Footprint`/`Part` from the OpenPnP repo.
