import { PointPath } from '../PointPath';
import { linePtSegDistSq } from '../utils';

function canTakeNext(path: PointPath, start: number, end: number, toleranceSquared: number) {
  const validEnd = path.closed ? end < path.length : end < path.length - 1;
  if (!validEnd) {
    return false;
  }

  const s = path.get(start);
  const e = path.get(end + 1);

  for (let index = start + 1; index <= end; index++) {
    const p = path.get(index);
    const len = linePtSegDistSq(s[0], s[1], e[0], e[1], p[0], p[1]);
    if (len > toleranceSquared) {
      return false;
    }
  }
  return true;
}

export function shapeSimplifier(tolerance = 0.0) {
  return (path: PointPath) => {
    if (tolerance < 0 || path.length < 3) {
      return path;
    }
    const points: [number, number][] = [];
    let start = 0;
    const toleranceSquared = tolerance * tolerance;
    while (start < path.length) {
      let end = start + 1;
      while (canTakeNext(path, start, end, toleranceSquared)) {
        end++;
      }
      points.push(path.get(start));
      start = end;
    }
    return new PointPath(points);
  };
}
