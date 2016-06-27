var { libC } = require("../libotr.js");

exports["test duplicate a string"] = function(assert) {
  var str = "testme";
  var dup = libC.strdup(str);
  assert.ok(!dup.isNull());
  assert.equal(dup.readString(), str);
};

require("sdk/test").run(exports);
