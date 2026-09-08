export function getMiddleArcPos({
  center_x,
  center_y,
  radius,
  angle_start,
  angle_end,
}: {
  center_x: number;
  center_y: number;
  radius: number;
  angle_start: number;
  angle_end: number;
}) {
  const middle_angle = (angle_start + angle_end) / 2;
  const x = center_x + radius * Math.cos(middle_angle);
  const y = center_y + radius * Math.sin(middle_angle);
  return { x, y };
}
