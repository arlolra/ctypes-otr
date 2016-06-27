var assert = require("assert");
var ctypes = require("ctypes");

var { libC } = require("../chrome/content/libotr.js");

function fromStr(str) {
  var arr = str.split("").concat("\0");
  return ctypes.char.array(arr.length)(arr);
}

describe.skip("libc", function() {
  it("should duplicate a string", function() {
    var str = "testme";
    var t = fromStr(str)._array.buffer;
    var dup = libC.strdup(t);
    assert.ok(!dup.isNull());
    assert.equal(dup.readString(), str);
  });
});
