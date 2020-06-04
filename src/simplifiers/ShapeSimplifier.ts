import { PointPath } from '../PointPath';
import { linePtSegDistSq } from '../utils';

class State {
  end: number;
  constructor(private readonly path: PointPath, private readonly start: number) {
    this.end = start + 1;
  }

  advanceEnd() {
    this.end += 1;
  }
  decreaseEnd() {
    this.end -= 1;
  }
  validEnd() {
    return this.path.closed ? this.end < this.path.length : this.end < this.path.length - 1;
  }
  endPoint() {
    return this.path.get(this.end);
  }
  startPoint() {
    return this.path.get(this.start);
  }
  lineDstSqr(ix: number) {
    const p = this.path.get(ix);
    const s = this.startPoint();
    const e = this.endPoint();
    return linePtSegDistSq(s[0], s[1], e[0], e[1], p[0], p[1]);
  }
  canTakeNext(toleranceSquared: number) {
    if (!this.validEnd()) {
      return false;
    }
    let ok = true;
    this.advanceEnd();
    for (let ix = this.start + 1; ix < this.end; ix += 1) {
      if (this.lineDstSqr(ix) > toleranceSquared) {
        ok = false;
        break;
      }
    }
    this.decreaseEnd();
    return ok;
  }
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
      var s = new State(path, start);
      while (s.canTakeNext(toleranceSquared)) {
        s.advanceEnd();
      }
      start = s.end;
      points.push(s.startPoint());
    }
    return new PointPath(points);
  };
}
