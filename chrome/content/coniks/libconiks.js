var isNode = (typeof process === "object");
var isJpm = !isNode && (typeof require === "function");

var ctypes;

if (isNode) {
  ctypes = require("ctypes");
} else {
  var Ci, Cu, Cc;
  if (isJpm) {
    ({ Ci, Cu, Cc } = require("chrome"));
  } else {
    ({ interfaces: Ci, utils: Cu, classes: Cc } = Components);
  }
  Cu.import("resource://gre/modules/ctypes.jsm");
  Cu.import("resource://gre/modules/Services.jsm");
}

var abi = ctypes.default_abi;

var libconiks, libconiksPath;

if (isJpm) {
  let env = require("sdk/system").env;
  libconiksPath = env.PWD + "/addon/" + ctypes.libraryName("coniks");
  libconiks = ctypes.open(libconiksPath);
} else if (!isNode) {
  let uri = "chrome://otr/content/coniks/" + ctypes.libraryName("coniks");
  let chromeReg = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry);
  uri = chromeReg.convertChromeURL(Services.io.newURI(uri, null, null));
  libconiksPath = uri.QueryInterface(Ci.nsIFileURL).file.path;
  libconiks = ctypes.open(libconiksPath);
} else {
  // Ignore for now
}

// functions
var libCONIKS = {
  // extern int cgoVerifySignature(void* p0, int p1,
  //                               void* p2, int p3,
  //                               void* p4, int p5);
  cgoVerifySignature: libconiks.declare(
    "cgoVerifySignature", abi, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int
  ),

  // extern int cgoVerifyVrf(void* p0, int p1,
  //                         void* p2, int p3,
  //                         void* p4, int p5,
  //                         void* p6, int p7);
  cgoVerifyVrf: libconiks.declare(
    "cgoVerifyVrf", abi, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int
  ),

  // extern int cgoVerifyHashChain(void* p0, int p1,
  //                               void* p2, int p3);
  cgoVerifyHashChain: libconiks.declare(
    "cgoVerifyHashChain", abi, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int
  ),

  // extern int cgoVerifyAuthPath(void* p0, int p1,
  //                              void* p2, int p3,
  //                              void* p4, int p5,
  //                              void* p6, int p7, int p8,
  //                              int p9,
  //                              void* p10, int p11,
  //                              void* p12, int p13,
  //                              int p14);
  cgoVerifyAuthPath: libconiks.declare(
    "cgoVerifyAuthPath", abi, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int, ctypes.int,
    ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int,
    ctypes.unsigned_char.ptr, ctypes.int,
    ctypes.int
  ),
};

// exports

if (isNode) {
  module.exports = { libCONIKS: libCONIKS };
} else if (isJpm) {
  exports.libCONIKS = libCONIKS;
} else {
  this.EXPORTED_SYMBOLS = ["libCONIKS"];
}
