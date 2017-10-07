var isNode = (typeof process === "object");
var isJpm = !isNode && (typeof require === "function");

var ctypes, OS;

if (isNode) {
  ctypes = require("ctypes");
  // FIXME: This isn't implemented upstream yet.
  ctypes.size_t = ctypes.unsigned_int;
  OS = process.platform;
} else {
  var Cu;
  if (isJpm) {
    ({ Cu } = require("chrome"));
  } else {
    ({ utils: Cu } = Components);
  }
  Cu.import("resource://gre/modules/ctypes.jsm");
  Cu.import("resource://gre/modules/Services.jsm");
  OS = Services.appinfo.OS.toLowerCase();
}

// type defs

var FILE = ctypes.StructType("FILE");
var fname_t = ctypes.char.ptr;
var wchar_t = ctypes.char16_t;

// Set the abi and path to libc based on the OS.
var libcAbi, libcPath;
var strdup = "strdup";
var fopen = "fopen";

switch(OS) {
case "win32":
case "winnt":
  libcAbi = ctypes.winapi_abi;
  libcPath = ctypes.libraryName("msvcrt");
  strdup = "_strdup";
  fopen = "_wfopen";
  fname_t = wchar_t.ptr;
  break;
case "darwin":
  libcAbi = ctypes.default_abi;
  libcPath = ctypes.libraryName("c");
  break;
case "linux":
  libcAbi = ctypes.default_abi;
  libcPath = "libc.so.6";
  break;
default:
  throw new Error("Unknown OS");
}

var libc = ctypes.open(libcPath);

var libC = {
  FILE: FILE,
  memcmp: libc.declare(
    "memcmp", libcAbi, ctypes.int,
    ctypes.void_t.ptr,
    ctypes.void_t.ptr,
    ctypes.size_t
  ),
  memcpy: libc.declare(
    "memcpy", libcAbi, ctypes.void_t.ptr,
    ctypes.void_t.ptr,
    ctypes.void_t.ptr,
    ctypes.size_t
  ),
  malloc: libc.declare(
    "malloc", libcAbi, ctypes.void_t.ptr,
    ctypes.size_t
  ),
  free: libc.declare(
    "free", libcAbi, ctypes.void_t,
    ctypes.void_t.ptr
  ),
  strdup: libc.declare(
    strdup, libcAbi, ctypes.char.ptr,
    ctypes.char.ptr
  ),
  fclose: libc.declare(
    "fclose", libcAbi, ctypes.int,
    FILE.ptr
  ),
  fopen: libc.declare(
    fopen, libcAbi, FILE.ptr,
    fname_t,
    fname_t
  ),
};


// exports

if (isNode) {
  module.exports = { libC: libC };
} else if (isJpm) {
  exports.libC = libC;
} else {
  this.EXPORTED_SYMBOLS = ["libC"];
}
