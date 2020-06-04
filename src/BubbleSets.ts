import { Area } from './model/Area';
import { EState, fractionToLineCenter, Intersection, testIntersection } from './model/Intersection';
import { Line } from './model/Line';
import { marchingSquares } from './model/MarchingSquares';
import { Point } from './model/Point';
import { PointList } from './model/PointList';
import { Rectangle } from './model/Rectangle';
import { PointPath } from './PointPath';
import { ILine, IRectangle } from './interfaces';

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
  const edgeItems = calculateVirtualEdges(memberItems, nonMemberItems, o);
  for (const e of edges) {
    edgeItems.push(Line.from(e));
  }
  const activeRegion = computeActiveRegion(memberItems, edgeItems, o);

  const potentialArea = new Area(
    Math.ceil(activeRegion.width / o.pixelGroup),
    Math.ceil(activeRegion.height / o.pixelGroup)
  );

  const memberAreas = memberItems.map((rect) =>
    createRectangleInfluenceArea(activeRegion, o.pixelGroup, potentialArea, o.nodeR1, rect)
  );
  const nonMembersInRegion = nonMemberItems.filter((item) => activeRegion.intersects(item));
  const nonMemberAreas = nonMembersInRegion.map((rect) =>
    createRectangleInfluenceArea(activeRegion, o.pixelGroup, potentialArea, o.nodeR1, rect)
  );

  let threshold = 1;
  let nodeInfluenceFactor = 1;
  let edgeInfluenceFactor = 1;
  let negativeNodeInfluenceFactor = -0.8;

  const nodeRDiff = o.nodeR0 - o.nodeR1;
  // using inverse a for numerical stability
  const nodeInfA = nodeRDiff * nodeRDiff;
  const edgeInfA = (o.edgeR0 - o.edgeR1) * (o.edgeR0 - o.edgeR1);
  const estLength = (Math.floor(activeRegion.width) + Math.floor(activeRegion.height)) * 2;
  const surface = new PointList(estLength);

  const fillPotentialArea = () => {
    // add all positive energy (included items) first, as negative energy
    // (morphing) requires all positives to be already set
    if (nodeInfluenceFactor !== 0) {
      const f = nodeInfluenceFactor / nodeInfA;
      for (const item of memberAreas) {
        // add node energy
        potentialArea.incArea(item, f);
      }
    }

    if (edgeInfluenceFactor !== 0 && edgeItems.length > 0) {
      // add the influence of all the virtual edges
      calculateLinesInfluence(
        o.pixelGroup,
        potentialArea,
        edgeInfluenceFactor / edgeInfA,
        o.edgeR1,
        edgeItems,
        activeRegion
      );
    }

    // calculate negative energy contribution for all other visible items within bounds
    if (negativeNodeInfluenceFactor !== 0) {
      const f = negativeNodeInfluenceFactor / nodeInfA;
      for (const item of nonMemberAreas) {
        // add node energy
        potentialArea.incArea(item, f);
      }
    }
  };

  // add the aggregate and all it's members and virtual edges
  fillPotentialArea();

  // try to march, check if surface contains all items
  let iterations = 0;
  while (
    iterations < o.maxMarchingIterations &&
    !calculateContour(surface, activeRegion, memberItems, nonMemberItems, potentialArea, threshold, o)
  ) {
    surface.clear();
    iterations++;

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
    potentialArea.clear();
    fillPotentialArea();
  }
  return postProcessSurface(surface, activeRegion, o);
}

function computeActiveRegion(
  memberItems: Rectangle[],
  edgeItems: Line[],
  o: Required<IOutlineOptions> & IOutlineOptions
) {
  let activeRegion = memberItems[0].clone();
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

function postProcessSurface(surface: PointList, activeRegion: IRectangle, o: Required<IOutlineOptions>) {
  // start with global SKIP value, but decrease skip amount if there aren't enough points in the surface
  let skip = o.skip;
  // prepare viz attribute array
  let size = surface.length;

  if (skip > 1) {
    size = Math.floor(surface.length / skip);
    // if we reduced too much (fewer than three points in reduced surface) reduce skip and try again
    while (size < 3 && skip > 1) {
      skip -= 1;
      size = Math.floor(surface.length / skip);
    }
  }

  // add the offset of the active area to the coordinates
  const xCorner = activeRegion.x;
  const yCorner = activeRegion.y;

  const finalHull: [number, number][] = [];
  // copy hull values
  for (let i = 0, j = 0; j < size; j++, i += skip) {
    finalHull.push([surface.get(i).x + xCorner, surface.get(i).y + yCorner]);
  }
  return new PointPath(finalHull);
}

function calculateContour(
  contour: PointList,
  bounds: Rectangle,
  members: ReadonlyArray<Rectangle>,
  nonMembers: ReadonlyArray<Rectangle>,
  potentialArea: Area,
  threshold: number,
  o: Required<IOutlineOptions>
) {
  // if no surface could be found stop
  if (!marchingSquares(contour, potentialArea, o.pixelGroup, threshold)) {
    return false;
  }
  return testContainment(contour, bounds, members, nonMembers, o)[0];
}

function testContainment(
  contour: PointList,
  bounds: Rectangle,
  members: ReadonlyArray<Rectangle>,
  nonMembers: ReadonlyArray<Rectangle>,
  o: Required<IOutlineOptions>
) {
  // precise bounds checking
  // copy hull values
  const g: Point[] = [];
  let gbounds: Rectangle | null = null;

  function contains(g: Point[], p: Point) {
    let crossings = 0;
    if (g.length === 0) {
      return crossings % 2 == 1;
    }
    const first = g[0]!;
    const line = new Line(first.x, first.y, first.x, first.y);
    g.slice(1).forEach((cur) => {
      line.x1 = line.x2;
      line.y1 = line.y2;
      line.x2 = cur.x;
      line.y2 = cur.y;
      if (line.cuts(p)) {
        crossings++;
      }
    });

    line.x1 = line.x2;
    line.y1 = line.y2;
    line.x2 = first.x;
    line.y2 = first.y;
    if (line.cuts(p)) {
      crossings++;
    }
    return crossings % 2 == 1;
  }

  // start with global SKIP value, but decrease skip amount if there
  // aren't enough points in the surface
  let skip = o.skip;
  // prepare viz attribute array
  let size = contour.length;
  if (skip > 1) {
    size = contour.length / skip;
    // if we reduced too much (fewer than three points in reduced surface) reduce skip and try again
    while (size < 3 && skip > 1) {
      skip--;
      size = contour.length / skip;
    }
  }

  let xcorner = bounds.x;
  let ycorner = bounds.y;

  // simulate the surface we will eventually draw, using straight segments (approximate, but fast)
  for (let i = 0; i < size - 1; i++) {
    const px = contour.get(i * skip).x + xcorner;
    const py = contour.get(i * skip).y + ycorner;
    const r = new Rectangle(px, py, 0, 0);
    if (!gbounds) {
      gbounds = r;
    } else {
      gbounds.add(r);
    }
    g.push(new Point(px, py));
  }

  let containsAll = true;
  let containsExtra = false;

  if (gbounds != null) {
    members.forEach((item) => {
      const p = new Point(item.cx, item.cy);
      // check rough bounds
      containsAll = containsAll && gbounds!.containsPt(item.cx, item.cy);
      // check precise bounds if rough passes
      containsAll = containsAll && contains(g, p);
    });
    nonMembers.forEach((item) => {
      const p = new Point(item.cx, item.cy);
      // check rough bounds
      if (gbounds!.containsPt(item.cx, item.cy)) {
        // check precise bounds if rough passes
        if (contains(g, p)) {
          containsExtra = true;
        }
      }
    });
  }
  return [containsAll, containsExtra];
}

function calculateVirtualEdges(
  items: ReadonlyArray<Rectangle>,
  nonMembers: ReadonlyArray<Rectangle>,
  o: Required<IOutlineOptions>
) {
  const visited: Rectangle[] = [];
  const virtualEdges: Line[] = [];
  const sorted = sortByDistanceToCentroid(items);

  sorted.forEach((item) => {
    const lines = connectItem(nonMembers, item, visited, o);
    lines.forEach((l) => {
      virtualEdges.push(l);
    });
    visited.push(item);
  });
  return virtualEdges;
}

function connectItem(
  nonMembers: ReadonlyArray<Rectangle>,
  item: Rectangle,
  visited: Rectangle[],
  o: Required<IOutlineOptions>
) {
  const scannedLines: Line[] = [];
  const linesToCheck: Line[] = [];

  let itemCenter = new Point(item.cx, item.cy);
  let minLengthSq = Number.POSITIVE_INFINITY;
  // discover the nearest neighbor with minimal interference items
  const closestNeighbor = visited.reduce((closestNeighbor, neighborItem) => {
    const distanceSq = Point.ptsDistanceSq(itemCenter.x, itemCenter.y, neighborItem.cx, neighborItem.cy);

    const completeLine = new Line(itemCenter.x, itemCenter.y, neighborItem.cx, neighborItem.cy);
    // augment distance by number of interfering items
    const numberInterferenceItems = countInterferenceItems(nonMembers, completeLine);

    // TODO is there a better function to consider interference in nearest-neighbor checking? This is hacky
    if (distanceSq * (numberInterferenceItems + 1) * (numberInterferenceItems + 1) < minLengthSq) {
      closestNeighbor = neighborItem;
      minLengthSq = distanceSq * (numberInterferenceItems + 1) * (numberInterferenceItems + 1);
    }
    return closestNeighbor;
  }, null as Rectangle | null)!;

  // if there is a visited closest neighbor, add straight line between
  // them to the positive energy to ensure connected clusters
  if (closestNeighbor == null) {
    return [];
  }
  const completeLine = new Line(itemCenter.x, itemCenter.y, closestNeighbor.cx, closestNeighbor.cy);
  // route the edge around intersecting nodes not in set
  linesToCheck.push(completeLine);

  let hasIntersection = true;
  let iterations = 0;

  while (hasIntersection && iterations < o.maxRoutingIterations) {
    hasIntersection = false;
    while (!hasIntersection && linesToCheck.length > 0) {
      var line = linesToCheck.pop()!;
      // resolve intersections in order along edge
      var closestItem = getCenterItem(nonMembers, line);
      if (closestItem) {
        const intersections = testIntersection(line, closestItem);
        // 2 intersections = line passes through item
        if (intersections.count == 2) {
          var tempMorphBuffer = o.morphBuffer;
          var movePoint = rerouteLine(closestItem, tempMorphBuffer, intersections, true);
          // test the movePoint already exists
          var foundFirst = pointExists(movePoint, linesToCheck) || pointExists(movePoint, scannedLines);
          var pointInside = isPointInRectangles(movePoint, nonMembers);
          // prefer first corner, even if buffer becomes very small
          while (!foundFirst && pointInside && tempMorphBuffer >= 1) {
            // try a smaller buffer
            tempMorphBuffer /= 1.5;
            movePoint = rerouteLine(closestItem, tempMorphBuffer, intersections, true);
            foundFirst = pointExists(movePoint, linesToCheck) || pointExists(movePoint, scannedLines);
            pointInside = isPointInRectangles(movePoint, nonMembers);
          }

          if (movePoint && !foundFirst && !pointInside) {
            // add 2 rerouted lines to check
            linesToCheck.push(new Line(line.x1, line.y1, movePoint.x, movePoint.y));
            linesToCheck.push(new Line(movePoint.x, movePoint.y, line.x2, line.y2));
            // indicate intersection found
            hasIntersection = true;
          }

          // if we didn't find a valid point around the
          // first corner, try the second
          if (!hasIntersection) {
            tempMorphBuffer = o.morphBuffer;
            movePoint = rerouteLine(closestItem, tempMorphBuffer, intersections, false);
            var foundSecond = pointExists(movePoint, linesToCheck) || pointExists(movePoint, scannedLines);
            pointInside = isPointInRectangles(movePoint, nonMembers);
            // if both corners have been used, stop; otherwise gradually reduce buffer and try second corner
            while (!foundSecond && pointInside && tempMorphBuffer >= 1) {
              // try a smaller buffer
              tempMorphBuffer /= 1.5;
              movePoint = rerouteLine(closestItem, tempMorphBuffer, intersections, false);
              foundSecond = pointExists(movePoint, linesToCheck) || pointExists(movePoint, scannedLines);
              pointInside = isPointInRectangles(movePoint, nonMembers);
            }

            if (movePoint && !foundSecond) {
              // add 2 rerouted lines to check
              linesToCheck.push(new Line(line.x1, line.y1, movePoint.x, movePoint.y));
              linesToCheck.push(new Line(movePoint.x, movePoint.y, line.x2, line.y2));
              // indicate intersection found
              hasIntersection = true;
            }
          }
        }
      } // end check of closest item

      // no intersection found, mark this line as completed
      if (!hasIntersection) {
        scannedLines.push(line);
      }
      iterations++;
    } // end inner loop - out of lines or found an intersection
  } // end outer loop - no more intersections or out of iterations

  // finalize any that were not rerouted (due to running out of
  // iterations) or if we aren't morphing
  while (linesToCheck.length > 0) {
    scannedLines.push(linesToCheck.pop()!);
  }

  // try to merge consecutive lines if possible
  while (scannedLines.length > 0) {
    const line1 = scannedLines.pop()!;
    if (scannedLines.length > 0) {
      const line2 = scannedLines.pop()!;
      const mergeLine = new Line(line1.x1, line1.y1, line2.x2, line2.y2);
      // resolve intersections in order along edge
      const closestItem = getCenterItem(nonMembers, mergeLine);
      // merge most recent line and previous line
      if (!closestItem) {
        scannedLines.push(mergeLine);
      } else {
        linesToCheck.push(line1);
        scannedLines.push(line2);
      }
    } else {
      linesToCheck.push(line1);
    }
  }
  return linesToCheck;
}

function sortByDistanceToCentroid(items: ReadonlyArray<Rectangle>) {
  let totalX = 0;
  let totalY = 0;
  items.forEach((item) => {
    totalX += item.cx;
    totalY += item.cy;
  });
  totalX /= items.length;
  totalY /= items.length;
  return items
    .map((item) => {
      const diffX = totalX - item.cx;
      const diffY = totalY - item.cy;
      const dist = diffX * diffX + diffY * diffY;
      return [item, dist] as [Rectangle, number];
    })
    .sort((a, b) => a[1] - b[1])
    .map((d) => d[0]);
}

function isPointInRectangles(point: Point, rects: ReadonlyArray<Rectangle>) {
  return rects.some((r) => r.containsPt(point.x, point.y));
}

function pointExists(pointToCheck: Point, lines: ReadonlyArray<Line>) {
  return lines.some((checkEndPointsLine) => {
    if (Point.doublePointsEqual(checkEndPointsLine.x1, checkEndPointsLine.y1, pointToCheck.x, pointToCheck.y, 1e-3)) {
      return true;
    }
    if (Point.doublePointsEqual(checkEndPointsLine.x2, checkEndPointsLine.y2, pointToCheck.x, pointToCheck.y, 1e-3)) {
      return true;
    }
    return false;
  });
}

function getCenterItem(items: ReadonlyArray<Rectangle>, testLine: Line) {
  let minDistance = Number.POSITIVE_INFINITY;
  let closestItem: Rectangle | null = null;

  items.forEach((interferenceItem) => {
    if (interferenceItem.intersectsLine(testLine)) {
      const distance = fractionToLineCenter(interferenceItem, testLine);
      // find closest intersection
      if (distance >= 0 && distance < minDistance) {
        closestItem = interferenceItem;
        minDistance = distance;
      }
    }
  });
  return closestItem;
}

function countInterferenceItems(interferenceItems: ReadonlyArray<Rectangle>, testLine: Line) {
  return interferenceItems.reduce((count, interferenceItem) => {
    if (interferenceItem.intersectsLine(testLine)) {
      if (fractionToLineCenter(interferenceItem, testLine) >= 0) {
        return count + 1;
      }
    }
    return count;
  }, 0);
}

function calculateLinesInfluence(
  pixelGroup: number,
  potentialArea: Area,
  influenceFactor: number,
  r1: number,
  lines: Line[],
  activeRegion: Rectangle
) {
  lines.forEach((line) => {
    const lr = line.asRect();
    // only traverse the plausible area
    const startX = potentialArea.boundX(Math.floor((lr.x - r1 - activeRegion.x) / pixelGroup));
    const startY = potentialArea.boundY(Math.floor((lr.y - r1 - activeRegion.y) / pixelGroup));
    const endX = potentialArea.boundX(Math.ceil((lr.x2 + r1 - activeRegion.x) / pixelGroup));
    const endY = potentialArea.boundY(Math.ceil((lr.y2 + r1 - activeRegion.y) / pixelGroup));
    // for every point in active part of potentialArea, calculate distance to nearest point on line and add influence
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        // if we are adding negative energy, skip if not already
        // positive; positives have already been added first, and adding
        // negative to <=0 will have no affect on surface
        if (influenceFactor < 0 && potentialArea.get(x, y) <= 0) {
          continue;
        }
        // convert back to screen coordinates
        const tempX = x * pixelGroup + activeRegion.x;
        const tempY = y * pixelGroup + activeRegion.y;
        const minDistanceSq = line.ptSegDistSq(tempX, tempY);
        // only influence if less than r1
        if (minDistanceSq < r1 * r1) {
          const mdr = Math.sqrt(minDistanceSq) - r1;
          potentialArea.inc(x, y, influenceFactor * mdr * mdr);
        }
      }
    }
  });
}

function getRectDistSq(rect: Rectangle, tempX: number, tempY: number) {
  // test current point to see if it is inside rectangle
  if (!rect.containsPt(tempX, tempY)) {
    // which edge of rectangle is closest
    const outcode = rect.outcode(tempX, tempY);
    // top
    if ((outcode & Rectangle.OUT_TOP) === Rectangle.OUT_TOP) {
      // and left
      if ((outcode & Rectangle.OUT_LEFT) === Rectangle.OUT_LEFT) {
        // linear distance from upper left corner
        return Point.ptsDistanceSq(tempX, tempY, rect.x, rect.y);
      } else {
        // and right
        if ((outcode & Rectangle.OUT_RIGHT) === Rectangle.OUT_RIGHT) {
          // linear distance from upper right corner
          return Point.ptsDistanceSq(tempX, tempY, rect.x2, rect.y);
        } else {
          // distance from top line segment
          return (rect.y - tempY) * (rect.y - tempY);
        }
      }
    } else {
      // bottom
      if ((outcode & Rectangle.OUT_BOTTOM) === Rectangle.OUT_BOTTOM) {
        // and left
        if ((outcode & Rectangle.OUT_LEFT) === Rectangle.OUT_LEFT) {
          // linear distance from lower left corner
          return Point.ptsDistanceSq(tempX, tempY, rect.x, rect.y2);
        } else {
          // and right
          if ((outcode & Rectangle.OUT_RIGHT) === Rectangle.OUT_RIGHT) {
            // linear distance from lower right corner
            return Point.ptsDistanceSq(tempX, tempY, rect.x2, rect.y2);
          } else {
            // distance from bottom line segment
            return (tempY - rect.y2) * (tempY - rect.y2);
          }
        }
      } else {
        // left only
        if ((outcode & Rectangle.OUT_LEFT) === Rectangle.OUT_LEFT) {
          // linear distance from left edge
          return (rect.x - tempX) * (rect.x - tempX);
        } else {
          // right only
          if ((outcode & Rectangle.OUT_RIGHT) === Rectangle.OUT_RIGHT) {
            // linear distance from right edge
            return (tempX - rect.x2) * (tempX - rect.x2);
          }
        }
      }
    }
  }
  return 0;
}

function createRectangleInfluenceArea(
  activeRegion: Rectangle,
  pixelGroup: number,
  potentialArea: Area,
  r1: number,
  rect: Rectangle
) {
  const ri2 = r1 * r1;
  // find the affected subregion of potentialArea
  const startX = potentialArea.boundX(Math.floor((rect.x - r1 - activeRegion.x) / pixelGroup));
  const startY = potentialArea.boundY(Math.floor((rect.y - r1 - activeRegion.y) / pixelGroup));
  const endX = potentialArea.boundX(Math.ceil((rect.x2 + r1 - activeRegion.x) / pixelGroup));
  const endY = potentialArea.boundY(Math.ceil((rect.y2 + r1 - activeRegion.y) / pixelGroup));
  // for every point in active subregion of potentialArea, calculate
  // distance to nearest point on rectangle and add influence
  const areaWidth = endX - startX;
  const areaHeight = endY - startY;
  const area = new Area(areaWidth, areaHeight, startX, startY);
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      // convert back to screen coordinates
      const tempX = x * pixelGroup + activeRegion.x;
      const tempY = y * pixelGroup + activeRegion.y;
      const distanceSq = getRectDistSq(rect, tempX, tempY);
      // only influence if less than r1
      if (distanceSq < ri2) {
        const dr = Math.sqrt(distanceSq) - r1;
        area.set(x - startX, y - startY, dr * dr);
      }
    }
  }
  return area;
}

function rerouteLine(
  rectangle: Rectangle,
  rerouteBuffer: number,
  intersections: { top: Intersection; left: Intersection; right: Intersection; bottom: Intersection },
  wrapNormal: boolean
) {
  const topIntersect = intersections.top;
  const leftIntersect = intersections.left;
  const bottomIntersect = intersections.bottom;
  const rightIntersect = intersections.right;

  // wrap around the most efficient way
  if (wrapNormal) {
    // left side
    if (leftIntersect.state === EState.POINT) {
      if (topIntersect.state === EState.POINT)
        // triangle, must go around top left
        return new Point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
      if (bottomIntersect.state === EState.POINT)
        // triangle, must go around bottom left
        return new Point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
      // else through left to right, calculate areas
      const totalArea = rectangle.area;
      // top area
      const topArea = rectangle.width * ((leftIntersect.y - rectangle.y + (rightIntersect.y - rectangle.y)) * 0.5);
      if (topArea < totalArea * 0.5) {
        // go around top (the side which would make a greater movement)
        if (leftIntersect.y > rightIntersect.y)
          // top left
          return new Point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
        // top right
        return new Point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
      }
      // go around bottom
      if (leftIntersect.y < rightIntersect.y)
        // bottom left
        return new Point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
      // bottom right
      return new Point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
    }
    // right side
    if (rightIntersect.state === EState.POINT) {
      if (topIntersect.state === EState.POINT)
        // triangle, must go around top right
        return new Point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
      if (bottomIntersect.state === EState.POINT)
        // triangle, must go around bottom right
        return new Point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
    }
    // else through top to bottom, calculate areas
    const totalArea = rectangle.height * rectangle.width;
    const leftArea = rectangle.height * ((topIntersect.x - rectangle.x + (rightIntersect.x - rectangle.x)) * 0.5);
    if (leftArea < totalArea * 0.5) {
      // go around left
      if (topIntersect.x > bottomIntersect.x)
        // top left
        return new Point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
      // bottom left
      return new Point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
    }
    // go around right
    if (topIntersect.x < bottomIntersect.x)
      // top right
      return new Point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
    // bottom right
    return new Point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
  }
  // wrap around opposite (usually because the first move caused a problem)
  if (leftIntersect.state === EState.POINT) {
    if (topIntersect.state === EState.POINT)
      // triangle, must go around bottom right
      return new Point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
    if (bottomIntersect.state === EState.POINT)
      // triangle, must go around top right
      return new Point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
    // else through left to right, calculate areas
    const totalArea = rectangle.height * rectangle.width;
    const topArea = rectangle.width * ((leftIntersect.y - rectangle.y + (rightIntersect.y - rectangle.y)) * 0.5);
    if (topArea < totalArea * 0.5) {
      // go around bottom (the side which would make a lesser movement)
      if (leftIntersect.y > rightIntersect.y)
        // bottom right
        return new Point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
      // bottom left
      return new Point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
    }
    // go around top
    if (leftIntersect.y < rightIntersect.y)
      // top right
      return new Point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
    // top left
    return new Point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
  }
  if (rightIntersect.state === EState.POINT) {
    if (topIntersect.state === EState.POINT)
      // triangle, must go around bottom left
      return new Point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
    if (bottomIntersect.state === EState.POINT)
      // triangle, must go around top left
      return new Point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
  }
  // else through top to bottom, calculate areas
  const totalArea = rectangle.height * rectangle.width;
  const leftArea = rectangle.height * ((topIntersect.x - rectangle.x + (rightIntersect.x - rectangle.x)) * 0.5);
  if (leftArea < totalArea * 0.5) {
    // go around right
    if (topIntersect.x > bottomIntersect.x)
      // bottom right
      return new Point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
    // top right
    return new Point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
  }
  // go around left
  if (topIntersect.x < bottomIntersect.x)
    // bottom left
    return new Point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
  // top left
  return new Point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
}

export function addPadding(r: IRectangle, padding: number): IRectangle;
export function addPadding(r: ReadonlyArray<IRectangle>, padding: number): ReadonlyArray<IRectangle>;
export function addPadding(
  r: IRectangle | ReadonlyArray<IRectangle>,
  padding: number
): IRectangle | ReadonlyArray<IRectangle> {
  const map = (r: IRectangle) => ({
    x: r.x - padding,
    y: r.y - padding,
    width: r.width + 2 * padding,
    height: r.height + 2 * padding,
  });
  if (Array.isArray(r)) {
    return r.map(map);
  }
  return map(r as IRectangle);
}
