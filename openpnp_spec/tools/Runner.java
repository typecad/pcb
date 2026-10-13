package org.openpnp.model;

import java.io.File;
import org.simpleframework.xml.core.Persister;

import org.simpleframework.xml.convert.AnnotationStrategy;
import org.simpleframework.xml.stream.Format;
import org.simpleframework.xml.stream.HyphenStyle;

public class Runner {
    static org.simpleframework.xml.Serializer openpnpSerializer() {
        return new Persister(new AnnotationStrategy(), new Format(new HyphenStyle()));
    }
    public static void main(String[] args) throws Exception {
        var s = openpnpSerializer();
        for (String file : args) {
            try {
                if (file.endsWith("packages.xml")) {
                    PackagesHolder h = s.read(PackagesHolder.class, new File(file));
                    System.out.println(file + ": OK packages=" + h.packages.size()
                        + " pads=" + h.packages.stream().mapToInt(p -> p.footprint == null ? 0 : p.footprint.pads.size()).sum());
                } else if (file.endsWith("parts.xml")) {
                    PartsHolder h = s.read(PartsHolder.class, new File(file));
                    System.out.println(file + ": OK parts=" + h.parts.size());
                } else {
                    Board b = s.read(Board.class, new File(file));
                    String extra = "";
                    if (b.profile != null) extra = " windingRule=" + b.profile.windingRule
                        + " segTypes=" + b.profile.segmentTypes.size()
                        + " segPts=" + b.profile.segmentPoints.size()
                        + " bounds=" + b.profile.path.getBounds2D();
                    String shapes = "-";
                    if (b.solderPastePads != null && !b.solderPastePads.isEmpty())
                        shapes = b.solderPastePads.get(0).pad.getClass().getSimpleName() + "/" + b.solderPastePads.size();
                    System.out.println(file + ": OK placements=" + b.placements.size()
                        + " pastePads=" + (b.solderPastePads == null ? 0 : b.solderPastePads.size())
                        + " firstPadShape=" + shapes + extra);
                }
            } catch (Throwable e) {
                String m = e.getMessage();
                System.out.println(file + ": FAIL " + (m == null ? e.getClass().getSimpleName() + " (no message)" : m.split("\n")[0]));
            }
        }
    }
}
