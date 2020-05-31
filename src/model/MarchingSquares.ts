function MarchingSquares(contour, potentialArea, step, t) {
  var direction = MarchingSquares.S;
  var threshold = t;
  var marched = false;

  function updateDir(x, y, dir, res) {
    var v = potentialArea.get(x, y);
    if (isNaN(v)) return v;
    if (v > threshold) return dir + res;
    return dir;
  }

  function getState(x, y) {
    var dir = 0;
    dir = updateDir(x, y, dir, 1);
    dir = updateDir(x + 1, y, dir, 2);
    dir = updateDir(x, y + 1, dir, 4);
    dir = updateDir(x + 1, y + 1, dir, 8);
    if (isNaN(dir)) {
      console.warn(
        'marched out of bounds: ' + x + ' ' + y + ' bounds: ' + potentialArea.width() + ' ' + potentialArea.height()
      );
      return -1;
    }
    return dir;
  }

  function doMarch(xpos, ypos) {
    var x = xpos;
    var y = ypos;
    for (;;) {
      // iterative version of end recursion
      var p = new Point(x * step, y * step);
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
      var state = getState(x, y);
      // x, y are upper left of 2X2 marching square
      switch (state) {
        case -1:
          return true; // Marched out of bounds
        case 0:
        case 3:
        case 2:
        case 7:
          direction = MarchingSquares.E;
          break;
        case 12:
        case 14:
        case 4:
          direction = MarchingSquares.W;
          break;
        case 6:
          direction = direction == MarchingSquares.N ? MarchingSquares.W : MarchingSquares.E;
          break;
        case 1:
        case 13:
        case 5:
          direction = MarchingSquares.N;
          break;
        case 9:
          direction = direction == MarchingSquares.E ? MarchingSquares.N : MarchingSquares.S;
          break;
        case 10:
        case 8:
        case 11:
          direction = MarchingSquares.S;
          break;
        default:
          console.warn('Marching squares invalid state: ' + state);
          return true;
      }

      switch (direction) {
        case MarchingSquares.N:
          y -= 1; // up
          break;
        case MarchingSquares.S:
          y += 1; // down
          break;
        case MarchingSquares.W:
          x -= 1; // left
          break;
        case MarchingSquares.E:
          x += 1; // right
          break;
        default:
          console.warn('Marching squares invalid state: ' + state);
          return true;
      }
    }
    return true;
  }

  this.march = function () {
    for (var x = 0; x < potentialArea.width() && !marched; x += 1) {
      for (var y = 0; y < potentialArea.height() && !marched; y += 1) {
        if (potentialArea.get(x, y) > threshold && getState(x, y) != 15) {
          marched = doMarch(x, y);
        }
      }
    }
    return marched;
  };
} // MarchingSquares
MarchingSquares.N = 0;
MarchingSquares.S = 1;
MarchingSquares.E = 2;
MarchingSquares.W = 3;
