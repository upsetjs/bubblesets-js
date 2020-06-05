import { IRectangle, IPoint } from '../interfaces';
import { Rectangle } from './Rectangle';

export class Area {
  private readonly pixels: Float32Array;
  constructor(
    public readonly pixelGroup: number,
    public readonly x = 0,
    public readonly y = 0,
    public readonly width: number,
    public readonly height: number,
    pixels = new Float32Array(Math.max(0, width * height)).fill(0)
  ) {
    this.pixels = pixels;
  }

  get x2() {
    return this.x + this.width;
  }

  get y2() {
    return this.y + this.height;
  }

  createSub(rect: IRectangle) {
    return new Area(this.pixelGroup, rect.x, rect.y, rect.width, rect.height);
  }

  static fromPixelRegion(rect: IRectangle, pixelGroup: number) {
    return new Area(
      pixelGroup,
      rect.x,
      rect.y,
      Math.ceil(rect.width / pixelGroup),
      Math.ceil(rect.height / pixelGroup)
    );
  }

  copy(rect: IPoint) {
    return new Area(this.pixelGroup, rect.x, rect.y, this.width, this.height, this.pixels);
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

  scale(rect: IRectangle) {
    const x = this.boundX(Math.floor((rect.x - this.x) / this.pixelGroup));
    const y = this.boundY(Math.floor((rect.y - this.y) / this.pixelGroup));
    const x2 = this.boundX(Math.ceil((rect.x + rect.width - this.x) / this.pixelGroup));
    const y2 = this.boundY(Math.ceil((rect.y + rect.height - this.y) / this.pixelGroup));
    const width = x2 - x;
    const height = y2 - y;
    return new Rectangle(x, y, width, height);
  }

  invertScaleX(v: number) {
    return v * this.pixelGroup + this.x;
  }
  invertScaleY(v: number) {
    return v * this.pixelGroup + this.y;
  }

  addPadding(rect: Rectangle, r1: number) {
    const padding = Math.ceil(r1 / this.pixelGroup);
    const x = this.boundX(rect.x - padding);
    const y = this.boundY(rect.y - padding);
    const x2 = this.boundX(rect.x2 + padding);
    const y2 = this.boundY(rect.y2 + padding);
    const width = x2 - x;
    const height = y2 - y;
    return new Rectangle(x, y, width, height);
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

  incArea(area: Area, factor: number) {
    if (area.width <= 0 || area.height <= 0 || factor === 0) {
      return;
    }
    // assume it is within the bounds
    const w = this.width;
    const aw = area.width;
    const base = area.x + area.y * w;
    for (let j = 0; j < area.height; j++) {
      const sRow = base + j * w;
      const tRow = j * aw;
      for (let i = 0; i < area.width; i++) {
        const v = area.pixels[i + tRow];
        if (v === 0) {
          continue;
        }
        this.pixels[i + sRow] += factor * v;
      }
    }
  }

  fill(value: number) {
    this.pixels.fill(value);
  }

  fillArea(rect: IRectangle, value: number) {
    const offset = rect.x + rect.y * this.width;
    for (let j = 0; j < rect.height; j++) {
      const pos = offset + j * this.width;
      this.pixels.fill(value, pos, pos + rect.width);
    }
  }

  fillHorizontalLine(x: number, y: number, width: number, value: number) {
    const offset = x + y * this.width;
    this.pixels.fill(value, offset, offset + width);
  }

  fillVerticalLine(x: number, y: number, height: number, value: number) {
    const offset = x + y * this.width;
    for (let i = 0; i < height; i++) {
      this.pixels[offset + i * this.width] = value;
    }
  }

  clear() {
    this.pixels.fill(0);
  }

  toString() {
    let r = '';
    for (let i = 0; i < this.height; i++) {
      const row = i * this.width;
      for (let j = 0; j < this.width; j++) {
        const v = this.pixels[row + j];
        r += v.toFixed(1).padStart(6);
        r += ' ';
      }
      r += '\n';
    }
    return r;
  }

  draw(ctx: CanvasRenderingContext2D, offset = true) {
    if (this.width <= 0 || this.height <= 0) {
      return;
    }
    ctx.save();
    if (offset) {
      ctx.translate(this.x, this.y);
    }
    const min = this.pixels.reduce((acc, v) => Math.min(acc, v), Number.POSITIVE_INFINITY);
    const max = this.pixels.reduce((acc, v) => Math.max(acc, v), Number.NEGATIVE_INFINITY);

    const scale = (v: number) => (v - min) / (max - min);
    ctx.scale(this.pixelGroup, this.pixelGroup);
    for (let i = 0; i < this.width; i++) {
      for (let j = 0; j < this.height; j++) {
        const v = this.pixels[i + j * this.width];
        ctx.fillStyle = `rgba(0, 0, 0, ${scale(v)})`;
        ctx.fillRect(i, j, 1, 1);
      }
    }
    ctx.restore();
  }

  drawThreshold(ctx: CanvasRenderingContext2D, threshold: number, offset = true) {
    if (this.width <= 0 || this.height <= 0) {
      return;
    }
    ctx.save();
    if (offset) {
      ctx.translate(this.x, this.y);
    }
    ctx.scale(this.pixelGroup, this.pixelGroup);
    for (let i = 0; i < this.width; i++) {
      for (let j = 0; j < this.height; j++) {
        const v = this.pixels[i + j * this.width];
        ctx.fillStyle = v > threshold ? 'black' : 'white';
        ctx.fillRect(i, j, 1, 1);
      }
    }
    ctx.restore();
  }
}
