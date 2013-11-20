let EXPORTED_SYMBOLS = ["libOTR"];

// Alias components
const Cu = Components.utils;
const Ci = Components.interfaces;

Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// Load the library
let uri = Services.io.newURI("resource://libotr", null, null);
let libotr = ctypes.open(uri.QueryInterface(Ci.nsIFileURL).file.path);

// libotr API version
const otrl_version = [4, 0, 0];

// Has libotr been initialized?
let initialized = false;

function libOTR() {
  if (!initialized) {
    // Apply version array as arguments to init function
    if (this.otrl_init.apply(this, otrl_version))
      throw new Error("Couldn't initialize libotr.");
    else
      initialized = true;
  }
}

// Alias prototype
let lop = libOTR.prototype;

// ABI used to call native functions in the library
const abi = ctypes.default_abi;

// libotr error type
const gcry_error_t = ctypes.uint32_t;

// proto.h

// Initialize the OTR library. Pass the version of the API you are using.
libOTR.prototype.otrl_init = libotr.declare(
  "otrl_init", abi,
  gcry_error_t,
  ctypes.uint32_t,
  ctypes.uint32_t,
  ctypes.uint32_t
);

// userstate.h

// A OtrlUserState encapsulates the list of known fingerprints and the list
// of private keys.
libOTR.prototype.s_OtrlUserState = new ctypes.StructType("s_OtrlUserState");
libOTR.prototype.OtrlUserState_t = new ctypes.PointerType(lop.s_OtrlUserState);

// Create a new OtrlUserState.
libOTR.prototype.otrl_userstate_create = libotr.declare(
  "otrl_userstate_create", abi,
  lop.OtrlUserState_t
);

// privkey.h

// Generate a private DSA key for a given account, storing it into a file on
// disk, and loading it into the given OtrlUserState. Overwrite any
// previously generated keys for that account in that OtrlUserState.
libOTR.prototype.otrl_privkey_generate = libotr.declare(
  "otrl_privkey_generate", abi,
  gcry_error_t,
  lop.OtrlUserState_t,
  ctypes.char.ptr,
  ctypes.char.ptr,
  ctypes.char.ptr
);

// The length of a string representing a human-readable version of a
// fingerprint (including the trailing NUL).
libOTR.prototype.OTRL_PRIVKEY_FPRINT_HUMAN_LEN = 45;

// Human readable fingerprint type
libOTR.prototype.fingerprint_t = ctypes.ArrayType(
  ctypes.char, lop.OTRL_PRIVKEY_FPRINT_HUMAN_LEN
);

// Calculate a human-readable hash of our DSA public key. Return it in the
// passed fingerprint buffer. Return NULL on error, or a pointer to the given
// buffer on success.
libOTR.prototype.otrl_privkey_fingerprint = libotr.declare(
  "otrl_privkey_fingerprint", abi,
  ctypes.char.ptr,
  lop.OtrlUserState_t,
  lop.fingerprint_t,
  ctypes.char.ptr,
  ctypes.char.ptr
);