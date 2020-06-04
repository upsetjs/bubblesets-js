import { Point } from './Point';
import { Line } from './Line';
import { Rectangle } from './Rectangle';

export enum EState {
  POINT = 1,
  PARALLEL = 2,
  COINCIDENT = 3,
  NONE = 4,
}

export class Intersection {
  constructor(public readonly point: Point | null, public readonly state: EState) {}
}

export function intersectLineLine(la: Line, lb: Line) {
  const uaT = (lb.x2 - lb.x1) * (la.y1 - lb.y1) - (lb.y2 - lb.y1) * (la.x1 - lb.x1);
  const ubT = (la.x2 - la.x1) * (la.y1 - lb.y1) - (la.y2 - la.y1) * (la.x1 - lb.x1);
  const uB = (lb.y2 - lb.y1) * (la.x2 - la.x1) - (lb.x2 - lb.x1) * (la.y2 - la.y1);
  if (uB) {
    const ua = uaT / uB;
    const ub = ubT / uB;
    if (0 <= ua && ua <= 1 && 0 <= ub && ub <= 1) {
      const p = new Point(la.x1 + ua * (la.x2 - la.x1), la.y1 + ua * (la.y2 - la.y1));
      return new Intersection(p, EState.POINT);
    }
    return new Intersection(null, EState.NONE);
  }
  return new Intersection(null, uaT == 0 || ubT == 0 ? EState.COINCIDENT : EState.PARALLEL);
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
      countIntersections += 1;
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
      countIntersections += 1;
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

export function testIntersection(line: Line, bounds: Rectangle, intersections: Intersection[]) {
  let countIntersections = 0;

  function fillIntersection(ix: number, xa: number, ya: number, xb: number, yb: number) {
    intersections[ix] = intersectLineLine(line, new Line(xa, ya, xb, yb));
    if (intersections[ix].state == EState.POINT) {
      countIntersections += 1;
    }
  }

  // top
  fillIntersection(0, bounds.x, bounds.y, bounds.x2, bounds.y);
  // left
  fillIntersection(1, bounds.x, bounds.y, bounds.x, bounds.y2);
  // bottom
  fillIntersection(2, bounds.x, bounds.y2, bounds.x2, bounds.y2);
  // right
  fillIntersection(3, bounds.x2, bounds.y, bounds.x2, bounds.y2);
  return countIntersections;
}
