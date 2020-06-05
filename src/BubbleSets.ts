import { ILine, IRectangle, IPoint, ICircle } from './interfaces';
import { calculateVirtualEdges } from './internal/routing';
import { Area } from './model/Area';
import { Line } from './model/Line';
import { marchingSquares } from './model/MarchingSquares';
import { Rectangle, boundingBox } from './model/Rectangle';
import { PointPath } from './PointPath';
import { addPadding } from './padding';
import {
  createRectangleInfluenceArea,
  createLineInfluenceArea,
  createGenericInfluenceArea,
} from './internal/potentialAreas';
import { Circle } from './model';

export interface IOutlineOptions {
  /**
   * how many pixels per potential area group to improve speed
   * @default 4
   */
  pixelGroup?: number;

  /**
   * maximum number of iterations when computing routes between members
   * @default 100
   */
  maxRoutingIterations?: number;

  /**
   * maximum number of iterations when computing the contour
   * @default 20
   */
  maxMarchingIterations?: number;

  edgeR0?: number;
  edgeR1?: number;
  nodeR0?: number;
  nodeR1?: number;
  morphBuffer?: number;
  skip?: number;

  threshold?: number;
  memberInfluenceFactor?: number;
  edgeInfluenceFactor?: number;
  nonMemberInfluenceFactor?: number;

  /**
   * if provided it will store some debug helpers like the potential area used
   */
  debugContainer?: { potentialArea?: Area; threshold?: number };
}

const defaultOptions: Required<IOutlineOptions> = {
  maxRoutingIterations: 100,
  maxMarchingIterations: 20,
  pixelGroup: 4,
  edgeR0: 10,
  edgeR1: 20,
  nodeR0: 15,
  nodeR1: 50,
  morphBuffer: 10,
  skip: 8,
  debugContainer: {},

  threshold: 1,
  memberInfluenceFactor: 1,
  edgeInfluenceFactor: 1,
  nonMemberInfluenceFactor: -0.8,
};

function isCircle(v: IRectangle | ICircle): v is ICircle {
  return v != null && typeof (v as ICircle).radius === 'number';
}

export class BubbleSets {
  private readonly o: Required<IOutlineOptions>;
  private readonly members: (Rectangle | Circle)[] = [];
  private readonly nonMembers: Rectangle[] = [];
  private readonly givenEdges: Line[] = [];
  private edges: Line[] = [];

  private activeRegion: Rectangle = new Rectangle(0, 0, 0, 0);
  private potentialArea: Area = new Area(1, 0, 0, 0, 0, 0, 0);
  private memberAreas: Area[] = [];
  private nonMembersInRegion: Rectangle[] = [];
  private nonMemberAreas: Area[] = [];
  private edgeAreas: Area[] = [];

  constructor(options: IOutlineOptions = {}) {
    this.o = Object.assign({}, defaultOptions, options);
  }

  pushAll(
    members: ReadonlyArray<IRectangle | ICircle>,
    nonMembers: ReadonlyArray<IRectangle> = [],
    edges: ReadonlyArray<ILine> = []
  ) {
    for (const v of members) {
      this.members.push(isCircle(v) ? Circle.from(v) : Rectangle.from(v));
    }
    for (const v of nonMembers) {
      this.nonMembers.push(Rectangle.from(v));
    }
    for (const edge of edges) {
      this.givenEdges.push(Line.from(edge));
    }
    this.updateEdges();
    this.updateAreas();
  }

  private updateEdges() {
    // calculate and store virtual edges
    this.edges = calculateVirtualEdges(this.members, this.nonMembers, this.o.maxRoutingIterations, this.o.morphBuffer);
    for (const e of this.givenEdges) {
      this.edges.push(e);
    }
  }

  private updateAreas() {
    this.activeRegion = computeActiveRegion(this.members, this.edges, this.o);
    this.nonMembersInRegion = this.nonMembers.filter((item) => this.activeRegion.intersects(item));
    this.potentialArea = Area.fromPixelRegion(this.activeRegion, this.o.pixelGroup);

    const cache = new Map<string, Area>();
    const createArea = (rect: Rectangle | Circle) => {
      const key = `${rect.width}x${rect.height}x${rect instanceof Rectangle ? 'R' : 'C'}`;
      if (cache.has(key)) {
        const r = cache.get(key)!;
        return this.potentialArea.copy(r, { x: rect.x - this.o.nodeR1, y: rect.y - this.o.nodeR1 });
      }
      const r =
        rect instanceof Rectangle
          ? createRectangleInfluenceArea(rect, this.potentialArea, this.o.nodeR1)
          : createGenericInfluenceArea(rect, this.potentialArea, this.o.nodeR1);
      cache.set(key, r);
      return r;
    };
    this.memberAreas = this.members.map(createArea);
    this.nonMemberAreas = this.nonMembersInRegion.map(createArea);
    this.edgeAreas = this.edges.map((line) => createLineInfluenceArea(line, this.potentialArea, this.o.edgeR1));
  }

  compute() {
    if (this.members.length === 0) {
      return new PointPath([]);
    }

    const { members: memberItems, o, memberAreas, nonMemberAreas, edgeAreas, nonMembersInRegion, potentialArea } = this;

    let threshold = o.threshold;
    let memberInfluenceFactor = o.memberInfluenceFactor;
    let edgeInfluenceFactor = o.edgeInfluenceFactor;
    let nonMemberInfluenceFactor = o.nonMemberInfluenceFactor;

    // using inverse a for numerical stability
    const nodeInfA = (o.nodeR0 - o.nodeR1) * (o.nodeR0 - o.nodeR1);
    const edgeInfA = (o.edgeR0 - o.edgeR1) * (o.edgeR0 - o.edgeR1);

    // try to march, check if surface contains all items
    for (let iterations = 0; iterations < o.maxMarchingIterations; iterations++) {
      potentialArea.clear();

      // add all positive energy (included items) first, as negative energy
      // (morphing) requires all positives to be already set
      if (memberInfluenceFactor !== 0) {
        const f = memberInfluenceFactor / nodeInfA;
        for (const item of memberAreas) {
          // add node energy
          potentialArea.incArea(item, f);
        }
      }

      if (edgeInfluenceFactor !== 0) {
        // add the influence of all the virtual edges
        const f = edgeInfluenceFactor / edgeInfA;
        for (const line of edgeAreas) {
          potentialArea.incArea(line, f);
        }
      }

      // calculate negative energy contribution for all other visible items within bounds
      if (nonMemberInfluenceFactor !== 0) {
        const f = nonMemberInfluenceFactor / nodeInfA;
        for (const item of nonMemberAreas) {
          // add node energy
          potentialArea.incArea(item, f);
        }
      }

      // compute contour
      const contour = marchingSquares(potentialArea, threshold);
      if (contour) {
        // check if we hit all members
        const sampled = sampleContour(contour, o);
        if (coversAllMembers(memberItems, sampled)) {
          // found a valid path
          o.debugContainer.potentialArea = potentialArea;
          o.debugContainer.threshold = threshold;
          return sampled;
        }
      }

      // prepare for next iteration

      // reduce negative influences first; this will allow the surface to
      // pass without making it fatter all around (which raising the threshold does)
      threshold *= 0.95;
      if (iterations <= o.maxMarchingIterations * 0.5) {
        memberInfluenceFactor *= 1.2;
        edgeInfluenceFactor *= 1.2;
      } else if (nonMemberInfluenceFactor != 0 && nonMembersInRegion.length > 0) {
        // after half the iterations, start increasing positive energy and lowering the threshold
        nonMemberInfluenceFactor *= 0.8;
      } else {
        break;
      }
    }

    this.o.debugContainer.potentialArea = potentialArea;
    this.o.debugContainer.threshold = threshold;
    // cannot find a solution
    return new PointPath([]);
  }
}

export function createOutline(
  members: ReadonlyArray<IRectangle | ICircle>,
  nonMembers: ReadonlyArray<IRectangle> = [],
  edges: ReadonlyArray<ILine> = [],
  options: IOutlineOptions = {}
) {
  if (members.length === 0) {
    return new PointPath([]);
  }
  const bb = new BubbleSets(options);
  bb.pushAll(members, nonMembers, edges);
  return bb.compute();
}

function computeActiveRegion(
  memberItems: IRectangle[],
  edgeItems: Line[],
  o: Required<IOutlineOptions> & IOutlineOptions
) {
  let activeRegion = Rectangle.from(memberItems[0]);
  for (const m of memberItems) {
    activeRegion.add(m);
  }
  for (const l of edgeItems) {
    activeRegion.add(l.asRect());
  }
  const padding = Math.max(o.edgeR1, o.nodeR1) + o.morphBuffer;
  activeRegion = Rectangle.from(addPadding(activeRegion, padding));
  return activeRegion;
}

function sampleContour(contour: PointPath, o: Required<IOutlineOptions>) {
  // start with global SKIP value, but decrease skip amount if there aren't enough points in the surface
  let skip = o.skip;
  // prepare viz attribute array
  let size = contour.length;

  if (skip > 1) {
    size = Math.floor(contour.length / skip);
    // if we reduced too much (fewer than three points in reduced surface) reduce skip and try again
    while (size < 3 && skip > 1) {
      skip -= 1;
      size = Math.floor(contour.length / skip);
    }
  }

  const finalHull: IPoint[] = [];
  // copy hull values
  for (let i = 0, j = 0; j < size; j++, i += skip) {
    finalHull.push(contour.get(i));
  }
  return new PointPath(finalHull);
}

function coversAllMembers(members: ReadonlyArray<ICircle>, path: PointPath) {
  const bb = boundingBox(path.points);
  if (!bb) {
    return false;
  }
  return members.every((member) => {
    return bb.containsPt(member.cx, member.cy) && path.withinArea(member.cx, member.cy);
  });
}
