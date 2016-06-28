var { libC } = require("../libc.js");

var { Cu } = require("chrome");
Cu.import("resource://gre/modules/ctypes.jsm");

exports["test duplicate a string"] = function(assert) {
  var str = "testme";
  var dup = libC.strdup(str);
  assert.ok(!dup.isNull());
  assert.equal(dup.readString(), str);
  libC.free(dup);
};

exports["test compare n bytes of memory"] = function(assert) {
  var one = ctypes.char.array(3)("one");
  var two = ctypes.char.array(3)("two");
  assert.ok(libC.memcmp(one, two, 3) !== 0);
  var three = ctypes.char.array(4)("onee");
  assert.ok(libC.memcmp(one, three, 3) === 0);
};

require("sdk/test").run(exports);
