let EXPORTED_SYMBOLS = ["OTR"];

// Alias components
const { interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");

const CHROME_URI = "chrome://otr/content/";

// load libOTR
Cu.import(CHROME_URI + "libotr.js");
let libotr = new libOTR();

// defaults
const defaultAccount = "default_account";
const defaultProtocol = "default_protocol";

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

// initialize a new userstate
// load private key and fingerprints
function OTR() {
  this.userState = libotr.otrl_userstate_create();

  this.privKey = FileUtils.getFile("ProfD", ["otr.privKey"]);
  if (!this.privKey.exists())
    this.privKey.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0600);

  let err = libotr.otrl_privkey_read(this.userState, this.privKey.path);
  if (err)
    throw new OTRError("Returned code: " + err);

  this.fingerprints = FileUtils.getFile("ProfD", ["otr.fingerprints"]);
  if (!this.fingerprints.exists())
    this.fingerprints.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0600);

  err = libotr.otrl_privkey_read_fingerprints(
    this.userState, this.fingerprints.path, null, null
  );
  if (err)
    throw new OTRError("Returned code: " + err);

  this.generatePrivKey();
}

OTR.prototype = {
  constructor: OTR,
  userState: null,
  privKey: null,
  fingerprints: null
};

OTR.prototype.close = function () {
  libotr.close();
};

// generate a private key
// TODO: maybe move this to a ChromeWorker
OTR.prototype.generatePrivKey = function (account, protocol) {
  let err = libotr.otrl_privkey_generate(
    this.userState,
    this.privKey.path,
    account || defaultAccount,
    protocol || defaultProtocol
  );
  if (err)
    throw new OTRError("Returned code: " + err);
};

// get my fingerprint
OTR.prototype.privKeyFingerprint = function (account, protocol) {
  let fingerprint = new libotr.fingerprint_t();

  let err = libotr.otrl_privkey_fingerprint(
    this.userState,
    fingerprint,
    account || defaultAccount,
    protocol || defaultProtocol
  );

  if (err.isNull())
    throw new OTRError("Returned a null pointer.");

  return fingerprint.readString();
};