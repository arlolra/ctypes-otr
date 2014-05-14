let EXPORTED_SYMBOLS = ["OTR"];

const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
let consoleService = Cc["@mozilla.org/consoleservice;1"]
                       .getService(Ci.nsIConsoleService);

Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/osfile.jsm");

const CHROME_URI = "chrome://otr/content/";

// load libOTR
Cu.import(CHROME_URI + "libotr.js");
let libotr = new libOTR();

// defaults
const default_account = "default_account";
const default_protocol = "default_protocol";

function setTimeout(fn, delay) {
  timer.initWithCallback({ notify: fn }, delay, Ci.nsITimer.TYPE_ONE_SHOT);
}

function log(msg) {
  consoleService.logStringMessage(msg);
}

function getProtocol(aConv) {
  return aConv.wrappedJSObject._account.protocol.normalizedName;
}

function getAccount(aConv) {
  return aConv.wrappedJSObject._account.normalizedName;
}

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
  this.uiOps = this.initUiOps();
  this.instag = 0;
  this.convos = new Map();
}

OTR.prototype = {

  constructor: OTR,
  close: () => libotr.close(),

  // load stored files from my profile
  loadFiles: function() {
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
  generatePrivateKey: function(account, protocol) {
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
  privateKeyFingerprint: function(account, protocol) {
    let fingerprint = libotr.otrl_privkey_fingerprint(
      this.userstate,
      new libotr.fingerprint_t(),
      account || default_account,
      protocol || default_protocol
    );
    return fingerprint.isNull() ? null : fingerprint.readString();
  },

  // ui callbacks

  policy_cb: function(opdata, context) {
    return libotr.OTRL_POLICY_OPPORTUNISTIC;
  },

  create_privkey_cb: function(opdata, accountname, protocol) {
    log("create_privkey_cb")
  },

  is_logged_in_cb: function(opdata, accountname, protocol, recipient) {
    log("is_logged_in_cb")
  },

  inject_message_cb: function(opdata, accountname, protocol, recipient, message) {
    let aMsg = message.readString();
    log("inject_message_cb: " + aMsg);
    let id = protocol.readString() + ":" + accountname.readString();
    let target = this.convos.get(id);
    target.sendMsg(aMsg);
  },

  update_context_list_cb: function(opdata) {
    log("update_context_list_cb")
  },

  new_fingerprint_cb: function(opdata, us, accountname, protocol, username, fingerprint) {
    log("new_fingerprint_cb")
  },

  write_fingerprint_cb: function(opdata) {
    log("write_fingerprint_cb")
  },

  gone_secure_cb: function(opdata, context) {
    log("gone_secure_cb")
  },

  gone_insecure_cb: function(opdata, context) {
    log("gone_insecure_cb")
  },

  still_secure_cb: function(opdata, context, is_reply) {
    log("still_secure_cb")
  },

  max_message_size_cb: function(opdata, context) {
    return 0;
  },

  account_name_cb: function(opdata, account, protocol) {
    log("account_name_cb")
  },

  account_name_free_cb: function(opdata, account_name) {
    log("account_name_free_cb")
  },

  received_symkey_cb: function(opdata, context, use, usedata, usedatalen, symkey) {
    log("received_symkey_cb")
  },

  otr_error_message_cb: function(opdata, context, err_code) {
    log("otr_error_message_cb")
  },

  otr_error_message_free_cb: function(opdata, err_msg) {
    log("otr_error_message_free_cb")
  },

  resent_msg_prefix_cb: function(opdata, context) {
    log("resent_msg_prefix_cb")
  },

  resent_msg_prefix_free_cb: function(opdata, prefix) {
    log("resent_msg_prefix_free_cb")
  },

  handle_smp_event_cb: function(opdata, smp_event, context, progress_percent, question) {
    log("handle_smp_event_cb")
  },

  handle_msg_event_cb: function(opdata, msg_event, context, message, err) {
    log("msg event: " + msg_event)
  },

  create_instag_cb: function(opdata, accountname, protocol) {
    log("create_instag_cb")
  },

  convert_msg_cb: function(opdata, context, convert_type, dest, src) {
    log("convert_msg_cb")
  },

  convert_free_cb: function(opdata, context, dest) {
    log("convert_free_cb")
  },

  timer_control_cb: function(opdata, interval) {
    log("timer_control_cb")
  },

  // uiOps

  initUiOps: function() {
    let uiOps = new libotr.OtrlMessageAppOps()

    let methods = [
      "policy",
      "create_privkey",
      "is_logged_in",
      "inject_message",
      "update_context_list",
      "new_fingerprint",
      "write_fingerprint",
      "gone_secure",
      "gone_insecure",
      "still_secure",
      "max_message_size",
      "account_name",
      "account_name_free",
      "received_symkey",
      "otr_error_message",
      "otr_error_message_free",
      "resent_msg_prefix",
      "resent_msg_prefix_free",
      "handle_smp_event",
      "handle_msg_event",
      "create_instag",
      "convert_msg",
      "convert_free",
      "timer_control"
    ];

    for (let i = 0; i < methods.length; i++) {
      let m = methods[i];
      // keep a pointer to this in memory to avoid crashing
      this[m + "_cb"] = libotr[m + "_cb_t"](this[m + "_cb"].bind(this));
      uiOps[m] = this[m + "_cb"];
    }

    return uiOps;
  },

  // below implements the transform interface

  addConversation: function(prplIConvIM) {
    prplIConvIM.addTransform(this);
    let protocol = getProtocol(prplIConvIM);
    let account = getAccount(prplIConvIM);
    let id = protocol + ":" + account;
    this.convos.set(id, prplIConvIM);
    if (this.privateKeyFingerprint(account, protocol) === null)
      this.generatePrivateKey(account, protocol);
  },

  removeConversation: function(prplIConvIM) {
    prplIConvIM.removeTransform(this);
    let id = getProtocol(prplIConvIM) + ":" + getAccount(prplIConvIM);
    this.convos.delete(id);
  },

  onSend: function(tMsg, aConv, aCb) {
    let newMessage = new ctypes.char.ptr();

    log("pre sending: " + tMsg.toSend)

    let err = libotr.otrl_message_sending(
      this.userstate,
      this.uiOps.address(),
      null,
      getAccount(aConv),
      getProtocol(aConv),
      aConv.normalizedName,
      this.instag,
      tMsg.toSend,
      null,
      newMessage.address(),
      libotr.fragPolicy.OTRL_FRAGMENT_SEND_SKIP,
      null,
      null,
      null
    );

    if (err)
      throw new OTRError("Returned code: " + err);

    tMsg.toSend = newMessage.isNull() ? "" : newMessage.readString();

    log("post sending: " + tMsg.toSend)

    libotr.otrl_message_free(newMessage);
    aCb.invoke();
  },

  onReceive: function(tMsg, aConv, aCb) {
    let newMessage = new ctypes.char.ptr();

    log("pre receiving: " + tMsg.toSend)

    let res = libotr.otrl_message_receiving(
      this.userstate,
      this.uiOps.address(),
      null,
      getAccount(aConv),
      getProtocol(aConv),
      aConv.normalizedName,
      tMsg.toSend,
      newMessage.address(),
      null,
      null,
      null,
      null
    );

    if (!newMessage.isNull()) {
      tMsg.toSend = newMessage.readString();
      libotr.otrl_message_free(newMessage);
    }

    log(res)

    if (res) {
      tMsg.toSend = "";
    }

    log("post receiving: " + tMsg.toSend)

    aCb.invoke();
  }

};