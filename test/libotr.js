var assert = require("assert");
var ctypes = require("ctypes");

var { libOTR } = require("../chrome/content/libotr.js");

// FIXME: node-ctypes doesn't convert strings automatically as in,
// https://developer.mozilla.org/en-US/docs/Mozilla/js-ctypes/Using_js-ctypes/Working_with_data#Using_strings_with_C_functions
function fromStr(str) {
  var arr = str.split("").concat("\0");
  return ctypes.char.array(arr.length)(arr);
}

describe.skip("libotr", function() {
  before(function() {
    libOTR.init();
  });

  it("should generate a key", function() {
    var userstate = libOTR.otrl_userstate_create();
    var account = "test1";
    var protocol = "protocol1";
    var newkey = new ctypes.void_t.ptr(0);

    var err = libOTR.otrl_privkey_generate_start(
      userstate, fromStr(account), fromStr(protocol), newkey.address()
    );

    assert.ok(newKey.isNull());
  });
});
