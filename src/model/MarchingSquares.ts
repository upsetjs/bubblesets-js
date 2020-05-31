import { PointList } from './PointList';
import { Area } from './Area';
import { Point } from './Point';

const N = 0;
const S = 1;
const E = 2;
const W = 3;

export function marchingSquares(contour: PointList, potentialArea: Area, step: number, t: number) {
  let direction = S;
  let threshold = t;
  let marched = false;

  function updateDir(x: number, y: number, dir: number, res: number) {
    var v = potentialArea.get(x, y);
    if (Number.isNaN(v)) {
      return v;
    }
    if (v > threshold) {
      return dir + res;
    }
    return dir;
  }

  function getState(x: number, y: number) {
    var dir = 0;
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

  function doMarch(xpos: number, ypos: number) {
    let x = xpos;
    let y = ypos;
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
        case 0:
        case 3:
        case 2:
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
        case 1:
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
          y -= 1; // up
          break;
        case S:
          y += 1; // down
          break;
        case W:
          x -= 1; // left
          break;
        case E:
          x += 1; // right
          break;
        default:
          console.warn('Marching squares invalid state: ' + state);
          return true;
      }
    }
  }

  for (let x = 0; x < potentialArea.width && !marched; x += 1) {
    for (let y = 0; y < potentialArea.height && !marched; y += 1) {
      if (potentialArea.get(x, y) > threshold && getState(x, y) != 15) {
        marched = doMarch(x, y);
      }
    }
  }
  return marched;
} // MarchingSquares
