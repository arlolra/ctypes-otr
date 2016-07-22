var isNode = (typeof process === "object");

var { libCONIKS } = require("../chrome/content/coniks/libconiks.js");

var ctypes;
if (isNode) {
  ctypes = require("ctypes");
} else {
  var { Cu } = require("chrome");
  Cu.import("resource://gre/modules/ctypes.jsm");
}


exports["test vrf verify"] = function(assert) {
  var pk = [28,149,90,106,83,99,227,227,211,89,29,250,220,141,17,203,
            254,130,127,134,175,133,156,164,83,58,139,228,79,64,252,75];
  var pkArr = ctypes.unsigned_char.array()(pk);
  var m = [97,108,105,99,101];
  var mArr = ctypes.unsigned_char.array()(m);
  var index = [96,43,9,174,212,169,113,184,98,128,48,210,186,218,171,
               145,115,82,29,23,177,126,63,169,232,125,248,165,91,134,76,32];
  var indexArr = ctypes.unsigned_char.array()(index);
  var proof = [213,244,36,141,83,73,206,202,94,3,40,174,237,156,101,
               140,222,18,24,211,136,24,74,63,246,211,142,186,255,123,
               73,12,33,252,200,161,18,208,124,150,91,42,229,156,96,225,
               154,226,206,143,161,1,141,188,34,7,124,45,222,189,89,116,
               36,3,233,126,71,41,140,29,36,34,138,167,217,239,16,210,51,
               125,28,127,7,34,89,219,181,82,86,154,10,155,159,144,158,179];
  var proofArr = ctypes.unsigned_char.array()(proof);

  assert.equal(libCONIKS.cgoVerifyVrf(pkArr, pk.length, mArr, m.length,
                                      indexArr, index.length, proofArr, proof.length), 1);
};


if (isNode) {
  describe.skip("libconiks", function() {
    Object.keys(exports).forEach(function(key) {
      it(key, exports[key].bind(null, require("assert")));
    });
  });
} else {
  require("sdk/test").run(exports);
}
