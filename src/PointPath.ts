export declare type Point = [number, number];

export class PointPath {
  private readonly points: Point[];

  closed = true;

  constructor(points: ReadonlyArray<Point> = []) {
    this.points = points.slice();
  }

  add(point: Point) {
    this.points.push(point);
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

  apply(transformer: (path: PointPath) => PointPath) {
    return transformer(this);
  }
}
