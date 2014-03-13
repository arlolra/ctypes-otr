let EXPORTED_SYMBOLS = ["libOTR"];

const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

let Cr = Cc["@mozilla.org/chrome/chrome-registry;1"]
           .getService(Ci.nsIXULChromeRegistry);

Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/Services.jsm");

const CHROME_URI = "chrome://otr/content/";

// load libotr
let uri = CHROME_URI + ctypes.libraryName("otr");
uri = Cr.convertChromeURL(Services.io.newURI(uri, null, null));
let libotr = ctypes.open(uri.QueryInterface(Ci.nsIFileURL).file.path);

// libotr API version
const otrl_version = [4, 0, 0];

// ABI used to call native functions in the library
const abi = ctypes.default_abi;

function libOTR() {
  // Apply version array as arguments to init function
  if (this.otrl_init.apply(this, otrl_version))
    throw new Error("Couldn't initialize libotr.");
}

// type defs
const gcry_error_t = ctypes.uint32_t;
const s_OtrlUserState = new ctypes.StructType("s_OtrlUserState");
const OtrlUserState_t = new ctypes.PointerType(s_OtrlUserState);
const OTRL_PRIVKEY_FPRINT_HUMAN_LEN = 45;
const fingerprint_t = ctypes.ArrayType(
  ctypes.char, OTRL_PRIVKEY_FPRINT_HUMAN_LEN
);

libOTR.prototype = {

  constructor: libOTR,
  close: () => libotr.close(),

  // proto.h

  // Initialize the OTR library. Pass the version of the API you are using.
  otrl_init: libotr.declare(
    "otrl_init", abi, gcry_error_t,
    ctypes.uint32_t, ctypes.uint32_t, ctypes.uint32_t
  ),

  // userstate.h

  // A OtrlUserState encapsulates the list of known fingerprints and the list
  // of private keys.
  s_OtrlUserState: s_OtrlUserState,
  OtrlUserState_t: OtrlUserState_t,

  // Create a new OtrlUserState.
  otrl_userstate_create: libotr.declare(
    "otrl_userstate_create", abi, OtrlUserState_t
  ),

  // privkey.h

  // Generate a private DSA key for a given account, storing it into a file on
  // disk, and loading it into the given OtrlUserState. Overwrite any
  // previously generated keys for that account in that OtrlUserState.
  otrl_privkey_generate: libotr.declare(
    "otrl_privkey_generate", abi, gcry_error_t,
    OtrlUserState_t, ctypes.char.ptr, ctypes.char.ptr, ctypes.char.ptr
  ),

  // Read a sets of private DSA keys from a file on disk into the given
  // OtrlUserState.
  otrl_privkey_read: libotr.declare(
    "otrl_privkey_read", abi, gcry_error_t, OtrlUserState_t, ctypes.char.ptr
  ),

  // Read the fingerprint store from a file on disk into the given
  // OtrlUserState.
  otrl_privkey_read_fingerprints: libotr.declare(
    "otrl_privkey_read_fingerprints", abi, gcry_error_t,
    OtrlUserState_t, ctypes.char.ptr, ctypes.void_t.ptr, ctypes.void_t.ptr
  ),

  // The length of a string representing a human-readable version of a
  // fingerprint (including the trailing NUL).
  OTRL_PRIVKEY_FPRINT_HUMAN_LEN: OTRL_PRIVKEY_FPRINT_HUMAN_LEN,

  // Human readable fingerprint type
  fingerprint_t: fingerprint_t,

  // Calculate a human-readable hash of our DSA public key. Return it in the
  // passed fingerprint buffer. Return NULL on error, or a pointer to the given
  // buffer on success.
  otrl_privkey_fingerprint: libotr.declare(
    "otrl_privkey_fingerprint", abi, ctypes.char.ptr,
    OtrlUserState_t, fingerprint_t, ctypes.char.ptr, ctypes.char.ptr
  )

};