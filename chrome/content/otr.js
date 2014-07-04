let EXPORTED_SYMBOLS = ["OTR"];

const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/osfile.jsm");
Cu.import("chrome://otr/content/libotr.js");

let libotr = new libOTR();

// some globals
let sending = false;
let sendableMessages = null;
let nextSent = null;

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
  get username() this.context.contents.username.readString(),
  get account() this.context.contents.accountname.readString(),
  get protocol() this.context.contents.protocol.readString(),
  get msgState() this.context.contents.msgstate
};

// conversation wrapper

function Conv(conv) {
  this.conv = conv;
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
  this._observers = [];
  this._buffer = [];
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

  // expose message states
  messageState: libotr.messageState,

  // get the current message state
  getMsgState: function(aConv) {
    let conv = new Conv(aConv);
    let context = libotr.otrl_context_find(
      this.userstate, conv.name, conv.account, conv.protocol,
      libotr.OTRL_INSTAG_BEST, 1, null, null, null
    );
    context = new Context(context);
    return context.msgState;
  },

  disconnect: function(aConv) {
    let conv = new Conv(aConv);
    libotr.otrl_message_disconnect(
      this.userstate,
      this.uiOps.address(),
      null,
      conv.account,
      conv.protocol,
      conv.name,
      libotr.OTRL_INSTAG_BEST
    );
  },

  // uiOps callbacks

  policy_cb: function(opdata, context) {
    return this.policy;
  },

  create_privkey_cb: function(opdata, accountname, protocol) {
    this.generatePrivateKey(accountname.readString(), protocol.readString());
  },

  is_logged_in_cb: function(opdata, accountname, protocol, recipient) {
    // FIXME: ask the ui if this is true
    return 1;
  },

  inject_message_cb: function(opdata, accountname, protocol, recipient, message) {
    let aMsg = message.readString();
    log("inject_message_cb (" + sending + "): " + aMsg);
    if (sending) {
      if (nextSent === null)
        nextSent = aMsg;
      sendableMessages.push(aMsg);
    } else {
      let id = protocol.readString() + ":" + accountname.readString();
      let conv = this.convos.get(id);
      conv.sendMsg(aMsg);
    }
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
    context = new Context(context);
    this.notifyObservers(context, "msg-state");
    this.sendAlert(context, "gone secure!");
  },

  gone_insecure_cb: function(opdata, context) {
    context = new Context(context);
    this.notifyObservers(context, "msg-state");
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
    context = new Context(context);
    switch(msg_event) {
    case libotr.messageEvent.OTRL_MSGEVENT_RCVDMSG_NOT_IN_PRIVATE:
      this.sendAlert(context, "Received encrypted message but not currently" +
                              " communicating privately: " + message.readString());
      break;
    case libotr.messageEvent.OTRL_MSGEVENT_RCVDMSG_UNENCRYPTED:
      this.sendAlert(context, "The following message was received" +
                              " unencrypted: " + message.readString());
      break;
    case libotr.messageEvent.OTRL_MSGEVENT_LOG_HEARTBEAT_RCVD:
      log("Heartbeat received from " + context.username + ".");
      break;
    case libotr.messageEvent.OTRL_MSGEVENT_LOG_HEARTBEAT_SENT:
      log("Heartbeat send to " + context.username + ".");
      break;
    case libotr.messageEvent.OTRL_MSGEVENT_ENCRYPTION_REQUIRED:
      log("Encryption required")
      break;
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
    let conv = this.convos.get(context.id);
    let flags = { system: true, noLog: true, error: false };
    conv.writeMsg("system", msg, flags);
  },

  observe: function(aObject, aTopic, aMsg) {
    switch(aTopic) {
    case "sending-message":
      this.onSend(aObject);
      break;
    case "received-message":
      this.onReceive(aObject);
      break;
    case "conversation-loaded":
      let binding = aObject.ownerDocument.getBindingParent(aObject);
      let uiConv = binding._conv;
      let aConv = uiConv.target;
      let conv = new Conv(aConv);
      if (!this.convos.get(conv.id)) {
        this.convos.set(conv.id, conv);
        uiConv.addObserver(this, "sending-message");
        uiConv.addObserver(this, "received-message");
        // generate a pk if necessary
        if (this.privateKeyFingerprint(conv.account, conv.protocol) === null)
          this.generatePrivateKey(conv.account, conv.protocol);
      }
      break;
    }
  },

  removeConversation: function(uiConv) {
    uiConv.removeObserver(this, "sending-message");
    uiConv.removeObserver(this, "received-message");
    let conv = new Conv(uiConv.target);
    this.convos.delete(conv.id);
  },

  onSend: function(om) {
    if (om.cancelled || om.system)
      return;

    let conv = new Conv(om.target);
    log("pre sending: " + om.originalMessage)

    let newMessage = new ctypes.char.ptr();
    sending = true;
    sendableMessages = [];

    let sms = om.getSendableMessages();

    for (let msg of sms) {
      nextSent = null;
      let err = libotr.otrl_message_sending(
        this.userstate,
        this.uiOps.address(),
        null,
        conv.account,
        conv.protocol,
        conv.name,
        libotr.OTRL_INSTAG_BEST,
        msg,
        null,
        newMessage.address(),
        libotr.fragPolicy.OTRL_FRAGMENT_SEND_ALL,
        null,
        null,
        null
      );
      if (err)
        throw new OTRError("Returned code: " + err);
      if (nextSent === null)
        throw new OTRError("Hmmmmm")
      this.bufferMsg(om.target, msg, nextSent);
      nextSent = null;
    }

    om.setSendableMessages(sendableMessages.length, sendableMessages);

    for (let m of sendableMessages)
      log("post sending: " + m)

    sendableMessages = null;
    sending = false;
    libotr.otrl_message_free(newMessage);
  },

  onReceive: function(im) {
    if (im.cancelled || im.system)
      return;

    if (im.outgoing) {
      log("displaying message: " + im.decodedMessage)
      this.pluckMsg(im);
      return;
    }

    let conv = new Conv(im.conversation);
    let newMessage = new ctypes.char.ptr();
    log("pre receiving: " + im.decodedMessage)

    let res = libotr.otrl_message_receiving(
      this.userstate,
      this.uiOps.address(),
      null,
      conv.account,
      conv.protocol,
      conv.name,
      im.decodedMessage,
      newMessage.address(),
      null,
      null,
      null,
      null
    );

    if (!newMessage.isNull()) {
      im.decodedMessage = newMessage.readString();
    }

    if (res) {
      log(res)
      im.cancelled = true;  // ignore
    }

    log("post receiving: " + im.decodedMessage)
    libotr.otrl_message_free(newMessage);
  },

  // observer interface

  addObserver: function(aObserver) {
    if (this._observers.indexOf(aObserver) == -1)
      this._observers.push(aObserver);
  },

  removeObserver: function(aObserver) {
    this._observers = this._observers.filter(function(o) o !== aObserver);
  },

  notifyObservers: function(aSubject, aTopic, aData) {
    for each (let observer in this._observers) {
      observer.observe(aSubject, aTopic, aData);
    }
  },

  // buffer messages

  bufferMsg: function(conv, disp, sent) {
    this._buffer.push({
      conv: conv,
      disp: disp,
      sent: sent
    });
  },

  // set a timer for unplucked msgs
  pluckMsg: function(im) {
    let buf = this._buffer;
    for (let i = 0; i < buf.length; i++) {
      let b = buf[i];
      if (b.conv === im.conversation && b.sent === im.decodedMessage) {
        im.decodedMessage = b.disp;
        buf.splice(i, 1);
        return;
      }
    }
    // don't display if it wasn't buffered
    im.cancelled = true;
  }

};