//x, y
export declare type IPoint = [number, number];

export interface IRect {
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

export interface IArea {
  width: number;
  height: number;
}

export class BubbleSet {
  static readonly DEFAULT_MAX_ROUTING_ITERATIONS: 100;
  static readonly DEFAULT_MAX_MARCHING_ITERATIONS: 20;
  static readonly DEFAULT_PIXEL_GROUP: 4;
  static readonly DEFAULT_EDGE_R0: 10;
  static readonly DEFAULT_EDGE_R1: 20;
  static readonly DEFAULT_NODE_R0: 15;
  static readonly DEFAULT_NODE_R1: 50;
  static readonly DEFAULT_MORPH_BUFFER: 15;
  static readonly DEFAULT_SKIP: 8;

  maxRoutingIterations(): number;
  maxRoutingIterations(value: number): void;

  maxMarchingIterations(): number;
  maxMarchingIterations(value: number): void;

  pixelGroup(): number;
  pixelGroup(value: number): void;

  edgeR0(): number;
  edgeR0(value: number): void;

  edgeR1(): number;
  edgeR1(value: number): void;

  nodeR0(): number;
  nodeR0(value: number): void;

  nodeR1(): number;
  nodeR1(value: number): void;

  morphBuffer(): number;
  morphBuffer(value: number): void;

  skip(): number;
  skip(value: number): void;

  createOutline(members: IRect[], notMembers: IRect[], edges: ILine[]): IPoint[];

  addPadding(rects: IRect[], radius: number): IRect[];

  linePtSegDistSq(lx1: number, ly1: number, lx2: number, ly2: number, x: number, y: number): number;
}

export interface ITransformer {
  apply(path: PointPath): PointPath;
}

export interface PointPath {
  new(points?: IPoint[]): PointPath;

  closed(): boolean;

  closed(value: boolean): void;

  addAll(points: IPoint[]): void;

  add(point: IPoint): void;

  size(): number;

  get(index: number): IPoint;

  forEach(callback: (point: IPoint, index) => void): void;

  isEmpty(): boolean;

  transform(transform: ITransformer[]): PointPath;

  /**
   * svg path element compatible string
   * @returns {string}
   */
  toString(): string;
}

export interface ShapeSimplifier extends ITransformer {
  new(tolerance: number): ShapeSimplifier;

  tolerance(): number;

  tolerance(value: number): void;

  isDisabled(): boolean;
}

export interface BSplineShapeGenerator extends ITransformer {
  new(): BSplineShapeGenerator;

  granularity(): number;

  granularity(value: number): void;
}
