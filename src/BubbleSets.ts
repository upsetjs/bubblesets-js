import { ILine, IRectangle, IPoint, ICircle } from './interfaces';
import { calculateVirtualEdges } from './internal/routing';
import { Area } from './model/Area';
import { Line } from './model/Line';
import { marchingSquares } from './model/MarchingSquares';
import { Rectangle, boundingBox } from './model/Rectangle';
import { PointPath } from './PointPath';
import { addPadding } from './padding';
import { createRectangleInfluenceArea, createLineInfluenceArea } from './internal/potentialAreas';

export interface IOutlineOptions {
  maxRoutingIterations?: number;
  maxMarchingIterations?: number;
  pixelGroup?: number;
  edgeR0?: number;
  edgeR1?: number;
  nodeR0?: number;
  nodeR1?: number;
  morphBuffer?: number;
  skip?: number;

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
};

export function createOutline(
  members: ReadonlyArray<IRectangle>,
  nonMembers: ReadonlyArray<IRectangle> = [],
  edges: ReadonlyArray<ILine> = [],
  options: IOutlineOptions = {}
) {
  const o = Object.assign({}, defaultOptions, options);

  if (members.length === 0) {
    return new PointPath([]);
  }

  const memberItems = members.map(Rectangle.from);
  const nonMemberItems = nonMembers.map(Rectangle.from);

  // calculate and store virtual edges
  const edgeItems = calculateVirtualEdges(memberItems, nonMemberItems, o.maxRoutingIterations, o.morphBuffer);
  for (const e of edges) {
    edgeItems.push(Line.from(e));
  }
  const activeRegion = computeActiveRegion(memberItems, edgeItems, o);
  const nonMembersInRegion = nonMemberItems.filter((item) => activeRegion.intersects(item));

  const potentialArea = Area.fromPixelRegion(activeRegion, o.pixelGroup);

  const cache = new Map<string, Area>();
  const createArea = (rect: Rectangle) => {
    const key = `${rect.width}x${rect.height}`;
    if (cache.has(key)) {
      const r = cache.get(key)!;
      return potentialArea.copy(r, addPadding(rect, o.nodeR1));
    }
    const r = createRectangleInfluenceArea(rect, potentialArea, o.nodeR1);
    cache.set(key, r);
    return r;
  };
  const memberAreas = memberItems.map(createArea);
  const nonMemberAreas = nonMembersInRegion.map(createArea);
  const edgeAreas = edgeItems.map((line) => createLineInfluenceArea(line, potentialArea, o.edgeR1));

  let threshold = 1;
  let nodeInfluenceFactor = 1;
  let edgeInfluenceFactor = 1;
  let negativeNodeInfluenceFactor = -0.8;

  const nodeRDiff = o.nodeR0 - o.nodeR1;
  // using inverse a for numerical stability
  const nodeInfA = nodeRDiff * nodeRDiff;
  const edgeInfA = (o.edgeR0 - o.edgeR1) * (o.edgeR0 - o.edgeR1);

  // try to march, check if surface contains all items
  for (let iterations = 0; iterations < o.maxMarchingIterations; iterations++) {
    potentialArea.clear();

    // add all positive energy (included items) first, as negative energy
    // (morphing) requires all positives to be already set
    if (nodeInfluenceFactor !== 0) {
      const f = nodeInfluenceFactor / nodeInfA;
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
    if (negativeNodeInfluenceFactor !== 0) {
      const f = negativeNodeInfluenceFactor / nodeInfA;
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
      nodeInfluenceFactor *= 1.2;
      edgeInfluenceFactor *= 1.2;
    } else if (negativeNodeInfluenceFactor != 0 && nonMembersInRegion.length > 0) {
      // after half the iterations, start increasing positive energy and lowering the threshold
      negativeNodeInfluenceFactor *= 0.8;
    } else {
      break;
    }
  }

  o.debugContainer.potentialArea = potentialArea;
  o.debugContainer.threshold = threshold;
  // cannot find a solution
  return new PointPath([]);
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
