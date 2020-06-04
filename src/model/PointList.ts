import { PointPath, Point } from '../PointPath';

export class PointList {
  private count = 0;
  private readonly arr: Point[] = [];
  private readonly set = new Set<string>();

  constructor(size = 0) {
    this.arr.length = size; // pre-allocating
  }

  add(p: Point) {
    this.set.add(`${p.x}x${p.y}`);
    this.arr[this.count++] = p;
  }

  contains(p: Point) {
    return this.set.has(`${p.x}x${p.y}`);
  }

  isFirst(p: Point) {
    if (this.count === 0) {
      return false;
    }
    const o = this.arr[0];
    return o != null && o.x === p.x && o.y === p.y;
  }

  path() {
    return new PointPath(this.arr.slice(0, this.count));
  }

  clear() {
    // for (let i = 0; i < this.count; i++) {
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
