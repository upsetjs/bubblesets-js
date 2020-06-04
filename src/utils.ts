export function linePtSegDistSq(lx1: number, ly1: number, lx2: number, ly2: number, x: number, y: number) {
  // taken from JDK 8 java.awt.geom.Line2D#ptSegDistSq(double, double, double, double, double, double)
  const x1 = lx1;
  const y1 = ly1;
  const x2 = lx2 - x1;
  const y2 = ly2 - y1;
  let px = x - x1;
  let py = y - y1;
  let dotprod = px * x2 + py * y2;
  let projlenSq = 0;

  if (dotprod <= 0) {
    projlenSq = 0;
  } else {
    px = x2 - px;
    py = y2 - py;
    dotprod = px * x2 + py * y2;
    if (dotprod <= 0) {
      projlenSq = 0;
    } else {
      projlenSq = (dotprod * dotprod) / (x2 * x2 + y2 * y2);
    }
  }

  const lenSq = px * px + py * py - projlenSq;
  if (lenSq < 0) {
    return 0;
  }
  return lenSq;
}
