export declare type Point = [number, number];

export class PointPath {
  private readonly points: Point[];

  closed = true;

  constructor(points: ReadonlyArray<Point> = []) {
    this.points = points.slice();
  }

  addAll(points: ReadonlyArray<Point>) {
    points.forEach((p) => this.add(p));
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
    let path = this.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
    if (this.points.length > 0 && this.closed) {
      path += ' Z';
    }
    return path;
  }

  apply(transformer: (path: PointPath) => PointPath) {
    return transformer(this);
  }
}
