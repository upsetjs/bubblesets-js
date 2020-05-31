export declare type Point = [number, number];

export class PointPath {
  private readonly points: Point[];

  closed = true;

  constructor(points: ReadonlyArray<Point>) {
    this.points = points.slice();
  }

  addAll(points: ReadonlyArray<Point>) {
    points.forEach((p) => this.add(p));
  }

  add(point: Point) {
    this.points.push(point);
  }

  get(index: number) {
    let i = index;
    const l = this.points.length;
    if (index < 0) {
      i = this.closed ? this.length - (index % l) : 0;
    } else if (index >= l) {
      i = this.closed ? i % l : l - 1;
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
