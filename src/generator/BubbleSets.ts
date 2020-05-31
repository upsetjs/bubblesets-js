import { Rectangle } from '../model/Rectangle';
import { Intersection, EState } from '../model/Intersection';
import { Point } from '../model/Point';
import { Area } from '../model/Area';
import { Line } from '../model/Line';

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

  createOutline(members: Rectangle[], nonmem: Rectangle[], edges: Line[]) {
    if (!members.length) return [];

    let threshold = 1;
    let nodeInfluenceFactor = 1;
    let edgeInfluenceFactor = 1;
    let negativeNodeInfluenceFactor = -0.8;
    let activeRegion = null;
    let virtualEdges = [];
    let potentialArea: Area | null = null;

    let lastThreshold = Number.NaN;

    var memberItems = members.map(function (m) {
      return new Rectangle(m);
    });
    var nonMembers = nonmem.map(function (m) {
      return new Rectangle(m);
    });

    // calculate and store virtual edges
    calculateVirtualEdges(memberItems, nonMembers);

    edges &&
      edges.forEach(function (e) {
        virtualEdges.push(new Line(e.x1, e.y1, e.x2, e.y2));
      });

    activeRegion = null;
    memberItems.forEach(function (m) {
      if (!activeRegion) {
        activeRegion = new Rectangle(m.rect());
      } else {
        activeRegion.add(m);
      }
    });

    virtualEdges.forEach(function (l) {
      activeRegion.add(l.rect());
    });

    activeRegion.rect({
      x: activeRegion.x - Math.max(edgeR1, nodeR1) - morphBuffer,
      y: activeRegion.y - Math.max(edgeR1, nodeR1) - morphBuffer,
      width: activeRegion.width + 2 * Math.max(edgeR1, nodeR1) + 2 * morphBuffer,
      height: activeRegion.height + 2 * Math.max(edgeR1, nodeR1) + 2 * morphBuffer,
    });

    potentialArea = new Area(Math.ceil(activeRegion.width / pixelGroup), Math.ceil(activeRegion.height / pixelGroup));

    var estLength = (Math.floor(activeRegion.width) + Math.floor(activeRegion.height)) * 2;
    var surface = new PointList(estLength);

    var tempThreshold = threshold;
    var tempNegativeNodeInfluenceFactor = negativeNodeInfluenceFactor;
    var tempNodeInfluenceFactor = nodeInfluenceFactor;
    var tempEdgeInfluenceFactor = edgeInfluenceFactor;

    var iterations = 0;

    // add the aggregate and all it's members and virtual edges
    fillPotentialArea(activeRegion, memberItems, nonMembers, potentialArea);

    // try to march, check if surface contains all items
    while (
      !calculateContour(surface, activeRegion, memberItems, nonMembers, potentialArea) &&
      iterations < maxMarchingIterations
    ) {
      surface.clear();
      iterations += 1;

      // reduce negative influences first; this will allow the surface to
      // pass without making it fatter all around (which raising the threshold does)
      if (iterations <= maxMarchingIterations * 0.5) {
        threshold *= 0.95;
        nodeInfluenceFactor *= 1.2;
        edgeInfluenceFactor *= 1.2;
        fillPotentialArea(activeRegion, memberItems, nonMembers, potentialArea);
      }

      // after half the iterations, start increasing positive energy and lowering the threshold
      if (iterations > maxMarchingIterations * 0.5) {
        if (negativeNodeInfluenceFactor != 0) {
          threshold *= 0.95;
          negativeNodeInfluenceFactor *= 0.8;
          fillPotentialArea(activeRegion, memberItems, nonMembers, potentialArea);
        }
      }
    }

    lastThreshold = threshold;
    threshold = tempThreshold;
    negativeNodeInfluenceFactor = tempNegativeNodeInfluenceFactor;
    nodeInfluenceFactor = tempNodeInfluenceFactor;
    edgeInfluenceFactor = tempEdgeInfluenceFactor;

    // start with global SKIP value, but decrease skip amount if there aren't enough points in the surface
    var thisSkip = skip;
    // prepare viz attribute array
    var size = surface.size();

    if (thisSkip > 1) {
      size = Math.floor(surface.size() / thisSkip);
      // if we reduced too much (fewer than three points in reduced surface) reduce skip and try again
      while (size < 3 && thisSkip > 1) {
        thisSkip -= 1;
        size = Math.floor(surface.size() / thisSkip);
      }
    }

    // add the offset of the active area to the coordinates
    var xcorner = activeRegion.x;
    var ycorner = activeRegion.y;

    var fhull = new PointList(size);
    // copy hull values
    for (var i = 0, j = 0; j < size; j += 1, i += thisSkip) {
      fhull.add(new Point(surface.get(i).x + xcorner, surface.get(i).y + ycorner));
    }

    if (!debug) {
      // getting rid of unused memory preventing a memory leak
      activeRegion = null;
      potentialArea = null;
    }

    return fhull.list();
  }

  debug = false;
  // call after createOutline
  debugPotentialArea() {
    debug || console.warn('debug mode should be activated');
    var rects = [];
    for (var x = 0; x < potentialArea.width; x += 1) {
      for (var y = 0; y < potentialArea.height; y += 1) {
        rects.push({
          x: x * pixelGroup + Math.floor(activeRegion.x),
          y: y * pixelGroup + Math.floor(activeRegion.y),
          width: pixelGroup,
          height: pixelGroup,
          value: potentialArea.get(x, y),
          threshold: lastThreshold,
        });
      }
    }
    return rects;
  }

  static readonly DEFAULT_MAX_ROUTING_ITERATIONS = 100;
  static readonly DEFAULT_MAX_MARCHING_ITERATIONS = 20;
  static readonly DEFAULT_PIXEL_GROUP = 4;
  static readonly DEFAULT_EDGE_R0 = 10;
  static readonly DEFAULT_EDGE_R1 = 20;
  static readonly DEFAULT_NODE_R0 = 15;
  static readonly DEFAULT_NODE_R1 = 50;
  static readonly DEFAULT_MORPH_BUFFER = BubbleSet.DEFAULT_NODE_R0;
  static readonly DEFAULT_SKIP = 8;
}

export function addPadding(rects: Rectangle[], radius: number) {
  return rects.map((r) => new Rectangle(r.x - radius, r.y - radius, r.width + 2 * radius, r.height + 2 * radius));
}

function calculateContour(contour, bounds, members, nonMembers, potentialArea) {
  // if no surface could be found stop
  if (!new MarchingSquares(contour, potentialArea, pixelGroup, threshold).march()) return false;
  return testContainment(contour, bounds, members, nonMembers)[0];
}

function testContainment(contour, bounds, members, nonMembers) {
  // precise bounds checking
  // copy hull values
  var g = [];
  var gbounds = null;

  function contains(g, p) {
    var line = null;
    var first = null;
    var crossings = 0;
    g.forEach(function (cur) {
      if (!line) {
        line = new Line(cur.x, cur.y, cur.x, cur.y);
        first = cur;
        return;
      }
      line.x1(line.x2());
      line.y1(line.y2());
      line.x2(cur.x);
      line.y2(cur.y);
      if (line.cuts(p)) {
        crossings += 1;
      }
    });
    if (first) {
      line.x1(line.x2());
      line.y1(line.y2());
      line.x2(first.x);
      line.y2(first.y);
      if (line.cuts(p)) {
        crossings += 1;
      }
    }
    return crossings % 2 == 1;
  }

  // start with global SKIP value, but decrease skip amount if there
  // aren't enough points in the surface
  var thisSkip = skip;
  // prepare viz attribute array
  var size = contour.size();
  if (thisSkip > 1) {
    size = contour.size() / thisSkip;
    // if we reduced too much (fewer than three points in reduced surface) reduce skip and try again
    while (size < 3 && thisSkip > 1) {
      thisSkip--;
      size = contour.size() / thisSkip;
    }
  }

  var xcorner = bounds.x;
  var ycorner = bounds.y;

  // simulate the surface we will eventually draw, using straight segments (approximate, but fast)
  for (var i = 0; i < size - 1; i += 1) {
    var px = contour.get(i * thisSkip).x + xcorner;
    var py = contour.get(i * thisSkip).y + ycorner;
    var r = {
      x: px,
      y: py,
      width: 0,
      height: 0,
    };
    if (!gbounds) {
      gbounds = new Rectangle(r);
    } else {
      gbounds.add(new Rectangle(r));
    }
    g.push(new Point(px, py));
  }

  var containsAll = true;
  var containsExtra = false;
  if (gbounds) {
    members.forEach(function (item) {
      var p = new Point(item.centerx, item.centery);
      // check rough bounds
      containsAll = containsAll && gbounds.contains(p);
      // check precise bounds if rough passes
      containsAll = containsAll && contains(g, p);
    });
    nonMembers.forEach(function (item) {
      var p = new Point(item.centerx, item.centery);
      // check rough bounds
      if (gbounds.contains(p)) {
        // check precise bounds if rough passes
        if (contains(g, p)) {
          containsExtra = true;
        }
      }
    });
  }
  return [containsAll, containsExtra];
}

function fillPotentialArea(activeArea, members, nonMembers, potentialArea) {
  var influenceFactor = 0;
  // add all positive energy (included items) first, as negative energy
  // (morphing) requires all positives to be already set
  if (nodeInfluenceFactor) {
    members.forEach(function (item) {
      // add node energy
      influenceFactor = nodeInfluenceFactor;
      var nodeRDiff = nodeR0 - nodeR1;
      // using inverse a for numerical stability
      var inva = nodeRDiff * nodeRDiff;
      calculateRectangleInfluence(potentialArea, influenceFactor / inva, nodeR1, item);
    }); // end processing node items of this aggregate
  } // end processing positive node energy

  if (edgeInfluenceFactor) {
    // add the influence of all the virtual edges
    influenceFactor = edgeInfluenceFactor;
    var inva = (edgeR0 - edgeR1) * (edgeR0 - edgeR1);

    if (virtualEdges.length > 0) {
      calculateLinesInfluence(potentialArea, influenceFactor / inva, edgeR1, virtualEdges, activeArea);
    }
  }

  // calculate negative energy contribution for all other visible items within bounds
  if (negativeNodeInfluenceFactor) {
    nonMembers.forEach(function (item) {
      // if item is within influence bounds, add potential
      if (activeArea.intersects(item)) {
        // subtract influence
        influenceFactor = negativeNodeInfluenceFactor;
        var nodeRDiff = nodeR0 - nodeR1;
        // using inverse a for numerical stability
        var inva = nodeRDiff * nodeRDiff;
        calculateRectangleNegativeInfluence(potentialArea, influenceFactor / inva, nodeR1, item);
      }
    });
  }
}

function calculateCentroidDistances(items) {
  var totalx = 0;
  var totaly = 0;
  var nodeCount = 0;
  items.forEach(function (item) {
    totalx += item.centerx;
    totaly += item.centery;
    nodeCount += 1;
  });
  totalx /= nodeCount;
  totaly /= nodeCount;
  items.forEach(function (item) {
    var diffX = totalx - item.centerx;
    var diffY = totaly - item.centery;
    item.centroidDistance(Math.sqrt(diffX * diffX + diffY * diffY));
  });
}

function calculateVirtualEdges(items, nonMembers) {
  var visited = [];
  virtualEdges = [];
  calculateCentroidDistances(items);
  items.sort(function (a, b) {
    return a.cmp(b);
  });

  items.forEach(function (item) {
    var lines = connectItem(nonMembers, item, visited);
    lines.forEach(function (l) {
      virtualEdges.push(l);
    });
    visited.push(item);
  });
}

function connectItem(nonMembers: Rectangle[], item, visited) {
  var scannedLines = [];
  var linesToCheck = [];

  var itemCenter = new Point(item.centerx, item.centery);
  var closestNeighbour = null;
  var minLengthSq = Number.POSITIVE_INFINITY;
  // discover the nearest neighbour with minimal interference items
  visited.forEach(function (neighbourItem) {
    var nCenter = new Point(neighbourItem.centerx, neighbourItem.centery);
    var distanceSq = itemCenter.distanceSq(nCenter);

    var completeLine = new Line(itemCenter.x, itemCenter.y, nCenter.x, nCenter.y);
    // augment distance by number of interfering items
    var numberInterferenceItems = countInterferenceItems(nonMembers, completeLine);

    // TODO is there a better function to consider interference in nearest-neighbour checking? This is hacky
    if (distanceSq * (numberInterferenceItems + 1) * (numberInterferenceItems + 1) < minLengthSq) {
      closestNeighbour = neighbourItem;
      minLengthSq = distanceSq * (numberInterferenceItems + 1) * (numberInterferenceItems + 1);
    }
  });

  // if there is a visited closest neighbour, add straight line between
  // them to the positive energy to ensure connected clusters
  if (closestNeighbour) {
    var completeLine = new Line(itemCenter.x, itemCenter.y, closestNeighbour.centerx, closestNeighbour.centery);
    // route the edge around intersecting nodes not in set
    linesToCheck.push(completeLine);

    var hasIntersection = true;
    var iterations = 0;
    var intersections = [];
    intersections.length = 4;
    var numIntersections = 0;
    while (hasIntersection && iterations < maxRoutingIterations) {
      hasIntersection = false;
      while (!hasIntersection && linesToCheck.length) {
        var line = linesToCheck.pop();
        // resolve intersections in order along edge
        var closestItem = getCenterItem(nonMembers, line);
        if (closestItem) {
          numIntersections = Intersection.testIntersection(line, closestItem, intersections);
          // 2 intersections = line passes through item
          if (numIntersections == 2) {
            var tempMorphBuffer = morphBuffer;
            var movePoint = rerouteLine(closestItem, tempMorphBuffer, intersections, true);
            // test the movePoint already exists
            var foundFirst = pointExists(movePoint, linesToCheck) || pointExists(movePoint, scannedLines);
            var pointInside = isPointInsideNonMember(movePoint, nonMembers);
            // prefer first corner, even if buffer becomes very small
            while (!foundFirst && pointInside && tempMorphBuffer >= 1) {
              // try a smaller buffer
              tempMorphBuffer /= 1.5;
              movePoint = rerouteLine(closestItem, tempMorphBuffer, intersections, true);
              foundFirst = pointExists(movePoint, linesToCheck) || pointExists(movePoint, scannedLines);
              pointInside = isPointInsideNonMember(movePoint, nonMembers);
            }

            if (movePoint && !foundFirst && !pointInside) {
              // add 2 rerouted lines to check
              linesToCheck.push(new Line(line.x1(), line.y1(), movePoint.x, movePoint.y));
              linesToCheck.push(new Line(movePoint.x, movePoint.y, line.x2(), line.y2()));
              // indicate intersection found
              hasIntersection = true;
            }

            // if we didn't find a valid point around the
            // first corner, try the second
            if (!hasIntersection) {
              tempMorphBuffer = morphBuffer;
              movePoint = rerouteLine(closestItem, tempMorphBuffer, intersections, false);
              var foundSecond = pointExists(movePoint, linesToCheck) || pointExists(movePoint, scannedLines);
              pointInside = isPointInsideNonMember(movePoint, nonMembers);
              // if both corners have been used, stop; otherwise gradually reduce buffer and try second corner
              while (!foundSecond && pointInside && tempMorphBuffer >= 1) {
                // try a smaller buffer
                tempMorphBuffer /= 1.5;
                movePoint = rerouteLine(closestItem, tempMorphBuffer, intersections, false);
                foundSecond = pointExists(movePoint, linesToCheck) || pointExists(movePoint, scannedLines);
                pointInside = isPointInsideNonMember(movePoint, nonMembers);
              }

              if (movePoint && !foundSecond) {
                // add 2 rerouted lines to check
                linesToCheck.push(new Line(line.x1(), line.y1(), movePoint.x, movePoint.y));
                linesToCheck.push(new Line(movePoint.x, movePoint.y, line.x2(), line.y2()));
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
    while (linesToCheck.length) {
      scannedLines.push(linesToCheck.pop());
    }

    // try to merge consecutive lines if possible
    while (scannedLines.length) {
      var line1 = scannedLines.pop();
      if (scannedLines.length) {
        var line2 = scannedLines.pop();
        var mergeLine = new Line(line1.x1(), line1.y1(), line2.x2(), line2.y2());
        // resolve intersections in order along edge
        var closestItem = getCenterItem(nonMembers, mergeLine);
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
    scannedLines = linesToCheck;
  }
  return scannedLines;
}

function isPointInsideNonMember(point: Point, nonMembers: Rectangle[]) {
  return nonMembers.some(function (testRectangle) {
    return testRectangle.contains(point);
  });
}

function pointExists(pointToCheck: Point, lines: Line[]) {
  var found = false;
  lines.forEach(function (checkEndPointsLine) {
    if (found) return;
    if (Point.doublePointsEqual(checkEndPointsLine.x1, checkEndPointsLine.y1, pointToCheck.x, pointToCheck.y, 1e-3)) {
      found = true;
    }
    if (Point.doublePointsEqual(checkEndPointsLine.x2, checkEndPointsLine.y2, pointToCheck.x, pointToCheck.y, 1e-3)) {
      found = true;
    }
  });
  return found;
}

function getCenterItem(items, testLine: Line) {
  var minDistance = Number.POSITIVE_INFINITY;
  var closestItem = null;

  items.forEach(function (interferenceItem) {
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

function countInterferenceItems(interferenceItems: Intersection[], testLine: Line) {
  return interferenceItems.reduce(function (count, interferenceItem) {
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
