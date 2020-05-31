import { Point } from './Point';

export class PointList {
  private count = 0;
  private readonly arr: Point[] = [];
  private readonly set = new Set<string>();

  constructor(size: number) {
    this.arr.length = size; // pre-allocating
  }

  add(p: Point) {
    this.set.add(p.toString());
    this.arr[this.count++] = p;
  }
  contains(p: Point) {
    return this.set.has(p.toString());
  }
  isFirst(p: Point) {
    const o = this.arr[0];
    return o != null && o.x === p.x && o.y === p.y;
  }

  list() {
    return this.arr.slice(0, this.count).map((p) => p.p);
  }

  clear() {
    // for (let i = 0; i < this.count; i += 1) {
    //   this.arr[i] = null; // nulling is cheaper than deleting or reallocating
    // }
    this.set.clear();
    this.count = 0;
  }

  get(ix: number) {
    return this.arr[ix];
  }

  get length() {
    return this.count;
  }
}
