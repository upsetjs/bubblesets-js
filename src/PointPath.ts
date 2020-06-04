import { shapeSimplifier, bSplineShapeGenerator } from './simplifiers';

export declare type Point = [number, number];

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
      r += `${p[0]},${p[1]} L`;
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

    ctx.moveTo(points[0][0], points[0][1]);

    for (const p of points) {
      ctx.lineTo(p[0], p[1]);
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
}
