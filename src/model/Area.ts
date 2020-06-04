export class Area {
  private readonly pixels: Float32Array;
  constructor(
    public readonly width: number,
    public readonly height: number,
    public readonly x = 0,
    public readonly y = 0
  ) {
    this.pixels = new Float32Array(Math.max(0, width * height));
  }

  bound(pos: number, isX: boolean) {
    if (pos < 0) {
      return 0;
    }
    return Math.min(pos, (isX ? this.width : this.height) - 1);
  }
  boundX(pos: number) {
    if (pos < 0) {
      return 0;
    }
    if (pos >= this.width) {
      return this.width - 1;
    }
    return pos;
  }

  boundY(pos: number) {
    if (pos < 0) {
      return 0;
    }
    if (pos >= this.height) {
      return this.height - 1;
    }
    return pos;
  }

  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return Number.NaN;
    }
    return this.pixels[x + y * this.width];
  }

  inc(x: number, y: number, v: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }
    this.pixels[x + y * this.width] += v;
  }

  set(x: number, y: number, v: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }
    this.pixels[x + y * this.width] = v;
  }

  incArea(area: Area) {
    if (area.width <= 0 || area.height <= 0) {
      return;
    }
    // assume it is within the bounds
    const w = this.width;
    const base = area.x + area.y * w;
    // copy by row
    for (let j = 0; j < area.height; j++) {
      this.pixels.set(area.pixels.subarray(j * area.width, area.width), base + j * w);
    }
  }
}
