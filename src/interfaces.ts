export interface IRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ILine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function rect(x: number, y: number, width: number, height: number): IRectangle {
  return { x, y, width, height };
}

export function line(x1: number, y1: number, x2: number, y2: number): ILine {
  return { x1, y1, x2, y2 };
}
