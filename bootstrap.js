const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imWindows.jsm");

const authDialog = "chrome://otr/content/auth.xul";
const authVerify = "otr-auth-unverified";

let bundle = Services.strings.createBundle("chrome://otr/locale/ui.properties");

function trans(name) {
  let args = Array.prototype.slice.call(arguments, 1);
  return args.length > 0
    ? bundle.formatStringFromName(name, args, args.length)
    : bundle.GetStringFromName(name);
}

let trustMap;
function setTrustMap() {
  trustMap = new Map([
    [otr.trustState.TRUST_NOT_PRIVATE, {
      trustLabel: trans("trust.not_private"),
      alertState: trans("state.not_private"),
      startLabel: trans("start.label"),
      authLabel: trans("auth.label"),
      disableStart: false,
      disableEnd: true,
      disableAuth: true,
      class: "not_private"
    }],
    [otr.trustState.TRUST_UNVERIFIED, {
      trustLabel: trans("trust.unverified"),
      alertState: trans("state.unverified"),
      startLabel: trans("refresh.label"),
      authLabel: trans("auth.label"),
      disableStart: false,
      disableEnd: false,
      class: "unverified"
    }],
    [otr.trustState.TRUST_PRIVATE, {
      trustLabel: trans("trust.private"),
      alertState: trans("state.private"),
      startLabel: trans("refresh.label"),
      authLabel: trans("reauth.label"),
      disableStart: false,
      disableEnd: false,
      disableAuth: false,
      class: "private"
    }],
    [otr.trustState.TRUST_FINISHED, {
      trustLabel: trans("trust.finished"),
      alertState: trans("state.finished"),
      startLabel: trans("start.label"),
      authLabel: trans("auth.label"),
      disableStart: false,
      disableEnd: false,
      disableAuth: true,
      class: "finished"
    }]
  ]);
}

let windowRefs = new Map();

let ui = {

  debug: false,
  log: function log(msg) {
    if (!ui.debug)
      return;
    let csl = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
    csl.logStringMessage(msg);
  },

  prefs: null,
  origAddConv: null,

  setPrefs: function() {
    let branch = "extensions.otr.";
    let prefs = {
      "requireEncryption": true
    };
    let defaults = Services.prefs.getDefaultBranch(branch);
    Object.keys(prefs).forEach(function(key) {
      defaults.setBoolPref(key, prefs[key]);
    });
    ui.prefs = Services.prefs.getBranch(branch);
  },

  init: function() {
    setTrustMap();
    this.setPrefs();
    otr.init({
      requireEncryption: ui.prefs.getBoolPref("requireEncryption")
    });
    otr.addObserver(ui);
    otr.loadFiles().then(function() {
      Services.obs.addObserver(otr, "new-ui-conversation", false);
      Services.obs.addObserver(ui, "conversation-loaded", false);
      Services.obs.addObserver(ui, "conversation-closed", false);
      Services.obs.addObserver(ui, "prpl-quit", false);
      ui.prefs.addObserver("", ui, false);
    }).catch(function(err) { throw err; });
  },

  disconnect: function(aConv) {
    if (aConv)
      return otr.disconnect(aConv, true);
    let conversations = Services.conversations.getConversations();
    while (conversations.hasMoreElements()) {
      let conv = conversations.getNext();
      if (conv.isChat)
        return;
      otr.disconnect(conv, true);
    }
  },

  changePref: function(aMsg) {
    switch(aMsg) {
    case "requireEncryption":
      otr.setPolicy(ui.prefs.getBoolPref("requireEncryption"));
      break;
    default:
      ui.log(aMsg);
    }
  },

  openAuth: function(window, target, name, mode, uiConv, aObject) {
    target.disabled = true;
    let win = window.openDialog(
      authDialog,
      "auth=" + name,
      "centerscreen,resizable=no,minimizable=no",
      mode,
      uiConv,
      aObject
    );
    windowRefs.set(name, win);
    win.addEventListener("beforeunload", function() {
      target.disabled = false;
      windowRefs.delete(name);
    });
  },

  closeAuth: function(context) {
    let win = windowRefs.get(context.username);
    if (win)
      win.close();
  },

  addButton: function(aObject) {
    let binding = aObject.ownerDocument.getBindingParent(aObject);
    let uiConv = binding._conv;
    let conv = uiConv.target;
    if (conv.isChat)
      return;

    let cti = binding.getElt("conv-top-info");
    let doc = cti.ownerDocument;
    let window = doc.defaultView;

    let otrStart = doc.createElement("menuitem");
    otrStart.classList.add("otr-start");
    otrStart.addEventListener("click", function(e) {
      e.preventDefault();
      if (!e.target.disabled) {
        let context = otr.getContext(conv);
        if (context.msgstate === otr.messageState.OTRL_MSGSTATE_ENCRYPTED)
          uiConv.systemMessage(trans("alert.refresh", conv.normalizedName));
        otr.sendQueryMsg(conv);
      }
    });

    let otrEnd = doc.createElement("menuitem");
    otrEnd.setAttribute("label", trans("end.label"));
    otrEnd.classList.add("otr-end");
    otrEnd.addEventListener("click", function(e) {
      e.preventDefault();
      if (!e.target.disabled) {
        let context = otr.getContext(conv);
        ui.closeAuth(context);
        otr.disconnect(conv, false);
        uiConv.systemMessage(trans("alert.gone_insecure", conv.normalizedName));
      }
    });

    let otrAuth = doc.createElement("menuitem");
    otrAuth.classList.add("otr-auth");
    otrAuth.addEventListener("click", function(e) {
      e.preventDefault();
      let target = e.target;
      if (!target.disabled) {
        ui.openAuth(window, target, conv.normalizedName, "start", uiConv);
      }
    });

    let otrMenu = doc.createElement("menupopup");
    otrMenu.appendChild(otrStart);
    otrMenu.appendChild(otrEnd);
    otrMenu.appendChild(otrAuth);

    let otrButton = doc.createElement("toolbarbutton");
    otrButton.classList.add("otr-button");
    otrButton.addEventListener("command", function(e) {
      e.preventDefault();
      otrMenu.openPopup(otrButton, "after_start");
    }, false);

    otrButton.appendChild(otrMenu);
    cti.appendChild(otrButton);

    // get otr msg state
    let context = otr.getContext(conv);
    ui.setMsgState(context, otrButton, otrStart, otrEnd, otrAuth);

    let trust = ui.getTrustSettings(context);
    uiConv.systemMessage(trust.alertState);
  },

  updateButton: function(context) {
    let cti, uiConv = otr.getUIConvFromContext(context);
    if (!Conversations._conversations.some(function(binding) {
      if (binding._conv.id !== uiConv.id)
        return false;
      cti = binding.getElt("conv-top-info");
      return true;
    })) return;
    let otrButton = cti.querySelector(".otr-button");
    let otrStart = cti.querySelector(".otr-start");
    let otrEnd = cti.querySelector(".otr-end");
    let otrAuth = cti.querySelector(".otr-auth");
    ui.setMsgState(context, otrButton, otrStart, otrEnd, otrAuth);
  },

  alertTrust: function(context) {
    let uiConv = otr.getUIConvFromContext(context);
    let trust = ui.getTrustSettings(context);
    uiConv.systemMessage(trans("afterauth." + trust.class, context.username));
  },

  getTrustSettings: function(context) {
    return trustMap.get(otr.trust(context));
  },

  // set msg state on toolbar button
  setMsgState: function(context, otrButton, otrStart, otrEnd, otrAuth) {
    let trust = ui.getTrustSettings(context);
    otrButton.setAttribute("tooltiptext", trust.trustLabel);
    otrButton.className = "otr-button" + " otr-" + trust.class;
    otrStart.setAttribute("label", trust.startLabel);
    otrStart.setAttribute("disabled", trust.disableStart);
    otrEnd.setAttribute("disabled", trust.disableEnd);
    otrAuth.setAttribute("label", trust.authLabel);
    otrAuth.setAttribute("disabled", trust.disableAuth);
  },

  askAuth: function(aObject) {
    let cti, uiConv = otr.getUIConvFromContext(aObject.context);
    if (!Conversations._conversations.some(function(binding) {
      if (binding._conv.id !== uiConv.id)
        return false;
      cti = binding.getElt("conv-top-info");
      return true;
    })) return;
    let window = cti.ownerDocument.defaultView;
    let otrAuth = cti.querySelector(".otr-auth");
    let name = uiConv.target.normalizedName;
    ui.openAuth(window, otrAuth, name, "ask", uiConv, aObject);
  },

  closeVerify: function(context) {
    let cti, notification, uiConv = otr.getUIConvFromContext(context);
    if (!Conversations._conversations.some(function(binding) {
      if (binding._conv.id !== uiConv.id)
        return false;
      cti = binding.getElt("conv-top-info");
      notification = binding.getElt("convNotificationBox")
                            .getNotificationWithValue(authVerify);
      return true;
    })) return;

    if (notification)
      notification.close();
  },

  notifyBox: function(context, seen) {
    let cti, notification, uiConv = otr.getUIConvFromContext(context);
    if (!Conversations._conversations.some(function(binding) {
      if (binding._conv.id !== uiConv.id)
        return false;
      cti = binding.getElt("conv-top-info");
      notification = binding.getElt("convNotificationBox");
      return true;
    })) return;

    if (notification.getNotificationWithValue(authVerify))
      return;

    let window = cti.ownerDocument.defaultView;
    let otrAuth = cti.querySelector(".otr-auth");

    let msg = trans("finger." + seen, context.username);
    let buttons = [{
      label: trans("finger.verify"),
      callback: function() {
        let name = uiConv.target.normalizedName;
        ui.openAuth(window, otrAuth, name, "start", uiConv);
        return false;
      }
    }];

    let priority = notification.PRIORITY_WARNING_HIGH;
    notification.appendNotification(msg, authVerify, null, priority, buttons, null);
  },

  observe: function(aObject, aTopic, aMsg) {
    switch(aTopic) {
    case "nsPref:changed":
      ui.changePref(aMsg);
      break;
    case "conversation-loaded":
      ui.addButton(aObject);
      break;
    case "conversation-closed":
      ui.closeAuth(otr.getContext(aObject));
      // fall through
    case "prpl-quit":
      ui.disconnect(aTopic === "prpl-quit" ? null : aObject);
      break;
    case "otr:disconnected":
      ui.closeAuth(aObject);
      ui.closeVerify(aObject);
      // fall through
    case "otr:msg-state":
      ui.updateButton(aObject);
      break;
    case "otr:new-unverified":
      ui.notifyBox(aObject, aMsg);
      break;
    case "otr:trust-state":
      ui.alertTrust(aObject);
      break;
    case "otr:auth-ask":
      ui.askAuth(aObject);
      break;
    case "otr:log":
      ui.log("otr: " + aObject);
      break;
    }
  },

  resetConv: function(binding) {
    otr.removeConversation(binding._conv);
    let cti = binding.getElt("conv-top-info");
    let otrButton = cti.querySelector(".otr-button");
    if (!otrButton)
      return;
    otrButton.parentNode.removeChild(otrButton);
  },

  destroy: function() {
    Services.obs.removeObserver(otr, "new-ui-conversation");
    Services.obs.removeObserver(ui, "conversation-loaded");
    Services.obs.removeObserver(ui, "conversation-closed");
    Services.obs.removeObserver(ui, "prpl-quit");
    Conversations._conversations.forEach(ui.resetConv);
    ui.prefs.removeObserver("", ui);
    otr.removeObserver(ui);
    otr.close();
  }

};

function startup(data, reason) {
  Cu.import("chrome://otr/content/otr.js");
  let sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
  let ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  let uri = ios.newURI("chrome://otr/skin/otr.css", null, null);
  sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
  ui.init()
}

function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN)
    return;
  ui.destroy();
  Cu.unload("chrome://otr/content/otr.js");
}

function install(data, reason) {}
function uninstall(data, reason) {}