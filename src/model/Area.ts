export class Area {
  private readonly pixels: Float32Array;
  constructor(public readonly width: number, public readonly height: number) {
    this.pixels = new Float32Array(width * height);
  }

  bound(pos: number, isX: boolean) {
    if (pos < 0) return 0;
    return Math.min(pos, (isX ? this.width : this.height) - 1);
  }

  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return Number.NaN;
    }
    return this.pixels[x + y * this.width];
  }

  set(x: number, y: number, v: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }
    this.pixels[x + y * this.width] = v;
  }
}
