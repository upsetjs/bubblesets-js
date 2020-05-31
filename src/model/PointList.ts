function PointList(size) {
  var els = 0;
  var arr = [];
  arr.length = size; // pre-allocating
  var set = {};

  function hash(p) {
    return p.x() + 'x' + p.y();
  }

  this.add = function (p) {
    set[hash(p)] = p;
    arr[els] = p;
    els += 1;
  };
  this.contains = function (p) {
    var test = set[hash(p)];
    if (!test) return false;
    return test.x() == p.x() && test.y() == p.y();
  };
  this.isFirst = function (p) {
    if (!els) return false;
    var test = arr[0];
    return test.x() == p.x() && test.y() == p.y();
  };
  this.list = function () {
    return arr
      .filter(function (p) {
        return p;
      })
      .map(function (p) {
        return p.get();
      });
  };
  this.clear = function () {
    for (var i = 0; i < arr.length; i += 1) {
      arr[i] = null; // nulling is cheaper than deleting or reallocating
    }
    set = {};
    els = 0;
  };
  this.get = function (ix) {
    return arr[ix];
  };
  this.size = function () {
    return els;
  };
} // PointList
