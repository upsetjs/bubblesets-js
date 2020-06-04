import { Rectangle, Line } from '../model';
import { Area } from '../model/Area';

export function createLineInfluenceArea(line: Line, potentialArea: Area, r1: number) {
  const lr = line.asRect();
  return createRectangleInfluenceArea(lr, potentialArea, r1, (x, y) => line.ptSegDistSq(x, y));
}

export function createRectangleInfluenceArea(
  rect: Rectangle,
  potentialArea: Area,
  r1: number,
  distanceFunction?: (x: number, y: number) => number
) {
  const ri2 = r1 * r1;

  const scaled = potentialArea.scale(rect);
  const padded = potentialArea.addPadding(scaled, r1);
  // within the rect ... full ri2
  // outside rect ... depends on distance
  // cttc
  // lffr
  // lffr
  // cbbc
  const area = new Area(potentialArea.pixelGroup, padded.width, padded.height, padded.x, padded.y);

  // find the affected subregion of potentialArea
  // for every point in active subregion of potentialArea, calculate
  // distance to nearest point on rectangle and add influence

  for (let y = 0; y < padded.height; y++) {
    for (let x = 0; x < padded.width; x++) {
      // convert back to screen coordinates
      const tempX = potentialArea.invertScaleX(padded.x + x);
      const tempY = potentialArea.invertScaleY(padded.y + y);
      const distanceSq = distanceFunction ? distanceFunction(tempX, tempY) : rect.rectDistSq(tempX, tempY);
      // only influence if less than r1
      if (distanceSq < ri2) {
        const dr = Math.sqrt(distanceSq) - r1;
        area.set(x, y, dr * dr);
      }
    }
  }
  return area;
}
