let EXPORTED_SYMBOLS = ["OTR"];

const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/osfile.jsm");
Cu.import("chrome://otr/content/libotr.js");

let libotr = new libOTR();

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

// some helpers

let cs = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
function log(msg) cs.logStringMessage(msg);

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

// context wrapper

function Context(context) {
  this.context = context;
}

Context.prototype = {
  constructor: Context,
  get id() this.protocol + ":" + this.account,
  get account() this.context.contents.accountname.readString(),
  get protocol() this.context.contents.protocol.readString(),
};

// conversation wrapper

function Conv(conv, observers) {
  this.conv = conv;
  this.observers = observers;
  this._jsObj = conv.wrappedJSObject;
  this._account = this._jsObj._account;
}

Conv.prototype = {
  constructor: Conv,
  get id() this.protocol + ":" + this.account,
  get name() this.conv.normalizedName,
  get account() this._account.normalizedName,
  get protocol() this._account.protocol.normalizedName,
  get sendMsg() this.conv.sendMsg.bind(this.conv),
  get writeMsg() this._jsObj.writeMessage.bind(this._jsObj)
};

// otr constructor

function OTR(opts) {
  opts = opts || {};
  this.setPolicy(opts.requireEncryption);
  this.userstate = libotr.otrl_userstate_create();
  this.privateKeyPath = profilePath("otr.private_key")
  this.fingerprintsPath = profilePath("otr.fingerprints");
  this.instanceTagsPath = profilePath("otr.instance_tags");
  this.uiOps = this.initUiOps();
  this.convos = new Map();
}

OTR.prototype = {

  constructor: OTR,
  close: () => libotr.close(),

  setPolicy: function(requireEncryption) {
    this.policy = requireEncryption
      ? libotr.OTRL_POLICY_ALWAYS
      : libotr.OTRL_POLICY_OPPORTUNISTIC;
  },

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
      this.userstate, this.privateKeyPath, account, protocol
    );
    if (err)
      throw new OTRError("Returned code: " + err);
  },

  // get my fingerprint
  privateKeyFingerprint: function(account, protocol) {
    let fingerprint = libotr.otrl_privkey_fingerprint(
      this.userstate, new libotr.fingerprint_t(), account, protocol
    );
    return fingerprint.isNull() ? null : fingerprint.readString();
  },

  // write fingerprints to file synchronously
  writeFingerprints: function() {
    let err = libotr.otrl_privkey_write_fingerprints(
      this.userstate, this.fingerprintsPath
    );
    if (err)
      throw new OTRError("Returned code: " + err);
  },

  // write fingerprints to file synchronously
  genInstag: function(account, protocol) {
    let err = libotr.otrl_instag_generate(
      this.userstate, this.instanceTagsPath, account, protocol
    );
    if (err)
      throw new OTRError("Returned code: " + err);
  },

  // ui callbacks

  policy_cb: function(opdata, context) {
    return this.policy;
  },

  create_privkey_cb: function(opdata, accountname, protocol) {
    this.generatePrivateKey(accountname.readString(), protocol.readString());
  },

  is_logged_in_cb: function(opdata, accountname, protocol, recipient) {
    log("is_logged_in_cb")
  },

  inject_message_cb: function(opdata, accountname, protocol, recipient, message) {
    let aMsg = message.readString();
    log("inject_message_cb: " + aMsg);
    let id = protocol.readString() + ":" + accountname.readString();
    let conv = this.convos.get(id);
    conv.sendMsg(aMsg);
  },

  update_context_list_cb: function(opdata) {
    log("update_context_list_cb")
  },

  new_fingerprint_cb: function(opdata, us, accountname, protocol, username, fingerprint) {
    log("new_fingerprint_cb")
  },

  write_fingerprint_cb: function(opdata) {
    this.writeFingerprints();
  },

  gone_secure_cb: function(opdata, context) {
    this.sendAlert(context, "gone secure!");
  },

  gone_insecure_cb: function(opdata, context) {
    this.sendAlert(context, "oh no, insecure");
  },

  still_secure_cb: function(opdata, context, is_reply) {
    log("still_secure_cb")
  },

  max_message_size_cb: function(opdata, context) {
    context = new Context(context);
    switch(context.protocol) {
    case "irc":
      return 400;
    default:
      return 0;
    }
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
    switch(msg_event) {
    case libotr.messageEvent.OTRL_MSGEVENT_RCVDMSG_NOT_IN_PRIVATE:
      this.sendAlert(context, "received encrypted message but not currently" +
                              " communicating privately.");
      break
    default:
      log("msg event: " + msg_event)
    }
  },

  create_instag_cb: function(opdata, accountname, protocol) {
    this.genInstag(accountname.readString(), protocol.readString())
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

  sendAlert: function(context, msg) {
    context = new Context(context);
    let conv = this.convos.get(context.id);
    let flags = { system: true, noLog: true, error: false };
    conv.writeMsg("system", msg, flags);
  },

  // below implements the wrapped observer interface

  addConversation: function(prplIConvIM) {
    // add sending observer
    let onSend = this.onSend.bind(this, prplIConvIM);
    prplIConvIM.addObserver(onSend, -999);

    // add receiving observer
    let onReceive = this.onReceive.bind(this, prplIConvIM);
    prplIConvIM.addObserver(onReceive, 999);

    let conv = new Conv(prplIConvIM, [onSend, onReceive]);
    this.convos.set(conv.id, conv);

    // generate a pk if necessary
    if (this.privateKeyFingerprint(conv.account, conv.protocol) === null)
      this.generatePrivateKey(conv.account, conv.protocol);
  },

  removeConversation: function(prplIConvIM) {
    let conv = new Conv(prplIConvIM);
    conv = this.convos.get(conv.id);
    conv.observers.forEach(function(o) {
      prplIConvIM.removeObserver(o);
    });
    this.convos.delete(conv.id);
  },

  onSend: function(aConv, aSubject, aTopic, aData) {
    if (aTopic !== "sending-message")
      return;

    if (aSubject.cancel)
      return;

    let conv = new Conv(aConv);
    let newMessage = new ctypes.char.ptr();
    log("pre sending: " + aSubject.message)

    let err = libotr.otrl_message_sending(
      this.userstate,
      this.uiOps.address(),
      null,
      conv.account,
      conv.protocol,
      conv.name,
      libotr.OTRL_INSTAG_BEST,
      aSubject.message,
      null,
      newMessage.address(),
      libotr.fragPolicy.OTRL_FRAGMENT_SEND_ALL_BUT_LAST,
      null,
      null,
      null
    );

    if (err)
      throw new OTRError("Returned code: " + err);

    if (newMessage.isNull())
      aSubject.cancel = true;  // cancel, but should we ever get here?
    else
      aSubject.message = newMessage.readString();

    log("post sending: " + aSubject.message)
    libotr.otrl_message_free(newMessage);
  },

  onReceive: function(aConv, aSubject, aTopic, aData) {
    if (aTopic !== "receiving-message")
      return;

    if (aSubject.cancel)
      return;

    let conv = new Conv(aConv);
    let newMessage = new ctypes.char.ptr();
    log("pre receiving: " + aSubject.message)

    let res = libotr.otrl_message_receiving(
      this.userstate,
      this.uiOps.address(),
      null,
      conv.account,
      conv.protocol,
      conv.name,
      aSubject.message,
      newMessage.address(),
      null,
      null,
      null,
      null
    );

    if (!newMessage.isNull()) {
      aSubject.originalMessage = newMessage.readString();
      libotr.otrl_message_free(newMessage);
    }

    log(res)

    if (res) {
      aSubject.cancel = true;  // ignore
    }

    log("post receiving: " + aSubject.originalMessage)
  }

};