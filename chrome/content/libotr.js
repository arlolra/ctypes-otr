let EXPORTED_SYMBOLS = ["libOTR"];

// Alias components
const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

let Cr = Cc["@mozilla.org/chrome/chrome-registry;1"]
           .getService(Ci.nsIXULChromeRegistry);

Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/Services.jsm");

const CHROME_URI = "chrome://otr/content/";

// Load the library
let uri = CHROME_URI + ctypes.libraryName("otr");
uri = Cr.convertChromeURL(Services.io.newURI(uri, null, null));
let libotr = ctypes.open(uri.QueryInterface(Ci.nsIFileURL).file.path);

// libotr API version
const otrl_version = [4, 0, 0];

// ABI used to call native functions in the library
const abi = ctypes.default_abi;

// libotr error type
const gcry_error_t = ctypes.uint32_t;

function libOTR() {
  // Apply version array as arguments to init function
  if (this.otrl_init.apply(this, otrl_version))
    throw new Error("Couldn't initialize libotr.");
}

// Alias prototype
let lop = libOTR.prototype;

lop.close = function () {
  libotr.close();
};

// proto.h

// Initialize the OTR library. Pass the version of the API you are using.
lop.otrl_init = libotr.declare(
  "otrl_init", abi,
  gcry_error_t,
  ctypes.uint32_t,
  ctypes.uint32_t,
  ctypes.uint32_t
);

// userstate.h

// A OtrlUserState encapsulates the list of known fingerprints and the list
// of private keys.
lop.s_OtrlUserState = new ctypes.StructType("s_OtrlUserState");
lop.OtrlUserState_t = new ctypes.PointerType(lop.s_OtrlUserState);

// Create a new OtrlUserState.
lop.otrl_userstate_create = libotr.declare(
  "otrl_userstate_create", abi,
  lop.OtrlUserState_t
);

// privkey.h

// Generate a private DSA key for a given account, storing it into a file on
// disk, and loading it into the given OtrlUserState. Overwrite any
// previously generated keys for that account in that OtrlUserState.
lop.otrl_privkey_generate = libotr.declare(
  "otrl_privkey_generate", abi,
  gcry_error_t,
  lop.OtrlUserState_t,
  ctypes.char.ptr,
  ctypes.char.ptr,
  ctypes.char.ptr
);

// Read a sets of private DSA keys from a file on disk into the given
// OtrlUserState.
lop.otrl_privkey_read = libotr.declare(
  "otrl_privkey_read", abi,
  gcry_error_t,
  lop.OtrlUserState_t,
  ctypes.char.ptr
);

// Read the fingerprint store from a file on disk into the given
// OtrlUserState.
lop.otrl_privkey_read_fingerprints = libotr.declare(
  "otrl_privkey_read_fingerprints", abi,
  gcry_error_t,
  lop.OtrlUserState_t,
  ctypes.char.ptr,
  ctypes.void_t.ptr,
  ctypes.void_t.ptr
);

// The length of a string representing a human-readable version of a
// fingerprint (including the trailing NUL).
lop.OTRL_PRIVKEY_FPRINT_HUMAN_LEN = 45;

// Human readable fingerprint type
lop.fingerprint_t = ctypes.ArrayType(
  ctypes.char, lop.OTRL_PRIVKEY_FPRINT_HUMAN_LEN
);

// Calculate a human-readable hash of our DSA public key. Return it in the
// passed fingerprint buffer. Return NULL on error, or a pointer to the given
// buffer on success.
lop.otrl_privkey_fingerprint = libotr.declare(
  "otrl_privkey_fingerprint", abi,
  ctypes.char.ptr,
  lop.OtrlUserState_t,
  lop.fingerprint_t,
  ctypes.char.ptr,
  ctypes.char.ptr
);