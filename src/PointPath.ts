import { shapeSimplifier, bSplineShapeGenerator } from './simplifiers';
import { Line } from './model';

export declare type Point = { x: number; y: number };

export class PointPath {
  readonly points: ReadonlyArray<Point>;
  readonly closed: boolean;

  constructor(points: ReadonlyArray<Point> = [], closed = true) {
    this.points = points;
    this.closed = closed;
  }

  get(index: number): Point {
    let i = index;
    const l = this.points.length;
    if (index < 0) {
      return this.closed ? this.get(index + l) : this.points[0];
    } else if (index >= l) {
      return this.closed ? this.get(index - l) : this.points[l - 1];
    }
    return this.points[i];
  }

  get length() {
    return this.points.length;
  }

  toString() {
    const points = this.points;
    if (points.length === 0) {
      return '';
    }
    let r = 'M';
    for (const p of points) {
      r += `${p.x},${p.y} L`;
    }
    r = r.slice(0, -1);
    if (this.closed) {
      r += ' Z';
    }
    return r;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const points = this.points;
    if (points.length === 0) {
      return;
    }
    ctx.beginPath();

    ctx.moveTo(points[0].x, points[0].y);

    for (const p of points) {
      ctx.lineTo(p.x, p.y);
    }

    if (this.closed) {
      ctx.closePath();
    }
  }

  simplify(tolerance?: number) {
    return shapeSimplifier(tolerance)(this);
  }

  bSplines(granularity?: number) {
    return bSplineShapeGenerator(granularity)(this);
  }

  apply(transformer: (path: PointPath) => PointPath) {
    return transformer(this);
  }

  withinArea(px: number, py: number) {
    if (this.length === 0) {
      return false;
    }
    let crossings = 0;
    const first = this.points[0]!;
    const line = new Line(first.x, first.y, first.x, first.y);

    for (let i = 1; i < this.points.length; i++) {
      const cur = this.points[i];
      line.x1 = line.x2;
      line.y1 = line.y2;
      line.x2 = cur.x;
      line.y2 = cur.y;

      if (line.cuts(px, py)) {
        crossings++;
      }
    }
    // close to start
    line.x1 = line.x2;
    line.y1 = line.y2;
    line.x2 = first.x;
    line.y2 = first.y;

    if (line.cuts(px, py)) {
      crossings++;
    }

    return crossings % 2 == 1;
  }
}
