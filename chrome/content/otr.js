let EXPORTED_SYMBOLS = ["OTR"];

// Alias components
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");

// load libOTR
Cu.import("chrome://otr/content/libotr.js");
let libotr = new libOTR();

// defaults
const account = "default_account";
const protocol = "default_protocol";

// error type
function OTRError(message) {
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    var err = new Error();
    err.toString = this.toString.bind(this);
    this.stack = err.stack;
  }
  this.message = message;
}

OTRError.prototype = Object.create(Error.prototype, {
  name: { value: "OTR Error" },
  constructor: { value: OTRError }
});

// otr constructor
// initializes a new userstate
// an sets the private key file
function OTR() {
  this.userState = libotr.otrl_userstate_create();
  this.privKey = FileUtils.getFile("ProfD", ["otr.privKey"]);
}

OTR.prototype = {
  constructor: OTR,
  userState: null,
  privKey: null
};

// generate a private key
// TODO: maybe move this to a ChromeWorker
OTR.prototype.genKey = function (cb) {

  let err = libotr.otrl_privkey_generate(
    this.userState,
    this.privKey.path,
    account,
    protocol
  );

  if (err)
    return cb(new OTRError("Returned code: " + err));

  let fingerprint = new libotr.fingerprint_t();

  err = libotr.otrl_privkey_fingerprint(
    this.userState,
    fingerprint,
    account,
    protocol
  );

  if (err.isNull())
    return cb(new OTRError("Returned a null pointer."));

  cb(null, fingerprint.readString());

};