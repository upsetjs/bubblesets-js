import { PointPath } from '../PointPath';

function basicFunction(i: number, t: number) {
  // the basis function for a cubic B spline
  switch (i) {
    case -2:
      return (((-t + 3.0) * t - 3.0) * t + 1.0) / 6.0;
    case -1:
      return ((3.0 * t - 6.0) * t * t + 4.0) / 6.0;
    case 0:
      return (((-3.0 * t + 3.0) * t + 3.0) * t + 1.0) / 6.0;
    case 1:
      return (t * t * t) / 6.0;
    default:
      throw new Error('unknown error');
  }
}

export function bSplineShapeGenerator(granularity = 6.0) {
  const ORDER = 3;
  const START_INDEX = ORDER - 1;
  const REL_END = 1;
  const REL_START = REL_END - ORDER;

  const clockwise = true;

  function getRelativeIndex(index: number, relIndex: number) {
    return index + (clockwise ? relIndex : -relIndex);
  }
  function calcPoint(path: PointPath, i: number, t: number): [number, number] {
    let px = 0.0;
    let py = 0.0;
    for (let j = REL_START; j <= REL_END; j += 1) {
      const p = path.get(getRelativeIndex(i, j));
      const bf = basicFunction(j, t);
      px += bf * p[0];
      py += bf * p[1];
    }
    return [px, py];
  }

  return (path: PointPath) => {
    // covering special cases
    if (path.length < 3) {
      return path;
    }
    // actual b-spline calculation
    const res = new PointPath([]);
    const count = path.length + ORDER - 1;
    const closed = path.closed;
    res.add(calcPoint(path, START_INDEX - (closed ? 0 : 2), 0));
    for (let ix = START_INDEX - (closed ? 0 : 2); ix < count + (closed ? 0 : 2); ix += 1) {
      for (let k = 1; k <= granularity; k += 1) {
        res.add(calcPoint(path, ix, k / granularity));
      }
    }
    return res;
  };
}
