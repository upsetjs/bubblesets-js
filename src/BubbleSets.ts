import { ILine, IRectangle, IPoint, ICircle, ICenterPoint } from './interfaces';
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

function isEqual(a: IRectangle | ICircle, b: IRectangle | ICircle) {
  if (isCircle(a) !== isCircle(b)) {
    return false;
  }
  if (isCircle(a)) {
    const bc = b as ICircle;
    return a.cx === bc.cx && a.cy === bc.cy && a.radius === bc.radius;
  }
  const br = b as IRectangle;
  return a.x === br.x && a.y === br.y && a.width === br.width && a.height === br.height;
}

enum EDirty {
  MEMBERS,
  NON_MEMBERS,
  EDGES,
}

interface IMember {
  readonly raw: IRectangle | ICircle;
  obj: Rectangle | Circle;
  area: Area | null;
}

interface IEdge {
  readonly raw: ILine;
  obj: Line;
  area: Area | null;
}

export class BubbleSets {
  private readonly dirty = new Set<EDirty>();
  private readonly o: Required<IOutlineOptions>;
  private readonly members: IMember[] = [];
  private readonly nonMembers: IMember[] = [];
  private virtualEdges: IEdge[] = [];
  private readonly edges: IEdge[] = [];

  private activeRegion = new Rectangle(0, 0, 0, 0);
  private potentialArea = new Area(1, 0, 0, 0, 0, 0, 0);

  constructor(options: IOutlineOptions = {}) {
    this.o = Object.assign({}, defaultOptions, options);
  }

  pushMember(...members: ReadonlyArray<IRectangle | ICircle>) {
    if (members.length === 0) {
      return;
    }
    this.dirty.add(EDirty.MEMBERS);
    for (const v of members) {
      this.members.push({
        raw: v,
        obj: isCircle(v) ? Circle.from(v) : Rectangle.from(v),
        area: null,
      });
    }
  }

  removeMember(member: IRectangle | ICircle) {
    const index = this.members.findIndex((d) => isEqual(d.raw, member));
    if (index < 0) {
      return false;
    }
    this.members.splice(index, 1);
    this.dirty.add(EDirty.MEMBERS);
    return true;
  }

  removeNonMember(nonMember: IRectangle | ICircle) {
    const index = this.nonMembers.findIndex((d) => isEqual(d.raw, nonMember));
    if (index < 0) {
      return false;
    }
    this.nonMembers.splice(index, 1);
    this.dirty.add(EDirty.NON_MEMBERS);
    return true;
  }

  removeEdge(edge: ILine) {
    const index = this.edges.findIndex((d) => d.obj.equals(edge));
    if (index < 0) {
      return false;
    }
    this.edges.splice(index, 1);
    this.dirty.add(EDirty.NON_MEMBERS);
    return true;
  }

  pushNonMember(...nonMembers: ReadonlyArray<IRectangle | ICircle>) {
    if (nonMembers.length === 0) {
      return;
    }
    this.dirty.add(EDirty.NON_MEMBERS);
    for (const v of nonMembers) {
      this.nonMembers.push({
        raw: v,
        obj: isCircle(v) ? Circle.from(v) : Rectangle.from(v),
        area: null,
      });
    }
  }

  pushEdge(...edges: ReadonlyArray<ILine>) {
    if (edges.length === 0) {
      return;
    }
    this.dirty.add(EDirty.EDGES);
    for (const v of edges) {
      this.edges.push({
        raw: v,
        obj: Line.from(v),
        area: null,
      });
    }
  }

  private update() {
    const dirtyMembers = this.dirty.has(EDirty.MEMBERS);
    const dirtyNonMembers = this.dirty.has(EDirty.NON_MEMBERS);
    let dirtyEdges = this.dirty.has(EDirty.EDGES);
    this.dirty.clear();

    const memberObjs = this.members.map((d) => d.obj);
    if (dirtyMembers || dirtyNonMembers) {
      // update virtual edges
      const nonMembersAsRects = this.nonMembers.map((d) =>
        d.obj instanceof Rectangle ? d.obj : Rectangle.from(d.obj)
      );
      const virtualEdges = calculateVirtualEdges(
        memberObjs,
        nonMembersAsRects,
        this.o.maxRoutingIterations,
        this.o.morphBuffer
      );

      const old = new Map<string, Area | null>(this.virtualEdges.map((e) => [e.obj.toString(), e.area]));
      // reuse edge areas if possible
      this.virtualEdges = virtualEdges.map((e) => ({
        raw: e,
        obj: e,
        area: old.get(e.toString()) ?? null,
      }));
      dirtyEdges = true;
    }

    let activeRegionDirty = false;
    if (dirtyMembers || dirtyEdges) {
      // update the active region
      const edgesObj = this.virtualEdges.concat(this.edges).map((e) => e.obj);
      const bb = computeActiveRegion(memberObjs, edgesObj);
      const padding = Math.max(this.o.edgeR1, this.o.nodeR1) + this.o.morphBuffer;
      const activeRegion = Rectangle.from(addPadding(bb, padding));
      if (!activeRegion.equals(this.activeRegion)) {
        activeRegionDirty = true;
        this.activeRegion = activeRegion;
      }
    }

    if (activeRegionDirty) {
      const potentialWidth = Math.ceil(this.activeRegion.width / this.o.pixelGroup);
      const potentialHeight = Math.ceil(this.activeRegion.height / this.o.pixelGroup);

      if (this.activeRegion.x !== this.potentialArea.pixelX || this.activeRegion.y !== this.potentialArea.pixelY) {
        // full recreate
        this.potentialArea = Area.fromPixelRegion(this.activeRegion, this.o.pixelGroup);
        this.members.forEach((m) => (m.area = null));
        this.nonMembers.forEach((m) => (m.area = null));
        this.edges.forEach((m) => (m.area = null));
        this.virtualEdges.forEach((m) => (m.area = null));
      } else if (potentialWidth !== this.potentialArea.width || potentialHeight !== this.potentialArea.height) {
        // recreate but we can keep the existing areas
        this.potentialArea = Area.fromPixelRegion(this.activeRegion, this.o.pixelGroup);
      }
    }

    // update
    const existing = new Map<string, Area>();
    const addCache = (m: IMember) => {
      if (m.area) {
        const key = `${m.obj.width}x${m.obj.height}x${m.obj instanceof Rectangle ? 'R' : 'C'}`;
        existing.set(key, m.area);
      }
    };
    const createOrAddCache = (m: IMember) => {
      if (m.area) {
        return;
      }
      const key = `${m.obj.width}x${m.obj.height}x${m.obj instanceof Rectangle ? 'R' : 'C'}`;
      if (existing.has(key)) {
        const r = existing.get(key)!;
        m.area = this.potentialArea.copy(r, { x: m.obj.x - this.o.nodeR1, y: m.obj.y - this.o.nodeR1 });
        return;
      }
      const r =
        m.obj instanceof Rectangle
          ? createRectangleInfluenceArea(m.obj, this.potentialArea, this.o.nodeR1)
          : createGenericInfluenceArea(m.obj, this.potentialArea, this.o.nodeR1);
      m.area = r;
      existing.set(key, r);
    };
    this.members.forEach(addCache);
    this.nonMembers.forEach(addCache);

    this.members.forEach(createOrAddCache);
    this.nonMembers.forEach((m) => {
      if (!this.activeRegion.intersects(m.obj)) {
        m.area = null;
      } else {
        createOrAddCache(m);
      }
    });

    this.edges.forEach((edge) => {
      if (!edge.area) {
        edge.area = createLineInfluenceArea(edge.obj, this.potentialArea, this.o.edgeR1);
      }
    });
    this.virtualEdges.forEach((edge) => {
      if (!edge.area) {
        edge.area = createLineInfluenceArea(edge.obj, this.potentialArea, this.o.edgeR1);
      }
    });
  }

  compute() {
    if (this.members.length === 0) {
      return new PointPath([]);
    }

    if (this.dirty.size > 0) {
      this.update();
    }

    const { o, potentialArea } = this;

    const memberObjs = this.members.map((m) => m.obj);
    const nonMembersInRange = this.nonMembers.filter((d) => d.area != null);

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
        for (const item of this.members) {
          // add node energy
          potentialArea.incArea(item.area!, f);
        }
      }

      if (edgeInfluenceFactor !== 0) {
        // add the influence of all the virtual edges
        const f = edgeInfluenceFactor / edgeInfA;
        for (const line of this.edges) {
          potentialArea.incArea(line.area!, f);
        }
        for (const line of this.virtualEdges) {
          potentialArea.incArea(line.area!, f);
        }
      }

      // calculate negative energy contribution for all other visible items within bounds
      if (nonMemberInfluenceFactor !== 0) {
        const f = nonMemberInfluenceFactor / nodeInfA;
        for (const item of nonMembersInRange) {
          // add node energy
          potentialArea.incArea(item.area!, f);
        }
      }

      // compute contour
      const contour = marchingSquares(potentialArea, threshold);
      if (contour) {
        // check if we hit all members
        const sampled = sampleContour(contour, o);
        if (coversAllMembers(memberObjs, sampled)) {
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
      } else if (nonMemberInfluenceFactor != 0 && nonMembersInRange.length > 0) {
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
  bb.pushMember(...members);
  bb.pushNonMember(...nonMembers);
  bb.pushEdge(...edges);
  return bb.compute();
}

function computeActiveRegion(memberItems: IRectangle[], edgeItems: Line[]) {
  if (memberItems.length === 0) {
    return new Rectangle(0, 0, 0, 0);
  }
  const activeRegion = Rectangle.from(memberItems[0]);
  for (const m of memberItems) {
    activeRegion.add(m);
  }
  for (const l of edgeItems) {
    activeRegion.add(l.asRect());
  }
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

function coversAllMembers(members: ReadonlyArray<ICenterPoint>, path: PointPath) {
  const bb = boundingBox(path.points);
  if (!bb) {
    return false;
  }
  return members.every((member) => {
    return bb.containsPt(member.cx, member.cy) && path.withinArea(member.cx, member.cy);
  });
}
