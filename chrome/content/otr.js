var isNode = (typeof process === "object");
var isJpm = !isNode && (typeof require === "function");
var isIb = !isNode && !isJpm;

var libC, libOTR, ctypes, OS, workerPath;

if (isNode) {
  ctypes = require("ctypes");
  // FIXME: This isn't implemented upstream yet.
  ctypes.size_t = ctypes.unsigned_int;
  ({ libC } = require("./libc.js"));
  ({ libOTR } = require("./libotr.js"));
  var path = require("path");
} else {
  var Ci, Cu, Cc, XPCOMUtils, l10nHelper;
  if (isJpm) {
    ({ Ci, Cu, Cc } = require("chrome"));
    ({ libC } = require("./libc.js"));
    ({ libOTR } = require("./libotr.js"));
    ({ XPCOMUtils, l10nHelper } = require("../../imXPCOMUtils.js"));
    workerPath = "resource://addon/chrome/content/worker.js";
  } else {
    ({ interfaces: Ci, utils: Cu, classes: Cc } = Components);
    Cu.import("chrome://otr/content/libc.js");
    Cu.import("chrome://otr/content/libotr.js");
    workerPath = "chrome://otr/content/worker.js";
    Cu.import("resource:///modules/imServices.jsm");
    Cu.import("resource:///modules/imXPCOMUtils.jsm");
  }
  Cu.import("resource://gre/modules/PromiseWorker.jsm");
  Cu.import("resource://gre/modules/ctypes.jsm");
  Cu.import("resource://gre/modules/osfile.jsm");
  XPCOMUtils.defineLazyGetter(this, "_", () =>
    l10nHelper("chrome://otr/locale/otr.properties")
  );
}


// some helpers

function setInterval(fn, delay) {
  let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  timer.init(fn, delay, Ci.nsITimer.TYPE_REPEATING_SLACK);
  return timer;
}

function clearInterval(timer) {
  timer.cancel();
}

function profilePath(filename) {
  return isNode ?
    path.resolve(__dirname, filename) :
    OS.Path.join(OS.Constants.Path.profileDir, filename);
}

// See: https://developer.mozilla.org/en-US/docs/Mozilla/js-ctypes/Using_js-ctypes/Working_with_data#Determining_if_two_pointers_are_equal
function comparePointers(p, q) {
  p = ctypes.cast(p, ctypes.uintptr_t).value.toString();
  q = ctypes.cast(q, ctypes.uintptr_t).value.toString();
  return p === q;
}

function trustFingerprint(fingerprint) {
  return (!fingerprint.isNull() &&
    !fingerprint.contents.trust.isNull() &&
    fingerprint.contents.trust.readString().length > 0);
}

function isOnline(conv) {
  let ret = -1;
  if (conv.buddy)
    ret = conv.buddy.online ? 1 : 0;
  else if (["irc", "twitter"].indexOf(conv.account.protocol.normalizedName) > -1)
    ret = 1;  // no presence, but we want to send the disconnect msg
  return ret;
}

// Use the protocol name in user facing strings. See trac #16490
var names;
function protocolName(aNormalizedName) {
  if (!names) {
    names = new Map();
    let protocols = Services.core.getProtocols();
    while (protocols.hasMoreElements()) {
      let protocol = protocols.getNext();
      names.set(protocol.normalizedName, protocol.name);
    }
  }
  return names.get(aNormalizedName) || aNormalizedName;
}


// libotr context wrapper

function Context(context) {
  this._context = context;
}

Context.prototype = {
  constructor: Context,
  get username() { return this._context.contents.username.readString(); },
  get account() { return this._context.contents.accountname.readString(); },
  get protocol() { return this._context.contents.protocol.readString(); },
  get msgstate() { return this._context.contents.msgstate; },
  get fingerprint() { return this._context.contents.active_fingerprint; },
  get trust() { return trustFingerprint(this.fingerprint); },
};


// otr module

var otr = {

  hasRan: false,
  once: function() {
    libOTR.init();
    this.initUiOps();
    this.hasRan = true;
  },

  privateKeyPath: profilePath("otr.private_key"),
  fingerprintsPath: profilePath("otr.fingerprints"),
  instanceTagsPath: profilePath("otr.instance_tags"),

  init: function(opts) {
    opts = opts || {};

    if (!this.hasRan)
      this.once();

    this.verifyNudge = !!opts.verifyNudge;
    this.setPolicy(opts.requireEncryption);
    this.userstate = libOTR.otrl_userstate_create();

    if (isIb)
      this.registerCommands();

    // A map of UIConvs, keyed on the target.id
    this._convos = new Map();
    this._observers = [];
    this._buffer = [];
    this._poll_timer = null;

    // Async sending may fail in the transport protocols, so periodically
    // drop old messages from the internal buffer. Should be rare.
    const pluck_time = 1 * 60 * 1000;
    this._pluck_timer = setInterval(function() {
      let buf = this._buffer;
      for (let i = 0; i < buf.length;) {
        if ((Date.now() - buf[i].time) > pluck_time) {
          this.log("dropping an old message: " + buf[i].display);
          buf.splice(i, 1);
        } else {
          i += 1;
        }
      }
    }.bind(this), pluck_time);
  },

  close: function() {
    if (this._poll_timer) {
      clearInterval(this._poll_timer);
      this._poll_timer = null;
    }
    if (this._pluck_timer) {
      clearInterval(this._pluck_timer);
      this._pluck_timer = null;
    }
    this._buffer = null;
    this.unregisterCommands();
  },

  log: function(msg) {
    this.notifyObservers(msg, "otr:log");
  },

  protocolName: protocolName,

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

  commands: [],

  registerCommands: function() {
    this.commands.forEach(function(cmd) {
      cmd.priority = Ci.imICommand.CMD_PRIORITY_HIGH;
      cmd.usageContext = Ci.imICommand.CMD_CONTEXT_ALL;
      cmd.QueryInterface = XPCOMUtils.generateQI([Ci.imICommand]);
      // don't replace the former command by specifying a protocol id
      Services.cmd.registerCommand(cmd);
    });
  },

  unregisterCommands: function() {
    this.commands.forEach(cmd => Services.cmd.unregisterCommand(cmd.name));
  },

  // generate a private key in a worker
  generatePrivateKey: function(account, protocol) {
    let newkey = new ctypes.void_t.ptr();
    let err = libOTR.otrl_privkey_generate_start(
      otr.userstate, account, protocol, newkey.address()
    );
    if (err || newkey.isNull())
      return Promise.reject("otrl_privkey_generate_start (" + err + ")");
    let worker = new BasePromiseWorker(workerPath);
    return worker.post("generateKey", [
      libOTR.path, libOTR.otrl_version, newkey.toSource()
    ]).then(function() {
      let err = libOTR.otrl_privkey_generate_finish(
        otr.userstate, newkey, otr.privateKeyPath
      );
      if (err)
        throw new Error("otrl_privkey_generate_calculate (" + err + ")");
    }).catch(function(err) {
      if (!newkey.isNull())
        libOTR.otrl_privkey_generate_cancelled(otr.userstate, newkey);
      throw err;
    });
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

  // get my raw fingerprint
  privateKeyFingerprintRaw: function(account, protocol) {
    let hash = libOTR.otrl_privkey_fingerprint_raw(
      this.userstate, new libOTR.hash_t(), account, protocol);
    if (hash.isNull())
      throw Error("No fingerprint found.");
    return hash;
  },

  // return a human readable string for a fingerprint
  hashToHuman: function(fingerprint) {
    let hash = fingerprint.contents.fingerprint;
    if (hash.isNull())
      throw Error("No fingerprint found.");
    let human = new libOTR.fingerprint_t();
    libOTR.otrl_privkey_hash_to_human(human, hash);
    return human.readString();
  },

  base64encode: function(data, dataLen) {
    // CData objects are initialized with zeroes.  The plus one gives us
    // our null byte so that readString below is safe.
    let buf = ctypes.char.array(Math.floor((dataLen+2)/3)*4 + 1)();
    let size = libOTR.otrl_base64_encode(buf, data, dataLen);
    return buf.readString();  // str
  },

  base64decode: function(str) {
    let size = str.length;
    // +1 here so that we're safe in calling readString on data in the tests.
    let data = ctypes.unsigned_char.array(Math.floor((size+3)/4)*3 + 1)();
    let dataLen = libOTR.otrl_base64_decode(data, str, size);
    // We aren't returning the dataLen since we know the hash length in our
    // one use case so far.
    return data;
  },

  getTrustLevel: function(context) {
    let best_level = otr.trustState.TRUST_NOT_PRIVATE;
    let level = otr.trust(context);
    if (level === otr.trustState.TRUST_PRIVATE) {
      best_level = otr.trustState.TRUST_PRIVATE;
    } else if (level === otr.trustState.TRUST_UNVERIFIED
        && best_level !== otr.trustState.TRUST_PRIVATE) {
      best_level = otr.trustState.TRUST_UNVERIFIED;
    } else if (level === otr.trustState.TRUST_FINISHED
        && best_level === otr.trustState.TRUST_NOT_PRIVATE) {
      best_level = otr.trustState.TRUST_FINISHED;
    }
    return best_level;
  },

  getStatus: function(level) {
    switch(level) {
    case otr.trustState.TRUST_NOT_PRIVATE:
      return _("trust.not_private");
    case otr.trustState.TRUST_UNVERIFIED:
      return _("trust.unverified");
    case otr.trustState.TRUST_PRIVATE:
      return _("trust.private");
    case otr.trustState.TRUST_FINISHED:
      return _("trust.finished");
    }
  },

  // get list of known fingerprints
  knownFingerprints: function() {
    let fps = [];
    for (
      let context = this.userstate.contents.context_root;
      !context.isNull();
      context = context.contents.next
    ) {
      // skip child contexts
      if (!comparePointers(context.contents.m_context, context))
        continue;
      let wContext = new Context(context);
      for (
        let fingerprint = context.contents.fingerprint_root.next;
        !fingerprint.isNull();
        fingerprint = fingerprint.contents.next
      ) {
        let trust = trustFingerprint(fingerprint);
        let used = false;
        let best_level = otr.trustState.TRUST_NOT_PRIVATE;
        for (
          let context_itr = context;
          !context_itr.isNull() &&
            comparePointers(context_itr.contents.m_context, context);
          context_itr = context_itr.contents.next
        ) {
          if (comparePointers(
            context_itr.contents.active_fingerprint, fingerprint
          )) {
            used = true;
            best_level = otr.getTrustLevel(new Context(context_itr));
          }
        }
        fps.push({
          fpointer: fingerprint.contents.address(),
          fingerprint: otr.hashToHuman(fingerprint),
          screenname: wContext.username,
          account: wContext.account,
          protocol: wContext.protocol,
          trust: trust,
          status: used ? otr.getStatus(best_level) : _("trust.unused"),
          purge: false,
        });
      }
    }
    return fps;
  },

  forgetFingerprints(fps) {
    let write = false;
    fps.forEach(function(obj, i) {
      if (!obj.purge)
        return;
      else
        obj.purge = false;  // reset early
      let fingerprint = obj.fpointer;
      if (fingerprint.isNull())
        return;
      // don't do anything if fp is active and we're in an encrypted state
      let context = fingerprint.contents.context.contents.m_context;
      for (
        let context_itr = context;
        !context_itr.isNull() &&
          comparePointers(context_itr.contents.m_context, context);
        context_itr = context_itr.contents.next
      ) {
        if (
          context_itr.contents.msgstate === otr.messageState.OTRL_MSGSTATE_ENCRYPTED &&
          comparePointers(context_itr.contents.active_fingerprint, fingerprint)
        ) return;
      }
      write = true;
      libOTR.otrl_context_forget_fingerprint(fingerprint, 1);
      fps[i] = null;  // null out removed fps
    });
    if (write)
      otr.writeFingerprints();
  },

  addFingerprint: function(context, hex) {
    let fingerprint = new libOTR.hash_t();
    if (hex.length != 40) throw new Error("Invalid fingerprint value.");
    let bytes = hex.match(/.{1,2}/g);
    for (let i = 0; i < 20; i++)
      fingerprint[i] = parseInt(bytes[i], 16);
    return libOTR.otrl_context_find_fingerprint(context._context, fingerprint, 1, null);
  },

  getFingerprintsForRecipient: function(account, protocol, recipient) {
    let fingers = otr.knownFingerprints();
    return fingers.filter(function(fg) {
      return fg.account == account &&
             fg.protocol == protocol &&
             fg.screenname == recipient;
    });
  },

  isFingerprintTrusted: function(fingerprint) {
    return !!libOTR.otrl_context_is_fingerprint_trusted(fingerprint);
  },

  // update trust in fingerprint
  setTrust: function(fingerprint, trust, context) {
    // ignore if no change in trust
    if (context && (trust === context.trust))
      return;
    libOTR.otrl_context_set_trust(fingerprint, trust ? "verified" : "");
    this.writeFingerprints();
    if (context)
      this.notifyTrust(context);
  },

  notifyTrust: function(context) {
    this.notifyObservers(context, "otr:msg-state");
    this.notifyObservers(context, "otr:trust-state");
  },

  authUpdate: function(context, progress, success) {
    this.notifyObservers({
      context: context,
      progress: progress,
      success: success,
    }, "otr:auth-update");
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

  getContextFromRecipient(account, protocol, recipient) {
    let context = libOTR.otrl_context_find(
      this.userstate, recipient, account, protocol,
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

  getUIConvFromConv: function(conv) {
    // Maybe prefer Services.conversations.getUIConversation(conv);
    return this._convos.get(conv.id);
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
    if (remove) {
      let uiConv = this.getUIConvFromConv(conv);
      if (uiConv)
        this.removeConversation(uiConv);
    } else
      this.notifyObservers(this.getContext(conv), "otr:disconnected");
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
    queryMsg += _("query.msg", conv.account.normalizedName);
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
    let args = {
      account: accountname.readString(),
      protocol: protocol.readString(),
    };
    this.notifyObservers(args, "otr:generate");
  },

  // Report whether you think the given user is online. Return 1 if you think
  // they are, 0 if you think they aren't, -1 if you're not sure.
  is_logged_in_cb: function(opdata, accountname, protocol, recipient) {
    let conv = this.getUIConvForRecipient(
      accountname.readString(),
      protocol.readString(),
      recipient.readString()
    ).target;
    return isOnline(conv);
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
      us, username, accountname, protocol,
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

    // Only nudge on new fingerprint, as opposed to always.
    if (!this.verifyNudge)
      this.notifyObservers(new Context(context), "otr:unverified",
        (seen ? "seen" : "unseen"));
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
    this.sendAlert(context, _(str, context.username));
    if (this.verifyNudge && !context.trust)
      this.notifyObservers(context, "otr:unverified", "unseen");
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
      this.sendAlert(context, _("context.still_secure", context.username));
    }
  },

  // Find the maximum message size supported by this protocol.
  max_message_size_cb: function(opdata, context) {
    context = new Context(context);
    // These values are, for the most part, from pidgin-otr's mms_table.
    switch(context.protocol) {
    case "irc":
    case "prpl-irc":
      return 417;
    case "facebook":
    case "gtalk":
    case "odnoklassniki":
    case "jabber":
    case "xmpp":
      return 65536;
    case "prpl-yahoo":
      return 799;
    case "prpl-msn":
      return 1409;
    case "prpl-icq":
      return 2346;
    case "prpl-gg":
      return 1999;
    case "prpl-aim":
    case "prpl-oscar":
      return 2343;
    case "prpl-novell":
      return 1792;
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
      msg = _("error.enc");
      break;
    case libOTR.errorCode.OTRL_ERRCODE_MSG_NOT_IN_PRIVATE:
      msg = _("error.not_priv", context.username);
      break;
    case libOTR.errorCode.OTRL_ERRCODE_MSG_UNREADABLE:
      msg = _("error.unreadable");
      break;
    case libOTR.errorCode.OTRL_ERRCODE_MSG_MALFORMED:
      msg = _("error.malformed");
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
    return libC.strdup(_("resent"));
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
      /* falls through */
    case libOTR.smpEvent.OTRL_SMPEVENT_IN_PROGRESS:
    case libOTR.smpEvent.OTRL_SMPEVENT_SUCCESS:
    case libOTR.smpEvent.OTRL_SMPEVENT_FAILURE:
    case libOTR.smpEvent.OTRL_SMPEVENT_ABORT:
      this.authUpdate(context, progress_percent,
        (smp_event === libOTR.smpEvent.OTRL_SMPEVENT_SUCCESS));
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
      this.sendAlert(context, _("msgevent.encryption_required_part1", context.username));
      this.sendAlert(context, _("msgevent.encryption_required_part2"));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_ENCRYPTION_ERROR:
      this.sendAlert(context, _("msgevent.encryption_error"));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_CONNECTION_ENDED:
      this.sendAlert(context, _("msgevent.connection_ended", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_SETUP_ERROR:
      this.sendAlert(context, _("msgevent.setup_error", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_MSG_REFLECTED:
      this.sendAlert(context, _("msgevent.msg_reflected"));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_MSG_RESENT:
      this.sendAlert(context, _("msgevent.msg_resent", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_NOT_IN_PRIVATE:
      this.sendAlert(context, _("msgevent.rcvdmsg_not_private", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_UNREADABLE:
      this.sendAlert(context, _("msgevent.rcvdmsg_unreadable", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_MALFORMED:
      this.sendAlert(context, _("msgevent.rcvdmsg_malformed", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_LOG_HEARTBEAT_RCVD:
      this.log(_("msgevent.log_heartbeat_rcvd", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_LOG_HEARTBEAT_SENT:
      this.log(_("msgevent.log_heartbeat_sent", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_GENERAL_ERR:
      this.sendAlert(context, _("msgevent.rcvdmsg_general_err"));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_UNENCRYPTED:
      this.sendAlert(context, _("msgevent.rcvdmsg_unecrypted", context.username, message.isNull() ? "" : message.readString()));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_UNRECOGNIZED:
      this.sendAlert(context, _("msgevent.rcvdmsg_unrecognized", context.username));
      break;
    case libOTR.messageEvent.OTRL_MSGEVENT_RCVDMSG_FOR_OTHER_INSTANCE:
      this.log(_("msgevent.rcvdmsg_for_other_instance", context.username));
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
      this.addConversation(aObject);
      break;
    }
  },

  addConversation: function(uiConv) {
    let conv = uiConv.target;
    if (conv.isChat)
      return;
    this._convos.set(conv.id, uiConv);
    uiConv.addObserver(this);
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
    if (conv.isChat)
      return;

    // check for irc action messages
    if (om.action) {
      om.cancelled = true;
      let uiConv = this.getUIConvFromConv(conv);
      if (uiConv)
        uiConv.sendMsg("/me " + om.message);
      return;
    }

    let newMessage = new ctypes.char.ptr();

    this.log("pre sending: " + om.message);

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
      // If contact is offline, don't append whitespace tags.
      // See: https://bugs.otr.im/issues/102
      if (isOnline(conv) === 0 ||
          // Twitter trims tweets.
          conv.account.protocol.normalizedName === "twitter") {
        let ind = msg.indexOf(libOTR.OTRL_MESSAGE_TAG_BASE);
        if (ind > -1) {
          msg = msg.substring(0, ind);
          let context = this.getContext(conv);
          context._context.contents.otr_offer = libOTR.otr_offer.OFFER_NOT;
        }
      }

      this.bufferMsg(conv.id, om.message, msg);
      om.message = msg;
    }

    this.log("post sending (" + !om.cancelled + "): " + om.message);
    libOTR.otrl_message_free(newMessage);
  },

  onReceive: function(im) {
    if (im.cancelled || im.system)
      return;

    let conv = im.conversation;
    if (conv.isChat)
      return;

    if (im.outgoing) {
      this.log("outgoing message to display: " + im.displayMessage);
      this.pluckMsg(im);
      return;
    }

    let newMessage = new ctypes.char.ptr();
    let tlvs = new libOTR.OtrlTLV.ptr();

    this.log("pre receiving: " + im.displayMessage);

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
      this.notifyObservers(context, "otr:disconnected");
      this.sendAlert(context, _("tlv.disconnected", conv.normalizedName));
    }

    if (res) {
      this.log("error (" + res + ") ignoring: " + im.displayMessage);
      im.cancelled = true;  // ignore
    } else {
      this.log("post receiving: " + im.displayMessage);
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
    this._observers = this._observers.filter(o => o !== aObserver);
  },

  notifyObservers: function(aSubject, aTopic, aData) {
    for (let observer of this._observers) {
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
      sent: sent,
      time: Date.now()
    });
  },

  pluckMsg: function(im) {
    let buf = this._buffer;
    for (let i = 0; i < buf.length; i++) {
      let b = buf[i];
      if (b.convId === im.conversation.id && b.sent === im.displayMessage) {
        im.displayMessage = b.display;
        buf.splice(i, 1);
        this.log("displaying: " + b.display);
        return;
      }
    }
    // don't display if it wasn't buffered
    im.cancelled = true;
    this.log("not displaying: " + im.displayMessage);
  }

};


// exports

if (isNode) {
  module.exports = otr;
} else if (isJpm) {
  exports.otr = otr;
} else {
  this.EXPORTED_SYMBOLS = ["otr"];
}
