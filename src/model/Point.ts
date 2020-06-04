export class Point {
  constructor(public x: number, public y: number) {}

  get p(): [number, number] {
    return [this.x, this.y];
  }

  static ptsDistanceSq(x1: number, y1: number, x2: number, y2: number) {
    return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
  }

  static doublePointsEqual(x1: number, y1: number, x2: number, y2: number, delta: number) {
    return Point.ptsDistanceSq(x1, y1, x2, y2) < delta * delta;
  }

  toString() {
    return `${this.x}x${this.y}`;
  }
}
