package org.openpnp.model;

import java.util.*;
import org.simpleframework.xml.*;
import org.simpleframework.xml.core.*;
import org.simpleframework.xml.stream.*;

// Enums live in org.openpnp.model, as in the real source.
enum LengthUnit { Millimeters }
enum Side { Top, Bottom }
enum PlacementType { Placement, Fiducial, Place, Ignore }
enum BoardPadType { Paste, Ignore }

class Location {
    @Attribute LengthUnit units;
    @Attribute(required=false) double x;
    @Attribute(required=false) double y;
    @Attribute(required=false) double z;
    @Attribute(required=false) double rotation;
    Location() {}
}

// abstract pad hierarchy, same FQNs as OpenPnP — the class= attribute resolves here
class Pad {
    @Attribute LengthUnit units;
    Pad() {}
    public static class Ellipse extends Pad {
        @Attribute double width;
        @Attribute double height;
        Ellipse() {}
    }
    public static class Circle extends Pad {
        @Attribute double radius;
        Circle() {}
    }
    public static class RoundRectangle extends Pad {
        @Attribute double width;
        @Attribute double height;
        @Attribute(required=false) double roundness;
        RoundRectangle() {}
    }
}

class GeometricPath2D {
    @Attribute LengthUnit units;
    @Attribute Integer windingRule;               // bare @Attribute = REQUIRED
    @ElementList ArrayList<Integer> segmentTypes;
    @ElementList ArrayList<Double> segmentPoints;
    java.awt.geom.Path2D.Double path = new java.awt.geom.Path2D.Double();
    GeometricPath2D() {}
    @Commit public void commit() {                // OpenPnP's code, fall-through included
        if (windingRule != null) path.setWindingRule(windingRule);
        if (segmentTypes != null && segmentPoints != null) {
            int idx = 0;
            for (int segType : segmentTypes) {
                switch (segType) {
                    case java.awt.geom.PathIterator.SEG_MOVETO:
                        path.moveTo(segmentPoints.get(idx), segmentPoints.get(idx+1));
                        idx += 2;
                    case java.awt.geom.PathIterator.SEG_LINETO:
                        path.lineTo(segmentPoints.get(idx), segmentPoints.get(idx+1));
                        idx += 2;
                        break;
                    case java.awt.geom.PathIterator.SEG_QUADTO:
                        path.quadTo(segmentPoints.get(idx), segmentPoints.get(idx+1),
                                segmentPoints.get(idx+2), segmentPoints.get(idx+3));
                        idx += 4;
                        break;
                    case java.awt.geom.PathIterator.SEG_CUBICTO:
                        path.curveTo(segmentPoints.get(idx), segmentPoints.get(idx+1),
                                segmentPoints.get(idx+2), segmentPoints.get(idx+3),
                                segmentPoints.get(idx+4), segmentPoints.get(idx+5));
                        idx += 6;
                        break;
                    case java.awt.geom.PathIterator.SEG_CLOSE:
                        path.closePath();
                        break;
                }
            }
            if (idx != segmentPoints.size())
                throw new IllegalStateException("point count mismatch: consumed " + idx + " of " + segmentPoints.size());
        }
    }
}

class Placement {
    @Version(revision=1.4) private double version;
    @Attribute(required=false) String id;
    @Attribute Side side;
    @Attribute(required=false) String partId;
    @Attribute(required=false) PlacementType type;
    @Attribute(required=false) boolean enabled = true;
    @Element(required=false) Location location;
    Placement() {}
    @Commit private void commit() {               // OpenPnP's body
        if (partId != null) {
            org.openpnp.model.Configuration.get().getPart(partId); // null-safe in the real code
        }
        if (type == PlacementType.Ignore) { type = PlacementType.Placement; enabled = false; }
        if (type == PlacementType.Place) { type = PlacementType.Placement; }
    }
}

class BoardPad {
    @Attribute(required=false) BoardPadType type = BoardPadType.Paste;
    @Attribute Side side;
    @Attribute(required=false) String name;
    @Element Location location;
    @Element Pad pad;                             // abstract — resolved via class=
    BoardPad() {}
}

@Root(name = "openpnp-board")
class Board {
    @Version(revision=1.1) private double version;
    @Attribute(required=false) String name;
    @Element(required=false) Location dimensions;
    @Element(required=false) GeometricPath2D profile;
    @ElementList(required=false) ArrayList<BoardPad> solderPastePads;
    @ElementList(required=false) ArrayList<Placement> placements;
    Board() {}
}

class Footprint {
    @Attribute LengthUnit units;
    @Attribute(required=false) double bodyWidth;
    @Attribute(required=false) double bodyHeight;
    @ElementList(inline=true, required=false) ArrayList<Pad> pads = new ArrayList<>();
    Footprint() {}
    // Footprint's OWN inner Pad (name/x/y shape) — shadows the abstract Pad
    static class Pad {
        @Attribute String name;
        @Attribute double x;
        @Attribute double y;
        @Attribute double width;
        @Attribute double height;
        @Attribute(required=false) double rotation = 0;
        @Attribute(required=false) double roundness = 0;
        Pad() {}
    }
}

class Pkg {
    @Attribute String id;
    @Attribute(required=false) String description;
    @Element(required=false) Footprint footprint;
    Pkg() {}
}

@Root(name = "openpnp-packages")
class PackagesHolder {
    @ElementList(inline=true, entry="package", required=false) ArrayList<Pkg> packages = new ArrayList<>();
    PackagesHolder() {}
}

class Part {
    @Attribute String id;
    @Attribute(required=false) String name;
    @Attribute LengthUnit heightUnits;
    @Attribute double height;
    @Attribute String packageId;
    @Attribute(required=false) double speed = 1.0;
    Part() {}
}

@Root(name = "openpnp-parts")
class PartsHolder {
    @ElementList(inline=true, entry="part", required=false) ArrayList<Part> parts = new ArrayList<>();
    PartsHolder() {}
}

class Configuration {
    static Configuration inst = new Configuration();
    static Configuration get() { return inst; }
    java.util.Map<String, Object> parts = new LinkedHashMap<>();
    Object getPart(String id) { if (id == null) return null; return parts.get(id.toUpperCase()); }
}
