import { Line } from './Line';
import { Rectangle } from './Rectangle';

export enum EState {
  POINT = 1,
  PARALLEL = 2,
  COINCIDENT = 3,
  NONE = 4,
}

export class Intersection {
  constructor(public readonly state: EState, public readonly x = 0, public readonly y = 0) {}
}

export function intersectLineLine(la: Line, lb: Line) {
  const uaT = (lb.x2 - lb.x1) * (la.y1 - lb.y1) - (lb.y2 - lb.y1) * (la.x1 - lb.x1);
  const ubT = (la.x2 - la.x1) * (la.y1 - lb.y1) - (la.y2 - la.y1) * (la.x1 - lb.x1);
  const uB = (lb.y2 - lb.y1) * (la.x2 - la.x1) - (lb.x2 - lb.x1) * (la.y2 - la.y1);
  if (uB) {
    const ua = uaT / uB;
    const ub = ubT / uB;
    if (0 <= ua && ua <= 1 && 0 <= ub && ub <= 1) {
      return new Intersection(EState.POINT, la.x1 + ua * (la.x2 - la.x1), la.y1 + ua * (la.y2 - la.y1));
    }
    return new Intersection(EState.NONE);
  }
  return new Intersection(uaT == 0 || ubT == 0 ? EState.COINCIDENT : EState.PARALLEL);
}

export function fractionAlongLineA(la: Line, lb: Line) {
  const uaT = (lb.x2 - lb.x1) * (la.y1 - lb.y1) - (lb.y2 - lb.y1) * (la.x1 - lb.x1);
  const ubT = (la.x2 - la.x1) * (la.y1 - lb.y1) - (la.y2 - la.y1) * (la.x1 - lb.x1);
  const uB = (lb.y2 - lb.y1) * (la.x2 - la.x1) - (lb.x2 - lb.x1) * (la.y2 - la.y1);
  if (uB) {
    const ua = uaT / uB;
    const ub = ubT / uB;
    if (0 <= ua && ua <= 1 && 0 <= ub && ub <= 1) {
      return ua;
    }
  }
  return Number.POSITIVE_INFINITY;
}

export function fractionToLineCenter(bounds: Rectangle, line: Line) {
  let minDistance = Number.POSITIVE_INFINITY;
  let countIntersections = 0;

  function testLine(xa: number, ya: number, xb: number, yb: number) {
    let testDistance = fractionAlongLineA(line, new Line(xa, ya, xb, yb));
    testDistance = Math.abs(testDistance - 0.5);
    if (testDistance >= 0 && testDistance <= 1) {
      countIntersections++;
      if (testDistance < minDistance) {
        minDistance = testDistance;
      }
    }
  }

  // top
  testLine(bounds.x, bounds.y, bounds.x2, bounds.y);
  // left
  testLine(bounds.x, bounds.y, bounds.x, bounds.y2);
  if (countIntersections > 1) {
    return minDistance;
  }
  // bottom
  testLine(bounds.x, bounds.y2, bounds.x2, bounds.y2);
  if (countIntersections > 1) {
    return minDistance;
  }
  // right
  testLine(bounds.x2, bounds.y, bounds.x2, bounds.y2);
  // if no intersection, return -1
  if (countIntersections == 0) {
    return -1;
  }
  return minDistance;
}

export function fractionToLineEnd(bounds: Rectangle, line: Line) {
  let minDistance = Number.POSITIVE_INFINITY;
  let countIntersections = 0;

  function testLine(xa: number, ya: number, xb: number, yb: number) {
    const testDistance = fractionAlongLineA(line, new Line(xa, ya, xb, yb));
    if (testDistance >= 0 && testDistance <= 1) {
      countIntersections++;
      if (testDistance < minDistance) {
        minDistance = testDistance;
      }
    }
  }

  // top
  testLine(bounds.x, bounds.y, bounds.x2, bounds.y);
  // left
  testLine(bounds.x, bounds.y, bounds.x, bounds.y2);
  if (countIntersections > 1) {
    return minDistance;
  }
  // bottom
  testLine(bounds.x, bounds.y2, bounds.x2, bounds.y2);
  if (countIntersections > 1) {
    return minDistance;
  }
  // right
  testLine(bounds.x2, bounds.y, bounds.x2, bounds.y2);
  // if no intersection, return -1
  if (countIntersections == 0) {
    return -1;
  }
  return minDistance;
}

export function testIntersection(line: Line, bounds: Rectangle) {
  let count = 0;
  // top
  const top = intersectLineLine(line, new Line(bounds.x, bounds.y, bounds.x2, bounds.y));
  count += top.state === EState.POINT ? 1 : 0;
  // left
  const left = intersectLineLine(line, new Line(bounds.x, bounds.y, bounds.x, bounds.y2));
  count += left.state === EState.POINT ? 1 : 0;
  // bottom
  const bottom = intersectLineLine(line, new Line(bounds.x, bounds.y2, bounds.x2, bounds.y2));
  count += bottom.state === EState.POINT ? 1 : 0;
  // right
  const right = intersectLineLine(line, new Line(bounds.x2, bounds.y, bounds.x2, bounds.y2));
  count += right.state === EState.POINT ? 1 : 0;

  return { top, left, bottom, right, count };
}
