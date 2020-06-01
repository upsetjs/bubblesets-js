import { Rectangle } from './model/Rectangle';
import { Intersection, EState } from './model/Intersection';
import { Point } from './model/Point';
import { Area } from './model/Area';
import { Line } from './model/Line';
import { PointList } from './model/PointList';
import { marchingSquares } from './model/MarchingSquares';
import { PointPath } from './PointPath';

export class BubbleSet {
  maxRoutingIterations = BubbleSet.DEFAULT_MAX_ROUTING_ITERATIONS;
  maxMarchingIterations = BubbleSet.DEFAULT_MAX_MARCHING_ITERATIONS;
  pixelGroup = BubbleSet.DEFAULT_PIXEL_GROUP;
  edgeR0 = BubbleSet.DEFAULT_EDGE_R0;
  edgeR1 = BubbleSet.DEFAULT_EDGE_R1;
  nodeR0 = BubbleSet.DEFAULT_NODE_R0;
  nodeR1 = BubbleSet.DEFAULT_NODE_R1;
  morphBuffer = BubbleSet.DEFAULT_MORPH_BUFFER;
  skip = BubbleSet.DEFAULT_SKIP;

  constructor() {}

  createOutline(
    memberItems: ReadonlyArray<Rectangle>,
    nonMembers: ReadonlyArray<Rectangle>,
    edges: ReadonlyArray<Line> = []
  ) {
    if (memberItems.length === 0) {
      return new PointPath([]);
    }

    let threshold = 1;
    let nodeInfluenceFactor = 1;
    let edgeInfluenceFactor = 1;
    let negativeNodeInfluenceFactor = -0.8;

    let activeRegion = memberItems[0].clone();
    memberItems.forEach((m) => {
      activeRegion.add(m);
    });

    // calculate and store virtual edges
    const virtualEdges = this.calculateVirtualEdges(memberItems, nonMembers);

    edges.forEach((e) => {
      virtualEdges.push(e);
    });
    virtualEdges.forEach((l) => {
      activeRegion.add(l.asRect());
    });

    const padding = Math.max(this.edgeR1, this.nodeR1) + this.morphBuffer;
    activeRegion = addPadding(activeRegion, padding);

    const potentialArea = new Area(
      Math.ceil(activeRegion.width / this.pixelGroup),
      Math.ceil(activeRegion.height / this.pixelGroup)
    );

    const estLength = (Math.floor(activeRegion.width) + Math.floor(activeRegion.height)) * 2;
    const surface = new PointList(estLength);

    let iterations = 0;

    const fillPotentialArea = () => {
      // add all positive energy (included items) first, as negative energy
      // (morphing) requires all positives to be already set
      if (nodeInfluenceFactor) {
        memberItems.forEach((item) => {
          // add node energy
          const nodeRDiff = this.nodeR0 - this.nodeR1;
          // using inverse a for numerical stability
          const inva = nodeRDiff * nodeRDiff;
          calculateRectangleInfluence(
            activeRegion,
            this.pixelGroup,
            potentialArea,
            nodeInfluenceFactor / inva,
            this.nodeR1,
            item
          );
        }); // end processing node items of this aggregate
      } // end processing positive node energy

      if (edgeInfluenceFactor) {
        // add the influence of all the virtual edges
        const inva = (this.edgeR0 - this.edgeR1) * (this.edgeR0 - this.edgeR1);

        if (virtualEdges.length > 0) {
          calculateLinesInfluence(
            this.pixelGroup,
            potentialArea,
            edgeInfluenceFactor / inva,
            this.edgeR1,
            virtualEdges,
            activeRegion
          );
        }
      }

      // calculate negative energy contribution for all other visible items within bounds
      if (negativeNodeInfluenceFactor) {
        nonMembers.forEach((item) => {
          // if item is within influence bounds, add potential
          if (activeRegion.intersects(item)) {
            // subtract influence
            const nodeRDiff = this.nodeR0 - this.nodeR1;
            // using inverse a for numerical stability
            const inva = nodeRDiff * nodeRDiff;
            calculateRectangleNegativeInfluence(
              activeRegion,
              this.pixelGroup,
              potentialArea,
              negativeNodeInfluenceFactor / inva,
              this.nodeR1,
              item
            );
          }
        });
      }
    };

    // add the aggregate and all it's members and virtual edges
    fillPotentialArea();

    // try to march, check if surface contains all items
    while (
      !this.calculateContour(surface, activeRegion, memberItems, nonMembers, potentialArea, threshold) &&
      iterations < this.maxMarchingIterations
    ) {
      surface.clear();
      iterations += 1;

      // reduce negative influences first; this will allow the surface to
      // pass without making it fatter all around (which raising the threshold does)
      if (iterations <= this.maxMarchingIterations * 0.5) {
        threshold *= 0.95;
        nodeInfluenceFactor *= 1.2;
        edgeInfluenceFactor *= 1.2;
        fillPotentialArea();
      }

      // after half the iterations, start increasing positive energy and lowering the threshold
      if (iterations > this.maxMarchingIterations * 0.5) {
        if (negativeNodeInfluenceFactor != 0) {
          threshold *= 0.95;
          negativeNodeInfluenceFactor *= 0.8;
          fillPotentialArea();
        }
      }
    }

    // start with global SKIP value, but decrease skip amount if there aren't enough points in the surface
    let thisSkip = this.skip;
    // prepare viz attribute array
    let size = surface.length;

    if (thisSkip > 1) {
      size = Math.floor(surface.length / thisSkip);
      // if we reduced too much (fewer than three points in reduced surface) reduce skip and try again
      while (size < 3 && thisSkip > 1) {
        thisSkip -= 1;
        size = Math.floor(surface.length / thisSkip);
      }
    }

    // add the offset of the active area to the coordinates
    const xCorner = activeRegion.x;
    const yCorner = activeRegion.y;

    const finalHull = new PointList(size);
    // copy hull values
    for (let i = 0, j = 0; j < size; j += 1, i += thisSkip) {
      finalHull.add(new Point(surface.get(i).x + xCorner, surface.get(i).y + yCorner));
    }

    // if (!this.debug) {
    //   // getting rid of unused memory preventing a memory leak
    //   activeRegion = null;
    //   potentialArea = null;
    // }

    return finalHull.path();
  }

  // debug = false;
  // // call after createOutline
  // debugPotentialArea() {
  //   debug || console.warn('debug mode should be activated');
  //   var rects = [];
  //   for (var x = 0; x < potentialArea.width; x += 1) {
  //     for (var y = 0; y < potentialArea.height; y += 1) {
  //       rects.push({
  //         x: x * pixelGroup + Math.floor(activeRegion.x),
  //         y: y * pixelGroup + Math.floor(activeRegion.y),
  //         width: pixelGroup,
  //         height: pixelGroup,
  //         value: potentialArea.get(x, y),
  //         threshold: lastThreshold,
  //       });
  //     }
  //   }
  //   return rects;
  // }

  static readonly DEFAULT_MAX_ROUTING_ITERATIONS = 100;
  static readonly DEFAULT_MAX_MARCHING_ITERATIONS = 20;
  static readonly DEFAULT_PIXEL_GROUP = 4;
  static readonly DEFAULT_EDGE_R0 = 10;
  static readonly DEFAULT_EDGE_R1 = 20;
  static readonly DEFAULT_NODE_R0 = 15;
  static readonly DEFAULT_NODE_R1 = 50;
  static readonly DEFAULT_MORPH_BUFFER = BubbleSet.DEFAULT_NODE_R0;
  static readonly DEFAULT_SKIP = 8;

  calculateContour(
    contour: PointList,
    bounds: Rectangle,
    members: ReadonlyArray<Rectangle>,
    nonMembers: ReadonlyArray<Rectangle>,
    potentialArea: Area,
    threshold: number
  ) {
    // if no surface could be found stop
    if (!marchingSquares(contour, potentialArea, this.pixelGroup, threshold)) {
      return false;
    }
    return this.testContainment(contour, bounds, members, nonMembers)[0];
  }

  testContainment(
    contour: PointList,
    bounds: Rectangle,
    members: ReadonlyArray<Rectangle>,
    nonMembers: ReadonlyArray<Rectangle>
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
          crossings += 1;
        }
      });

      line.x1 = line.x2;
      line.y1 = line.y2;
      line.x2 = first.x;
      line.y2 = first.y;
      if (line.cuts(p)) {
        crossings += 1;
      }
      return crossings % 2 == 1;
    }

    // start with global SKIP value, but decrease skip amount if there
    // aren't enough points in the surface
    let thisSkip = this.skip;
    // prepare viz attribute array
    let size = contour.length;
    if (thisSkip > 1) {
      size = contour.length / thisSkip;
      // if we reduced too much (fewer than three points in reduced surface) reduce skip and try again
      while (size < 3 && thisSkip > 1) {
        thisSkip--;
        size = contour.length / thisSkip;
      }
    }

    let xcorner = bounds.x;
    let ycorner = bounds.y;

    // simulate the surface we will eventually draw, using straight segments (approximate, but fast)
    for (let i = 0; i < size - 1; i += 1) {
      const px = contour.get(i * thisSkip).x + xcorner;
      const py = contour.get(i * thisSkip).y + ycorner;
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
        containsAll = containsAll && gbounds!.contains(p);
        // check precise bounds if rough passes
        containsAll = containsAll && contains(g, p);
      });
      nonMembers.forEach((item) => {
        const p = new Point(item.cx, item.cy);
        // check rough bounds
        if (gbounds!.contains(p)) {
          // check precise bounds if rough passes
          if (contains(g, p)) {
            containsExtra = true;
          }
        }
      });
    }
    return [containsAll, containsExtra];
  }

  calculateVirtualEdges(items: ReadonlyArray<Rectangle>, nonMembers: ReadonlyArray<Rectangle>) {
    const visited: Rectangle[] = [];
    const virtualEdges: Line[] = [];
    const sorted = sortByDistanceToCentroid(items);

    sorted.forEach((item) => {
      const lines = this.connectItem(nonMembers, item, visited);
      lines.forEach((l) => {
        virtualEdges.push(l);
      });
      visited.push(item);
    });
    return virtualEdges;
  }

  connectItem(nonMembers: ReadonlyArray<Rectangle>, item: Rectangle, visited: Rectangle[]) {
    const scannedLines: Line[] = [];
    const linesToCheck: Line[] = [];

    let itemCenter = new Point(item.cx, item.cy);
    let minLengthSq = Number.POSITIVE_INFINITY;
    // discover the nearest neighbor with minimal interference items
    const closestNeighbor = visited.reduce((closestNeighbor, neighborItem) => {
      const nCenter = new Point(neighborItem.cx, neighborItem.cy);
      const distanceSq = itemCenter.distanceSq(nCenter);

      const completeLine = new Line(itemCenter.x, itemCenter.y, nCenter.x, nCenter.y);
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
    const intersections: Intersection[] = [];
    intersections.length = 4;
    let numIntersections = 0;

    while (hasIntersection && iterations < this.maxRoutingIterations) {
      hasIntersection = false;
      while (!hasIntersection && linesToCheck.length > 0) {
        var line = linesToCheck.pop()!;
        // resolve intersections in order along edge
        var closestItem = getCenterItem(nonMembers, line);
        if (closestItem) {
          numIntersections = Intersection.testIntersection(line, closestItem, intersections);
          // 2 intersections = line passes through item
          if (numIntersections == 2) {
            var tempMorphBuffer = this.morphBuffer;
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
              tempMorphBuffer = this.morphBuffer;
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
        iterations += 1;
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
  const dist = (item: Rectangle) => {
    const diffX = totalX - item.cx;
    const diffY = totalY - item.cy;
    return diffX * diffX + diffY * diffY;
  };
  return items.slice().sort((a, b) => dist(a) - dist(b));
}

function isPointInRectangles(point: Point, rects: ReadonlyArray<Rectangle>) {
  return rects.some((testRectangle) => testRectangle.contains(point));
}

function pointExists(pointToCheck: Point, lines: Line[]) {
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
      const distance = Intersection.fractionToLineCenter(interferenceItem, testLine);
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
      if (Intersection.fractionToLineCenter(interferenceItem, testLine) >= 0) {
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
    const startX = potentialArea.bound(Math.floor((lr.x - r1 - activeRegion.x) / pixelGroup), true);
    const startY = potentialArea.bound(Math.floor((lr.y - r1 - activeRegion.y) / pixelGroup), false);
    const endX = potentialArea.bound(Math.ceil((lr.x2 + r1 - activeRegion.x) / pixelGroup), true);
    const endY = potentialArea.bound(Math.ceil((lr.y2 + r1 - activeRegion.y) / pixelGroup), false);
    // for every point in active part of potentialArea, calculate distance to nearest point on line and add influence
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
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
          potentialArea.set(x, y, potentialArea.get(x, y) + influenceFactor * mdr * mdr);
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

function calculateRectangleInfluence(
  activeRegion: Rectangle,
  pixelGroup: number,
  potentialArea: Area,
  influenceFactor: number,
  r1: number,
  rect: Rectangle
) {
  influenceFactor < 0 && console.warn('expected positive influence', influenceFactor);
  // find the affected subregion of potentialArea
  const startX = potentialArea.bound(Math.floor((rect.x - r1 - activeRegion.x) / pixelGroup), true);
  const startY = potentialArea.bound(Math.floor((rect.y - r1 - activeRegion.y) / pixelGroup), false);
  const endX = potentialArea.bound(Math.ceil((rect.x2 + r1 - activeRegion.x) / pixelGroup), true);
  const endY = potentialArea.bound(Math.ceil((rect.y2 + r1 - activeRegion.y) / pixelGroup), false);
  // for every point in active subregion of potentialArea, calculate
  // distance to nearest point on rectangle and add influence
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      // convert back to screen coordinates
      const tempX = x * pixelGroup + activeRegion.x;
      const tempY = y * pixelGroup + activeRegion.y;
      const distanceSq = getRectDistSq(rect, tempX, tempY);
      // only influence if less than r1
      if (distanceSq < r1 * r1) {
        const dr = Math.sqrt(distanceSq) - r1;
        potentialArea.set(x, y, potentialArea.get(x, y) + influenceFactor * dr * dr);
      }
    }
  }
}

function calculateRectangleNegativeInfluence(
  activeRegion: Rectangle,
  pixelGroup: number,
  potentialArea: Area,
  influenceFactor: number,
  r1: number,
  rect: Rectangle
) {
  influenceFactor > 0 && console.warn('expected negative influence', influenceFactor);
  // find the affected subregion of potentialArea
  const startX = potentialArea.bound(Math.floor((rect.x - r1 - activeRegion.x) / pixelGroup), true);
  const startY = potentialArea.bound(Math.floor((rect.y - r1 - activeRegion.y) / pixelGroup), false);
  const endX = potentialArea.bound(Math.ceil((rect.x2 + r1 - activeRegion.x) / pixelGroup), true);
  const endY = potentialArea.bound(Math.ceil((rect.y2 + r1 - activeRegion.y) / pixelGroup), false);
  // for every point in active subregion of potentialArea, calculate
  // distance to nearest point on rectangle and add influence
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      // skip if not already positive; positives have already been added first, and adding
      // negative to <= 0 will have no affect on surface
      if (potentialArea.get(x, y) <= 0) {
        continue;
      }
      // convert back to screen coordinates
      const tempX = x * pixelGroup + activeRegion.x;
      const tempY = y * pixelGroup + activeRegion.y;
      const distanceSq = getRectDistSq(rect, tempX, tempY);
      // only influence if less than r1
      if (distanceSq < r1 * r1) {
        const dr = Math.sqrt(distanceSq) - r1;
        potentialArea.set(x, y, potentialArea.get(x, y) + influenceFactor * dr * dr);
      }
    }
  }
}

function rerouteLine(rectangle: Rectangle, rerouteBuffer: number, intersections: Intersection[], wrapNormal: boolean) {
  const topIntersect = intersections[0];
  const leftIntersect = intersections[1];
  const bottomIntersect = intersections[2];
  const rightIntersect = intersections[3];

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
      const topArea =
        rectangle.width * ((leftIntersect.point!.y - rectangle.y + (rightIntersect.point!.y - rectangle.y)) * 0.5);
      if (topArea < totalArea * 0.5) {
        // go around top (the side which would make a greater movement)
        if (leftIntersect.point!.y > rightIntersect.point!.y)
          // top left
          return new Point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
        // top right
        return new Point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
      }
      // go around bottom
      if (leftIntersect.point!.y < rightIntersect.point!.y)
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
    const leftArea =
      rectangle.height * ((topIntersect.point!.x - rectangle.x + (rightIntersect.point!.x - rectangle.x)) * 0.5);
    if (leftArea < totalArea * 0.5) {
      // go around left
      if (topIntersect.point!.x > bottomIntersect.point!.x)
        // top left
        return new Point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
      // bottom left
      return new Point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
    }
    // go around right
    if (topIntersect.point!.x < bottomIntersect.point!.x)
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
    const topArea =
      rectangle.width * ((leftIntersect.point!.y - rectangle.y + (rightIntersect.point!.y - rectangle.y)) * 0.5);
    if (topArea < totalArea * 0.5) {
      // go around bottom (the side which would make a lesser movement)
      if (leftIntersect.point!.y > rightIntersect.point!.y)
        // bottom right
        return new Point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
      // bottom left
      return new Point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
    }
    // go around top
    if (leftIntersect.point!.y < rightIntersect.point!.y)
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
  const leftArea =
    rectangle.height * ((topIntersect.point!.x - rectangle.x + (rightIntersect.point!.x - rectangle.x)) * 0.5);
  if (leftArea < totalArea * 0.5) {
    // go around right
    if (topIntersect.point!.x > bottomIntersect.point!.x)
      // bottom right
      return new Point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
    // top right
    return new Point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
  }
  // go around left
  if (topIntersect.point!.x < bottomIntersect.point!.x)
    // bottom left
    return new Point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
  // top left
  return new Point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
}

export function addPadding(r: Rectangle, radius: number) {
  return new Rectangle(r.x - radius, r.y - radius, r.width + 2 * radius, r.height + 2 * radius);
}
