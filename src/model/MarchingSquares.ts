import { PointList } from './PointList';
import { Area } from './Area';
import { Point } from './Point';

const N = 0;
const S = 1;
const E = 2;
const W = 3;

export function marchingSquares(contour: PointList, potentialArea: Area, step: number, threshold: number) {
  function updateDir(x: number, y: number, dir: number, res: number) {
    const v = potentialArea.get(x, y);
    if (Number.isNaN(v)) {
      return Number.NaN;
    }
    if (v > threshold) {
      return dir + res;
    }
    return dir;
  }

  function getState(x: number, y: number) {
    let dir = N;
    dir = updateDir(x, y, dir, 1);
    dir = updateDir(x + 1, y, dir, 2);
    dir = updateDir(x, y + 1, dir, 4);
    dir = updateDir(x + 1, y + 1, dir, 8);
    if (Number.isNaN(dir)) {
      console.warn(
        'marched out of bounds: ' + x + ' ' + y + ' bounds: ' + potentialArea.width + ' ' + potentialArea.height
      );
      return -1;
    }
    return dir;
  }

  let direction = S;

  function doMarch(xPos: number, yPos: number) {
    let x = xPos;
    let y = yPos;
    for (;;) {
      // iterative version of end recursion
      const p = new Point(x * step, y * step);
      // check if we're back where we started
      if (contour.contains(p)) {
        if (!contour.isFirst(p)) {
          // encountered a loop but haven't returned to start; will change
          // direction using conditionals and continue back to start
        } else {
          return true;
        }
      } else {
        contour.add(p);
      }
      const state = getState(x, y);
      // x, y are upper left of 2X2 marching square
      switch (state) {
        case -1:
          return true; // Marched out of bounds
        case N:
        case W:
        case E:
        case 7:
          direction = E;
          break;
        case 12:
        case 14:
        case 4:
          direction = W;
          break;
        case 6:
          direction = direction == N ? W : E;
          break;
        case S:
        case 13:
        case 5:
          direction = N;
          break;
        case 9:
          direction = direction == E ? N : S;
          break;
        case 10:
        case 8:
        case 11:
          direction = S;
          break;
        default:
          console.warn('Marching squares invalid state: ' + state);
          return true;
      }

      switch (direction) {
        case N:
          y--; // up
          break;
        case S:
          y++; // down
          break;
        case W:
          x--; // left
          break;
        case E:
          x++; // right
          break;
        default:
          console.warn('Marching squares invalid state: ' + state);
          return true;
      }
    }
  }

  for (let x = 0; x < potentialArea.width; x++) {
    for (let y = 0; y < potentialArea.height; y++) {
      if (potentialArea.get(x, y) > threshold && getState(x, y) != 15) {
        if (doMarch(x, y)) {
          return true;
        }
      }
    }
  }
  return false;
}
