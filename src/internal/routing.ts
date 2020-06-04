import { EState, fractionToLineCenter, Intersection, testIntersection } from '../model/Intersection';
import { Line } from '../model/Line';
import { Rectangle } from '../model/Rectangle';
import { doublePointsEqual, ptsDistanceSq } from '../utils';
import { IPoint, point } from '../interfaces';

export function calculateVirtualEdges(
  items: ReadonlyArray<Rectangle>,
  nonMembers: ReadonlyArray<Rectangle>,
  maxRoutingIterations: number,
  morphBuffer: number
) {
  const visited: Rectangle[] = [];
  const virtualEdges: Line[] = [];
  const sorted = sortByDistanceToCentroid(items);

  for (const item of sorted) {
    const lines = connectItem(nonMembers, item, visited, maxRoutingIterations, morphBuffer);
    for (const l of lines) {
      virtualEdges.push(l);
    }
    visited.push(item);
  }
  return virtualEdges;
}

function connectItem(
  nonMembers: ReadonlyArray<Rectangle>,
  item: Rectangle,
  visited: Rectangle[],
  maxRoutingIterations: number,
  morphBuffer: number
) {
  const scannedLines: Line[] = [];
  const linesToCheck: Line[] = [];

  let itemCenter = point(item.cx, item.cy);
  let minLengthSq = Number.POSITIVE_INFINITY;
  // discover the nearest neighbor with minimal interference items
  const closestNeighbor = visited.reduce((closestNeighbor, neighborItem) => {
    const distanceSq = ptsDistanceSq(itemCenter.x, itemCenter.y, neighborItem.cx, neighborItem.cy);

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

  while (hasIntersection && iterations < maxRoutingIterations) {
    hasIntersection = false;
    while (!hasIntersection && linesToCheck.length > 0) {
      var line = linesToCheck.pop()!;
      // resolve intersections in order along edge
      var closestItem = getCenterItem(nonMembers, line);
      if (closestItem) {
        const intersections = testIntersection(line, closestItem);
        // 2 intersections = line passes through item
        if (intersections.count == 2) {
          var tempMorphBuffer = morphBuffer;
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
            tempMorphBuffer = morphBuffer;
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

function isPointInRectangles(point: IPoint, rects: ReadonlyArray<Rectangle>) {
  return rects.some((r) => r.containsPt(point.x, point.y));
}

function pointExists(pointToCheck: IPoint, lines: ReadonlyArray<Line>) {
  return lines.some((checkEndPointsLine) => {
    if (doublePointsEqual(checkEndPointsLine.x1, checkEndPointsLine.y1, pointToCheck.x, pointToCheck.y, 1e-3)) {
      return true;
    }
    if (doublePointsEqual(checkEndPointsLine.x2, checkEndPointsLine.y2, pointToCheck.x, pointToCheck.y, 1e-3)) {
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
        return point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
      if (bottomIntersect.state === EState.POINT)
        // triangle, must go around bottom left
        return point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
      // else through left to right, calculate areas
      const totalArea = rectangle.area;
      // top area
      const topArea = rectangle.width * ((leftIntersect.y - rectangle.y + (rightIntersect.y - rectangle.y)) * 0.5);
      if (topArea < totalArea * 0.5) {
        // go around top (the side which would make a greater movement)
        if (leftIntersect.y > rightIntersect.y)
          // top left
          return point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
        // top right
        return point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
      }
      // go around bottom
      if (leftIntersect.y < rightIntersect.y)
        // bottom left
        return point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
      // bottom right
      return point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
    }
    // right side
    if (rightIntersect.state === EState.POINT) {
      if (topIntersect.state === EState.POINT)
        // triangle, must go around top right
        return point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
      if (bottomIntersect.state === EState.POINT)
        // triangle, must go around bottom right
        return point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
    }
    // else through top to bottom, calculate areas
    const totalArea = rectangle.height * rectangle.width;
    const leftArea = rectangle.height * ((topIntersect.x - rectangle.x + (rightIntersect.x - rectangle.x)) * 0.5);
    if (leftArea < totalArea * 0.5) {
      // go around left
      if (topIntersect.x > bottomIntersect.x)
        // top left
        return point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
      // bottom left
      return point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
    }
    // go around right
    if (topIntersect.x < bottomIntersect.x)
      // top right
      return point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
    // bottom right
    return point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
  }
  // wrap around opposite (usually because the first move caused a problem)
  if (leftIntersect.state === EState.POINT) {
    if (topIntersect.state === EState.POINT)
      // triangle, must go around bottom right
      return point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
    if (bottomIntersect.state === EState.POINT)
      // triangle, must go around top right
      return point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
    // else through left to right, calculate areas
    const totalArea = rectangle.height * rectangle.width;
    const topArea = rectangle.width * ((leftIntersect.y - rectangle.y + (rightIntersect.y - rectangle.y)) * 0.5);
    if (topArea < totalArea * 0.5) {
      // go around bottom (the side which would make a lesser movement)
      if (leftIntersect.y > rightIntersect.y)
        // bottom right
        return point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
      // bottom left
      return point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
    }
    // go around top
    if (leftIntersect.y < rightIntersect.y)
      // top right
      return point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
    // top left
    return point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
  }
  if (rightIntersect.state === EState.POINT) {
    if (topIntersect.state === EState.POINT)
      // triangle, must go around bottom left
      return point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
    if (bottomIntersect.state === EState.POINT)
      // triangle, must go around top left
      return point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
  }
  // else through top to bottom, calculate areas
  const totalArea = rectangle.height * rectangle.width;
  const leftArea = rectangle.height * ((topIntersect.x - rectangle.x + (rightIntersect.x - rectangle.x)) * 0.5);
  if (leftArea < totalArea * 0.5) {
    // go around right
    if (topIntersect.x > bottomIntersect.x)
      // bottom right
      return point(rectangle.x2 + rerouteBuffer, rectangle.y2 + rerouteBuffer);
    // top right
    return point(rectangle.x2 + rerouteBuffer, rectangle.y - rerouteBuffer);
  }
  // go around left
  if (topIntersect.x < bottomIntersect.x)
    // bottom left
    return point(rectangle.x - rerouteBuffer, rectangle.y2 + rerouteBuffer);
  // top left
  return point(rectangle.x - rerouteBuffer, rectangle.y - rerouteBuffer);
}
