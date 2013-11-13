Cu.import("resource://gre/modules/ctypes.jsm");

function libOTR() {

  // ABI used to call native functions in the library
  const abi = ctypes.default_abi;
  const gcry_error_t = ctypes.uint32_t;

  const ioService = Cc["@mozilla.org/network/io-service;1"]
                      .getService(Ci.nsIIOService);

  // Load the library.
  let uri = ioService.newURI("resource://libotr", null, null);
  console.assert(uri instanceof Ci.nsIFileURL);
  let libotr = this.libotr = ctypes.open(uri.file.path);

  // proto.h

  // Initialize the OTR library. Pass the version of the API you are using.
	this.otrl_init = libotr.declare(
    "otrl_init", abi,
    gcry_error_t,
    ctypes.uint32_t,
    ctypes.uint32_t,
    ctypes.uint32_t
  );

  // userstate.h

  // A OtrlUserState encapsulates the list of known fingerprints and the list
  // of private keys.
  this.s_OtrlUserState = new ctypes.StructType("s_OtrlUserState");
  this.OtrlUserState_t = new ctypes.PointerType(this.s_OtrlUserState);

  // Create a new OtrlUserState.
	this.otrl_userstate_create = libotr.declare(
    "otrl_userstate_create", abi,
    this.OtrlUserState_t
  );

  // privkey.h

  // Generate a private DSA key for a given account, storing it into a file on
  // disk, and loading it into the given OtrlUserState. Overwrite any
  // previously generated keys for that account in that OtrlUserState.
  this.otrl_privkey_generate = libotr.declare(
    "otrl_privkey_generate", abi,
    gcry_error_t,
    this.OtrlUserState_t,
    ctypes.char.ptr,
    ctypes.char.ptr,
    ctypes.char.ptr
  );

  // The length of a string representing a human-readable version of a
  // fingerprint (including the trailing NUL).
  this.OTRL_PRIVKEY_FPRINT_HUMAN_LEN = 45;

  // Calculate a human-readable hash of our DSA public key. Return it in the
  // passed fingerprint buffer. Return NULL on error, or a pointer to the given
  // buffer on success.
  this.otrl_privkey_fingerprint = libotr.declare(
    "otrl_privkey_fingerprint", abi,
    ctypes.char.ptr,
    this.OtrlUserState_t,
    ctypes.ArrayType(ctypes.char, this.OTRL_PRIVKEY_FPRINT_HUMAN_LEN),
    ctypes.char.ptr,
    ctypes.char.ptr
  );

  // Convert a 20-byte hash value to a 45-byte human-readable value.
  this.otrl_privkey_hash_to_human = libotr.declare(
    "otrl_privkey_hash_to_human", abi,
  	ctypes.void_t,
    ctypes.ArrayType(ctypes.char, this.OTRL_PRIVKEY_FPRINT_HUMAN_LEN),
    ctypes.ArrayType(ctypes.unsigned_char, 20)
  );

}