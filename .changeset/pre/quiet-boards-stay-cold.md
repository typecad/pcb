---
'@typecad/pcb': patch
---

the thermal (Copper ΔT) view no longer paints its relatively-hottest trace
full-scale white on a thermally quiet board: the auto ramp is now floored at
1 °C, so a board whose every rise is millidegrees renders all-cold instead of
clamping a 3.7 m°C hairline to the white end of the stops while the hover
readout says "+0.0°C". The hover rise itself now prints in engineering
notation ("trace +3.71m°C ≈ 25.0°C"), so the color scale and the status text
can never disagree about the same trace. The "color by margin" path is
unchanged — a user-specified allowed rise still sets the scale exactly.
