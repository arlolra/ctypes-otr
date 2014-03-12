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
const default_account = "default_account";
const default_protocol = "default_protocol";

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

function OTR() {
  // initialize a new userstate
  this.userstate = libotr.otrl_userstate_create();

  // load private key
  this.private_key = FileUtils.getFile("ProfD", ["otr.private_key"]);
  if (!this.private_key.exists())
    this.private_key.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0600);

  let err = libotr.otrl_privkey_read(this.userstate, this.private_key.path);
  if (err)
    throw new OTRError("Returned code: " + err);

  // load fingerprints
  this.fingerprints = FileUtils.getFile("ProfD", ["otr.fingerprints"]);
  if (!this.fingerprints.exists())
    this.fingerprints.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0600);

  err = libotr.otrl_privkey_read_fingerprints(
    this.userstate, this.fingerprints.path, null, null
  );
  if (err)
    throw new OTRError("Returned code: " + err);

  // load instance tags
  this.instance_tags = FileUtils.getFile("ProfD", ["otr.instance_tags"]);
  if (!this.instance_tags.exists())
    this.instance_tags.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0600);


  if (this.privateKeyFingerprint() === null)
    this.generatePrivateKey();
}

OTR.prototype = {

  constructor: OTR,
  close: function () libotr.close(),
  
  // generate a private key
  // TODO: maybe move this to a ChromeWorker
  generatePrivateKey: function (account, protocol) {
    let err = libotr.otrl_privkey_generate(
      this.userstate,
      this.private_key.path,
      account || default_account,
      protocol || default_protocol
    );
    if (err)
      throw new OTRError("Returned code: " + err);
  },

  // get my fingerprint
  privateKeyFingerprint: function (account, protocol) {
    let fingerprint = libotr.otrl_privkey_fingerprint(
      this.userstate,
      new libotr.fingerprint_t(),
      account || default_account,
      protocol || default_protocol
    );
    return fingerprint.isNull() ? null : fingerprint.readString();
  }

};