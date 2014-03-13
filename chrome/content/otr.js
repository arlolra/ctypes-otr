let EXPORTED_SYMBOLS = ["OTR"];

const { interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/osfile.jsm");

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

function ensureFileExists(path) {
  return OS.File.exists(path).then(exists => {
    if (!exists)
      return OS.File.open(path, { create: true }).then(file => {
        return file.close()
      });
  });
}

function profilePath(filename) {
  return OS.Path.join(OS.Constants.Path.profileDir, filename);
}

function OTR() {
  this.userstate = libotr.otrl_userstate_create();
  this.privateKeyPath = profilePath("otr.private_key")
  this.fingerprintsPath = profilePath("otr.fingerprints");
  this.instanceTagsPath = profilePath("otr.instance_tags");
}

OTR.prototype = {

  constructor: OTR,
  close: () => libotr.close(),

  // load stored files from my profile
  loadFiles: function () {
    return ensureFileExists(this.privateKeyPath).then(() => {
      let err = libotr.otrl_privkey_read(this.userstate, this.privateKeyPath);
      if (err)
        throw new OTRError("Returned code: " + err);
    }).then(() => ensureFileExists(this.fingerprintsPath)).then(() => {
      let err = libotr.otrl_privkey_read_fingerprints(
        this.userstate, this.fingerprintsPath, null, null
      );
      if (err)
        throw new OTRError("Returned code: " + err);
    }).then(() => ensureFileExists(this.instanceTagsPath));
  },
  
  // generate a private key
  // TODO: maybe move this to a ChromeWorker
  generatePrivateKey: function (account, protocol) {
    let err = libotr.otrl_privkey_generate(
      this.userstate,
      this.privateKeyPath,
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