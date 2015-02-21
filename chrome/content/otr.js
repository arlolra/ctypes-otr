let EXPORTED_SYMBOLS = ["otr"];

const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/osfile.jsm");
Cu.import("chrome://otr/content/libotr.js");

const privDialog = "chrome://otr/content/priv.xul";

// some helpers

function setInterval(fn, delay) {
  let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  timer.init(fn, delay, Ci.nsITimer.TYPE_REPEATING_SLACK);
  return timer;
}

function clearInterval(timer) {
  timer.cancel();
}

let bundle = Services.strings.createBundle("chrome://otr/locale/otr.properties");

function trans(name) {
  let args = Array.prototype.slice.call(arguments, 1);
  return args.length > 0
    ? bundle.formatStringFromName(name, args, args.length)
    : bundle.GetStringFromName(name);
}

function profilePath(filename) {
  return OS.Path.join(OS.Constants.Path.profileDir, filename);
}

// libotr context wrapper

function Context(context) {
  this._context = context;
}

Context.prototype = {
  constructor: Context,
  get username() this._context.contents.username.readString(),
  get account() this._context.contents.accountname.readString(),
  get protocol() this._context.contents.protocol.readString(),
  get msgstate() this._context.contents.msgstate,
  get fingerprint() this._context.contents.active_fingerprint,
  get fingerprint_hash() this.fingerprint.contents.fingerprint,
  get trust() {
    return (!this.fingerprint.isNull() &&
      !this.fingerprint.contents.trust.isNull() &&
      this.fingerprint.contents.trust.readString().length > 0);
  }
};

// otr module

let otr = {

  init: function(opts) {
    opts = opts || {};

    libOTR.init();
    this.setPolicy(opts.requireEncryption);
    this.initUiOps();
    this.userstate = libOTR.otrl_userstate_create();

    // A map of UIConvs, keyed on the target.id
    this._convos = new Map();
    this._observers = [];
    this._buffer = [];
    this._poll_timer = null;
  },

  privateKeyPath: profilePath("otr.private_key"),
  fingerprintsPath: profilePath("otr.fingerprints"),
  instanceTagsPath: profilePath("otr.instance_tags"),

  close: () => {
    libOTR.close();
    libC.close();
  },

  log: function(msg) {
    this.notifyObservers(msg, "otr:log");
  },

  setPolicy: function(requireEncryption) {
    this.policy = requireEncryption
      ? libOTR.OTRL_POLICY_ALWAYS
      : libOTR.OTRL_POLICY_OPPORTUNISTIC;
  },

  // load stored files from my profile
  loadFiles: function() {
    return Promise.all([
      OS.File.exists(this.privateKeyPath).then((exists) => {
        if (exists && libOTR.otrl_privkey_read(
          this.userstate, this.privateKeyPath
        )) throw new Error("Failed to read private keys.");
      }),
      OS.File.exists(this.fingerprintsPath).then((exists) => {
        if (exists && libOTR.otrl_privkey_read_fingerprints(
          this.userstate, this.fingerprintsPath, null, null
        )) throw new Error("Failed to read fingerprints.");
      }),
      OS.File.exists(this.instanceTagsPath).then((exists) => {
        if (exists && libOTR.otrl_instag_read(
          this.userstate, this.instanceTagsPath
        )) throw new Error("Failed to read instance tags.");
      })
    ]);
  },

  // generate a private key
  generatePrivateKey: function(account, protocol) {
    let features = "modal,centerscreen,resizable=no,minimizable=no";
    let args = {
      account: account,
      protocol: protocol
    };
    args.wrappedJSObject = args;
    Services.ww.openWindow(null, privDialog, trans("priv.label"), features, args);
  },
  _generatePrivateKey: function(account, protocol) {
    if (libOTR.otrl_privkey_generate(
      this.userstate, this.privateKeyPath, account, protocol
    )) throw new Error("Failed to generate private key.");
  },

  // write fingerprints to file synchronously
  writeFingerprints: function() {
    if (libOTR.otrl_privkey_write_fingerprints(
      this.userstate, this.fingerprintsPath
    )) throw new Error("Failed to write fingerprints.");
  },

  // generate instance tag synchronously
  generateInstanceTag: function(account, protocol) {
    if (libOTR.otrl_instag_generate(
      this.userstate, this.instanceTagsPath, account, protocol
    )) throw new Error("Failed to generate instance tag.");
  },

  // get my fingerprint
  privateKeyFingerprint: function(account, protocol) {
    let fingerprint = libOTR.otrl_privkey_fingerprint(
      this.userstate, new libOTR.fingerprint_t(), account, protocol
    );
    return fingerprint.isNull() ? null : fingerprint.readString();
  },

  // return a human readable string of their active fingerprint
  hashToHuman: function(context) {
    let hash = context.fingerprint_hash;
    if (hash.isNull())
      throw Error("No fingerprint found.");
    let fingerprint = new libOTR.fingerprint_t();
    libOTR.otrl_privkey_hash_to_human(fingerprint, hash);
    return fingerprint.readString();
  },

  // update trust in fingerprint
  setTrust: function(context, trust) {
    if (trust === context.trust)
      return;  // ignore if no change in trust
    libOTR.otrl_context_set_trust(context.fingerprint, trust ? "verified" : "");
    this.writeFingerprints();
    this.notifyTrust(context);
  },

  notifyTrust: function(context) {
    this.notifyObservers(context, "otr:msg-state");
    this.notifyObservers(context, "otr:trust-state");
  },

  // expose message states
  messageState: libOTR.messageState,

  // get context from conv
  getContext: function(conv) {
    let context = libOTR.otrl_context_find(
      this.userstate,
      conv.normalizedName,
      conv.account.normalizedName,
      conv.account.protocol.normalizedName,
      libOTR.instag.OTRL_INSTAG_BEST, 1, null, null, null
    );
    return new Context(context);
  },

  getUIConvFromContext: function(context) {
    return this.getUIConvForRecipient(
      context.account, context.protocol, context.username
    );
  },

  getUIConvForRecipient: function(account, protocol, recipient) {
    let uiConvs = this._convos.values();
    let uiConv = uiConvs.next();
    while (!uiConv.done) {
      let conv = uiConv.value.target;
      if (conv.account.normalizedName === account &&
          conv.account.protocol.normalizedName === protocol &&
          conv.normalizedName === recipient)
        return uiConv.value;
      uiConv = uiConvs.next();
    }
    throw new Error("Couldn't find conversation.");
  },

  disconnect: function(conv, remove) {
    libOTR.otrl_message_disconnect(
      this.userstate,
      this.uiOps.address(),
      null,
      conv.account.normalizedName,
      conv.account.protocol.normalizedName,
      conv.normalizedName,
      libOTR.instag.OTRL_INSTAG_BEST
    );
    if (remove)
      this.removeConversation(Services.conversations.getUIConversation(conv));
    else
      this.notifyObservers(this.getContext(conv), "otr:msg-state");
  },

  sendQueryMsg: function(conv) {
    let query = libOTR.otrl_proto_default_query_msg(
      conv.account.normalizedName,
      this.policy
    );
    if (query.isNull()) {
      Cu.reportError(new Error("Sending query message failed."));
      return;
    }
    // Use the default msg to format the version.
    // We don't supprt v1 of the protocol so this should be fine.
    var queryMsg = /^\?OTR.*?\?/.exec(query.readString())[0] + "\n";
    queryMsg += trans("query.msg", conv.account.normalizedName);
    conv.sendMsg(queryMsg);
    libOTR.otrl_message_free(query);
  },

  trustState: {
    TRUST_NOT_PRIVATE: 0,
    TRUST_UNVERIFIED: 1,
    TRUST_PRIVATE: 2,
    TRUST_FINISHED: 3
  },

  trust: function(context) {
    let level = this.trustState.TRUST_NOT_PRIVATE;
    switch(context.msgstate) {
    case this.messageState.OTRL_MSGSTATE_ENCRYPTED:
      level = context.trust
        ? this.trustState.TRUST_PRIVATE
        : this.trustState.TRUST_UNVERIFIED;
      break;
    case this.messageState.OTRL_MSGSTATE_FINISHED:
      level = this.trustState.TRUST_FINISHED;
      break;
    }
    return level;
  },

  // uiOps callbacks

  // Return the OTR policy for the given context.
  policy_cb: function(opdata, context) {
    return this.policy;
  },

  // Create a private key for the given accountname/protocol if desired.
  create_privkey_cb: function(opdata, accountname, protocol) {
    this.generatePrivateKey(accountname.readString(), protocol.readString());
  },

  // Report whether you think the given user is online. Return 1 if you think
  // they are, 0 if you think they aren't, -1 if you're not sure.
  is_logged_in_cb: function(opdata, accountname, protocol, recipient) {
    let conv = this.getUIConvForRecipient(
      accountname.readString(),
      protocol.readString(),
      recipient.readString()
    ).target;
    let ret = -1;
    if (conv.buddy)
      ret = conv.buddy.online ? 1 : 0;
    else if (protocol.readString() === "irc")
      ret = 1;  // no presence in irc, but we want to send the disconnect msg
    return ret;
  },

  // Send the given IM to the given recipient from the given
  // accountname/protocol.
  inject_message_cb: function(opdata, accountname, protocol, recipient, message) {
    let aMsg = message.readString();
    this.log("inject_message_cb (msglen:" + aMsg.length + "): " + aMsg);
    this.getUIConvForRecipient(
      accountname.readString(),
      protocol.readString(),
      recipient.readString()
    ).target.sendMsg(aMsg);
  },

  // A new fingerprint for the given user has been received.
  new_fingerprint_cb: function(opdata, us, accountname, protocol, username, fingerprint) {
    let context = libOTR.otrl_context_find(
      this.userstate,
      username.readString(),
      accountname.readString(),
      protocol.readString(),
      libOTR.instag.OTRL_INSTAG_MASTER, 1, null, null, null
    );

    let seen = false;
    let fp = context.contents.fingerprint_root.next;
    while (!fp.isNull()) {
      if (libC.memcmp(fingerprint, fp.contents.fingerprint, new ctypes.size_t(20))) {
        seen = true;
        break;
      }
      fp = fp.contents.next;
    }

    this.notifyObservers(
      new Context(context),
      "otr:new-unverified",
      (seen ? "seen" : "unseen")
    );
  },

  // The list of known fingerprints has changed.  Write them to disk.
  write_fingerprint_cb: function(opdata) {
    this.writeFingerprints();
  },

  // A ConnContext has entered a secure state.
  gone_secure_cb: function(opdata, context) {
    context = new Context(context);
    let str = "context.gone_secure_" + (context.trust ? "private" : "unverified");
    this.notifyObservers(context, "otr:msg-state");
    this.sendAlert(context, trans(str, context.username));
  },

  // A ConnContext has left a secure state.
  gone_insecure_cb: function(opdata, context) {
    // This isn't used. See: https://bugs.otr.im/issues/48
  },

  // We have completed an authentication, using the D-H keys we already knew.
  // is_reply indicates whether we initiated the AKE.
  still_secure_cb: function(opdata, context, is_reply) {
    // Indicate the private conversation was refreshed.
    if (!is_reply) {
      context = new Context(context);
      this.notifyObservers(context, "otr:msg-state");
      this.sendAlert(context, trans("context.still_secure", context.username));
    }
  },

  // Find the maximum message size supported by this protocol.
  max_message_size_cb: function(opdata, context) {
    // TODO: we can do better here.
    context = new Context(context);
    switch(context.protocol) {
    case "irc":
      return 400;
    default:
      return 0;
    }
  },

  // We received a request from the buddy to use the current "extra" symmetric
  // key.
  received_symkey_cb: function(opdata, context, use, usedata, usedatalen, symkey) {
    // Ignore until we have a use.
  },

  // Return a string according to the error event.
  otr_error_message_cb: function(opdata, context, err_code) {
    context = new Context(context);
    let msg;
    switch(err_code) {
    case libOTR.errorCode.OTRL_ERRCODE_ENCRYPTION_ERROR:
      msg = trans("error.enc");
      break;
    case libOTR.errorCode.OTRL_ERRCODE_MSG_NOT_IN_PRIVATE:
      msg = trans("error.not_priv", context.username);
      break;
    case libOTR.errorCode.OTRL_ERRCODE_MSG_UNREADABLE:
      msg = trans("error.unreadable");
      break;
    case libOTR.errorCode.OTRL_ERRCODE_MSG_MALFORMED:
      msg = trans("error.malformed");
      break;
    default:
      return null;
    }
    return libC.strdup(msg);
  },

  // Deallocate a string returned by otr_error_message_cb.
  otr_error_message_free_cb: function(opdata, err_msg) {
    if (!err_msg.isNull())
      libC.free(err_msg);
  },

  // Return a string that will be prefixed to any resent message.
  resent_msg_prefix_cb: function(opdata, context) {
    return libC.strdup(trans("resent"));
  },

  // Deallocate a string returned by resent_msg_prefix.
  resent_msg_prefix_free_cb: function(opdata, prefix) {
    if (!prefix.isNull())
      libC.free(prefix);
  },

  // Update the authentication UI with respect to SMP events.
  handle_smp_event_cb: function(opdata, smp_event, context, progress_percent, question) {
    context = new Context(context);
    switch(smp_event) {
    case libOTR.smpEvent.OTRL_SMPEVENT_NONE:
      break;
    case libOTR.smpEvent.OTRL_SMPEVENT_ASK_FOR_ANSWER:
    case libOTR.smpEvent.OTRL_SMPEVENT_ASK_FOR_SECRET:
      this.notifyObservers({
        context: context,
        progress: progress_percent,
        question: question.isNull() ? null : question.readString()
      }, "otr:auth-ask");
      break;
    case libOTR.smpEvent.OTRL_SMPEVENT_CHEATED:
      otr.abortSMP(context);
      // fall through
    case libOTR.smpEvent.OTRL_SMPEVENT_IN_PROGRESS:
    case libOTR.smpEvent.OTRL_SMPEVENT_SUCCESS:
    case libOTR.smpEvent.OTRL_SMPEVENT_FAILURE:
    case libOTR.smpEvent.OTRL_SMPEVENT_ABORT:
      this.notifyObservers({
        context: context,
        progress: progress_percent,
        success: (smp_event === libOTR.smpEvent.OTRL_SMPEVENT_SUCCESS)
      }, "otr:auth-update");
      break;
    case libOTR.smpEvent.OTRL_SMPEVENT_ERROR:
      otr.abortSMP(context);
      break;
    default:
      this.log("smp event: " + smp_event);
    }
  },

  // Handle and send the appropriate message(s) to the sender/recipient
  // depending on the message events.
  handle_msg_event_cb: function(opdata, msg_event, context, message, err) {
    context = new Context(context);
    switch(msg_event) {
    case libOTR.messageEvent.OTRL_MSGEVENT_NONE:
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_ENCRYPTION_REQUIRED:
      this.sendAlert(context, trans("msgevent.encryption_required_part1", context.username));
      this.sendAlert(context, trans("msgevent.encryption_required_part2"));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_ENCRYPTION_ERROR:
      this.sendAlert(context, trans("msgevent.encryption_error"));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_CONNECTION_ENDED:
      this.sendAlert(context, trans("msgevent.connection_ended", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_SETUP_ERROR:
      this.sendAlert(context, trans("msgevent.setup_error"));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_MSG_REFLECTED:
      this.sendAlert(context, trans("msgevent.msg_reflected"));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_MSG_RESENT:
      this.sendAlert(context, trans("msgevent.msg_resent"));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_NOT_IN_PRIVATE:
      this.sendAlert(context, trans("msgevent.rcvdmsg_not_private", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_UNREADABLE:
      this.sendAlert(context, trans("msgevent.rcvdmsg_unreadable", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_MALFORMED:
      this.sendAlert(context, trans("msgevent.rcvdmsg_malformed", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_LOG_HEARTBEAT_RCVD:
      this.log(trans("msgevent.log_heartbeat_rcvd", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_LOG_HEARTBEAT_SENT:
      this.log(trans("msgevent.log_heartbeat_sent", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_GENERAL_ERR:
      this.sendAlert(context, trans("msgevent.rcvdmsg_general_err", message.isNull() ? "" : message.readString()));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_UNENCRYPTED:
      this.sendAlert(context, trans("msgevent.rcvdmsg_unecrypted", context.username, message.isNull() ? "" : message.readString()));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_UNRECOGNIZED:
      this.sendAlert(context, trans("msgevent.rcvdmsg_unrecognized", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_FOR_OTHER_INSTANCE:
      this.log(trans("msgevent.rcvdmsg_for_other_instance", context.username));
      break;
    default:
      this.log("msg event: " + msg_event);
    }
  },

  // Create an instance tag for the given accountname/protocol if desired.
  create_instag_cb: function(opdata, accountname, protocol) {
    this.generateInstanceTag(accountname.readString(), protocol.readString());
  },

  // When timer_control is called, turn off any existing periodic timer.
  // Additionally, if interval > 0, set a new periodic timer to go off every
  // interval seconds.
  timer_control_cb: function(opdata, interval) {
    if (this._poll_timer) {
      clearInterval(this._poll_timer);
      this._poll_timer = null;
    }
    if (interval > 0) {
      this._poll_timer = setInterval(function() {
        libOTR.otrl_message_poll(this.userstate, this.uiOps.address(), null);
      }.bind(this), interval * 1000);
    }
  },

  // uiOps

  initUiOps: function() {
    this.uiOps = new libOTR.OtrlMessageAppOps();

    let methods = [
      "policy",
      "create_privkey",
      "is_logged_in",
      "inject_message",
      "update_context_list",  // not implemented
      "new_fingerprint",
      "write_fingerprint",
      "gone_secure",
      "gone_insecure",
      "still_secure",
      "max_message_size",
      "account_name",  // not implemented
      "account_name_free",  // not implemented
      "received_symkey",
      "otr_error_message",
      "otr_error_message_free",
      "resent_msg_prefix",
      "resent_msg_prefix_free",
      "handle_smp_event",
      "handle_msg_event",
      "create_instag",
      "convert_msg",  // not implemented
      "convert_free",  // not implemented
      "timer_control"
    ];

    for (let i = 0; i < methods.length; i++) {
      let m = methods[i];
      if (!this[m + "_cb"]) {
        this.uiOps[m] = null;
        continue;
      }
      // keep a pointer to this in memory to avoid crashing
      this[m + "_cb"] = libOTR[m + "_cb_t"](this[m + "_cb"].bind(this));
      this.uiOps[m] = this[m + "_cb"];
    }
  },

  sendAlert: function(context, msg) {
    this.getUIConvFromContext(context).systemMessage(msg);
  },

  observe: function(aObject, aTopic, aMsg) {
    switch(aTopic) {
    case "sending-message":
      this.onSend(aObject);
      break;
    case "received-message":
      this.onReceive(aObject);
      break;
    case "new-ui-conversation":
      let conv = aObject.target;
      if (conv.isChat)
        return;
      this._convos.set(conv.id, aObject);
      aObject.addObserver(this);
      break;
    }
  },

  removeConversation: function(uiConv) {
    uiConv.removeObserver(this);
    this._convos.delete(uiConv.target.id);
    this.clearMsgs(uiConv.target.id);
  },

  sendSecret: function(context, secret, question) {
    let str = ctypes.char.array()(secret);
    let strlen = new ctypes.size_t(str.length - 1);
    libOTR.otrl_message_initiate_smp_q(
      this.userstate,
      this.uiOps.address(),
      null,
      context._context,
      question ? question : null,
      str,
      strlen
    );
  },

  sendResponse: function(context, response) {
    let str = ctypes.char.array()(response);
    let strlen = new ctypes.size_t(str.length - 1);
    libOTR.otrl_message_respond_smp(
      this.userstate,
      this.uiOps.address(),
      null,
      context._context,
      str,
      strlen
    );
  },

  abortSMP: function(context) {
    libOTR.otrl_message_abort_smp(
      this.userstate,
      this.uiOps.address(),
      null,
      context._context
    );
  },

  onSend: function(om) {
    if (om.cancelled)
      return;

    let conv = om.conversation;
    let newMessage = new ctypes.char.ptr();

    this.log("pre sending: " + om.message)

    let err = libOTR.otrl_message_sending(
      this.userstate,
      this.uiOps.address(),
      null,
      conv.account.normalizedName,
      conv.account.protocol.normalizedName,
      conv.normalizedName,
      libOTR.instag.OTRL_INSTAG_BEST,
      om.message,
      null,
      newMessage.address(),
      libOTR.fragPolicy.OTRL_FRAGMENT_SEND_ALL_BUT_LAST,
      null,
      null,
      null
    );

    let msg = om.message;

    if (err) {
      om.cancelled = true;
      Cu.reportError(new Error("Failed to send message. Returned code: " + err));
    } else if (!newMessage.isNull()) {
      msg = newMessage.readString();
      // https://bugs.otr.im/issues/52
      if (!msg) {
        om.cancelled = true;
      }
    }

    if (!om.cancelled) {
      this.bufferMsg(conv.id, om.message, msg);
      om.message = msg;
    }

    this.log("post sending (" + !om.cancelled + "): " + om.message);
    libOTR.otrl_message_free(newMessage);
  },

  onReceive: function(im) {
    if (im.cancelled || im.system)
      return;

    if (im.outgoing) {
      this.log("outgoing message to display: " + im.displayMessage)
      this.pluckMsg(im);
      return;
    }

    let conv = im.conversation;
    let newMessage = new ctypes.char.ptr();
    let tlvs = new libOTR.OtrlTLV.ptr();

    this.log("pre receiving: " + im.displayMessage)

    let res = libOTR.otrl_message_receiving(
      this.userstate,
      this.uiOps.address(),
      null,
      conv.account.normalizedName,
      conv.account.protocol.normalizedName,
      conv.normalizedName,
      im.displayMessage,
      newMessage.address(),
      tlvs.address(),
      null,
      null,
      null
    );

    if (!newMessage.isNull()) {
      im.displayMessage = newMessage.readString();
    }

    // search tlvs for a disconnect msg
    // https://bugs.otr.im/issues/54
    let tlv = libOTR.otrl_tlv_find(tlvs, libOTR.tlvs.OTRL_TLV_DISCONNECTED);
    if (!tlv.isNull()) {
      let context = this.getContext(conv);
      this.notifyObservers(context, "otr:msg-state");
      this.sendAlert(context, trans("tlv.disconnected", conv.normalizedName));
    }

    if (res) {
      this.log("error (" + res + ") ignoring: " + im.displayMessage)
      im.cancelled = true;  // ignore
    } else {
      this.log("post receiving: " + im.displayMessage)
    }

    libOTR.otrl_tlv_free(tlvs);
    libOTR.otrl_message_free(newMessage);
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

  clearMsgs: function(convId) {
    this._buffer = this._buffer.filter((msg) => msg.convId !== convId);
  },

  bufferMsg: function(convId, display, sent) {
    this._buffer.push({
      convId: convId,
      display: display,
      sent: sent
    });
  },

  // FIXME: set a timer for unplucked msgs
  pluckMsg: function(im) {
    let buf = this._buffer;
    for (let i = 0; i < buf.length; i++) {
      let b = buf[i];
      if (b.convId === im.conversation.id && b.sent === im.displayMessage) {
        im.displayMessage = b.display;
        buf.splice(i, 1);
        this.log("displaying: " + b.display)
        return;
      }
    }
    // don't display if it wasn't buffered
    im.cancelled = true;
    this.log("not displaying: " + im.displayMessage)
  }

};