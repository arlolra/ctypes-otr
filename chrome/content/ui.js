this.EXPORTED_SYMBOLS = ["ui"];

var { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/imWindows.jsm");
Cu.import("chrome://otr/content/otr.js");
Cu.import("chrome://otr/content/coniks/coniks.js");

var privDialog = "chrome://otr/content/priv.xul";
var authDialog = "chrome://otr/content/auth.xul";
var prefsDialog = "chrome://otr/content/prefs.xul";
var addFingerDialog = "chrome://otr/content/addfinger.xul";

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://otr/locale/ui.properties")
);

var authVerify = "otr-auth-unverified";

var authLabelMap = new Map([
  ["otr:auth-error", _("auth.error")],
  ["otr:auth-success", _("auth.success")],
  ["otr:auth-successThem", _("auth.successThem")],
  ["otr:auth-fail", _("auth.fail")],
  ["otr:auth-waiting", _("auth.waiting")],
]);

var trustMap = new Map([
  [otr.trustState.TRUST_NOT_PRIVATE, {
    startLabel: _("start.label"),
    authLabel: _("auth.label"),
    disableStart: false,
    disableEnd: true,
    disableAuth: true,
    class: "not_private",
  }],
  [otr.trustState.TRUST_UNVERIFIED, {
    startLabel: _("refresh.label"),
    authLabel: _("auth.label"),
    disableStart: false,
    disableEnd: false,
    disableAuth: false,
    class: "unverified",
  }],
  [otr.trustState.TRUST_PRIVATE, {
    startLabel: _("refresh.label"),
    authLabel: _("reauth.label"),
    disableStart: false,
    disableEnd: false,
    disableAuth: false,
    class: "private",
  }],
  [otr.trustState.TRUST_FINISHED, {
    startLabel: _("start.label"),
    authLabel: _("auth.label"),
    disableStart: false,
    disableEnd: false,
    disableAuth: true,
    class: "finished",
  }],
]);

var windowRefs = new Map();

var ui = {

  debug: false,
  log: function log(msg) {
    if (!ui.debug)
      return;
    let csl = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
    csl.logStringMessage(msg);
  },

  prefs: null,
  setPrefs: function() {
    let branch = "extensions.otr.";
    let prefs = {
      requireEncryption: true,
      verifyNudge: true
    };
    let defaults = Services.prefs.getDefaultBranch(branch);
    Object.keys(prefs).forEach(function(key) {
      defaults.setBoolPref(key, prefs[key]);
    });
    ui.prefs = Services.prefs.getBranch(branch);
  },

  addMenuObserver: function() {
    let iter = Services.ww.getWindowEnumerator();
    while (iter.hasMoreElements())
      ui.addMenus(iter.getNext());
    Services.obs.addObserver(ui, "domwindowopened", false);
  },

  removeMenuObserver: function() {
    let iter = Services.ww.getWindowEnumerator();
    while (iter.hasMoreElements())
      ui.removeMenus(iter.getNext());
    Services.obs.removeObserver(ui, "domwindowopened");
  },

  addMenus: function(win) {
    let doc = win.document;
    // Account for unready windows
    if (doc.readyState !== "complete") {
      let listen = function() {
        win.removeEventListener("load", listen);
        ui.addMenus(win);
      };
      win.addEventListener("load", listen);
      return;
    }
    ui.addPrefMenu(doc);
    ui.addBuddyContextMenu(doc);
  },

  removeMenus: function(win) {
    let doc = win.document;
    ui.removePrefMenu(doc);
    ui.removeBuddyContextMenu(doc);
  },

  addPrefMenu: function(doc) {
    let toolsMenuPopup = doc.getElementById("toolsMenuPopup");
    if (!toolsMenuPopup)
      return;  // Not the tools menu
    let sep = doc.createElement("menuseparator");
    sep.setAttribute("id", "otrsep");
    let menuitem = doc.createElement("menuitem");
    menuitem.setAttribute("label", _("prefs.label"));
    menuitem.setAttribute("id", "otrpref");
    menuitem.addEventListener("command", function(e) {
      e.preventDefault();
      let features = "chrome,centerscreen,dialog=no,resizable=no,minimizable=no";
      Services.ww.openWindow(null, prefsDialog, "otrPrefs", features, null);
    });
    toolsMenuPopup.appendChild(sep);
    toolsMenuPopup.appendChild(menuitem);
  },

  removePrefMenu: function(doc) {
    let s = doc.getElementById("otrsep");
    if (s)
      s.parentNode.removeChild(s);
    let p = doc.getElementById("otrpref");
    if (p)
      p.parentNode.removeChild(p);
  },

  addBuddyContextMenu: function(doc) {
    let buddyContextMenu = doc.getElementById("buddyListContextMenu");
    if (!buddyContextMenu)
      return;  // Not the buddy list context menu
    let sep = doc.createElement("menuseparator");
    sep.setAttribute("id", "otrsep");
    let menuitem = doc.createElement("menuitem");
    menuitem.setAttribute("label", _("buddycontextmenu.label"));
    menuitem.setAttribute("id", "otrcont");
    menuitem.addEventListener("command", function() {
      let target = buddyContextMenu.triggerNode;
      if (target.localName == "contact") {
        let contact = target.contact;
        let args = ui.contactWrapper(contact);
        args.wrappedJSObject = args;
        let features = "chrome,modal,centerscreen,resizable=no,minimizable=no";
        Services.ww.openWindow(null, addFingerDialog, "", features, args);
      }
    });
    buddyContextMenu.addEventListener("popupshowing", function(e) {
      let target = e.target.triggerNode;
      if (target.localName == "contact") {
        menuitem.hidden = false;
        sep.hidden = false;
      } else {
        menuitem.hidden = true;
        sep.hidden = true;
      }
    }, false);
    buddyContextMenu.appendChild(sep);
    buddyContextMenu.appendChild(menuitem);
  },

  removeBuddyContextMenu: function(doc) {
    let s = doc.getElementById("otrsep");
    if (s)
      s.parentNode.removeChild(s);
    let p = doc.getElementById("otrcont");
    if (p)
      p.parentNode.removeChild(p);
  },

  init: function() {
    ui.setPrefs();
    otr.init({
      requireEncryption: ui.prefs.getBoolPref("requireEncryption"),
      verifyNudge: ui.prefs.getBoolPref("verifyNudge")
    });
    otr.addObserver(ui);
    otr.loadFiles().then(function() {
      Services.obs.addObserver(otr, "new-ui-conversation", false);
      // Disabled until #76 is resolved.
      // Services.obs.addObserver(ui, "contact-added", false);
      Services.obs.addObserver(ui, "account-added", false);
      Services.obs.addObserver(ui, "account-removed", false);
      Services.obs.addObserver(ui, "conversation-loaded", false);
      Services.obs.addObserver(ui, "conversation-closed", false);
      Services.obs.addObserver(ui, "prpl-quit", false);
      ui.prefs.addObserver("", ui, false);
      Conversations._conversations.forEach(ui.initConv);
      ui.addMenuObserver();
      return coniks.init();
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
    case "verifyNudge":
      otr.verifyNudge = ui.prefs.getBoolPref("verifyNudge");
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

  addButton: function(binding) {
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
        uiConv.systemMessage(_("alert." + (
          context.msgstate === otr.messageState.OTRL_MSGSTATE_ENCRYPTED ?
          "refresh" : "start"
        ), conv.normalizedName));
        otr.sendQueryMsg(conv);
      }
    });

    let otrEnd = doc.createElement("menuitem");
    otrEnd.setAttribute("label", _("end.label"));
    otrEnd.classList.add("otr-end");
    otrEnd.addEventListener("click", function(e) {
      e.preventDefault();
      if (!e.target.disabled) {
        otr.disconnect(conv, false);
        uiConv.systemMessage(_("alert.gone_insecure", conv.normalizedName));
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

    let otrPrefs = doc.createElement("menuitem");
    otrPrefs.classList.add("otr-prefs");
    otrPrefs.setAttribute("label", _("prefs.label"));
    otrPrefs.addEventListener("click", function(e) {
      e.preventDefault();
      let features = "chrome,centerscreen,dialog=no,resizable=no,minimizable=no";
      let args = {
        account: conv.account.normalizedName,
        protocol: conv.account.protocol.normalizedName,
      };
      args.wrappedJSObject = args;
      Services.ww.openWindow(null, prefsDialog, "otrPrefs", features, args);
    });

    let otrMenu = doc.createElement("menupopup");
    otrMenu.appendChild(otrStart);
    otrMenu.appendChild(otrEnd);
    otrMenu.appendChild(otrAuth);
    otrMenu.appendChild(doc.createElement("menuseparator"));
    otrMenu.appendChild(otrPrefs);

    let otrButton = doc.createElement("toolbarbutton");
    otrButton.classList.add("otr-button");
    otrButton.addEventListener("command", function(e) {
      e.preventDefault();
      otrMenu.openPopup(otrButton, "after_start");
    });

    otrButton.appendChild(otrMenu);
    cti.appendChild(otrButton);

    // get otr msg state
    let context = otr.getContext(conv);
    ui.setMsgState(context, otrButton, otrStart, otrEnd, otrAuth);

    let trust = ui.getTrustSettings(context);
    uiConv.systemMessage(_("state." + trust.class, context.username));
  },

  getConvElements: function(context) {
    let cti, box, uiConv = otr.getUIConvFromContext(context);
    if (Conversations._conversations.some(function(binding) {
      if (binding._conv.id !== uiConv.id)
        return false;
      cti = binding.getElt("conv-top-info");
      box = binding.getElt("convNotificationBox");
      return true;
    }))
      return { cti: cti, box: box, uiConv: uiConv };
    else
      return null;
  },

  updateButton: function(context) {
    let els = ui.getConvElements(context);
    if (!els) return;
    let { cti, box, uiConv } = els;

    let otrButton = cti.querySelector(".otr-button");
    let otrStart = cti.querySelector(".otr-start");
    let otrEnd = cti.querySelector(".otr-end");
    let otrAuth = cti.querySelector(".otr-auth");
    ui.setMsgState(context, otrButton, otrStart, otrEnd, otrAuth);
  },

  alertTrust: function(context) {
    let uiConv = otr.getUIConvFromContext(context);
    let trust = ui.getTrustSettings(context);
    uiConv.systemMessage(_("afterauth." + trust.class, context.username));
  },

  getTrustSettings: function(context) {
    return trustMap.get(otr.trust(context));
  },

  // set msg state on toolbar button
  setMsgState: function(context, otrButton, otrStart, otrEnd, otrAuth) {
    let trust = ui.getTrustSettings(context);
    otrButton.setAttribute("tooltiptext", _("state." + trust.class, context.username));
    otrButton.className = "otr-button" + " otr-" + trust.class;
    otrStart.setAttribute("label", trust.startLabel);
    otrStart.setAttribute("disabled", trust.disableStart);
    otrEnd.setAttribute("disabled", trust.disableEnd);
    otrAuth.setAttribute("label", trust.authLabel);
    otrAuth.setAttribute("disabled", trust.disableAuth);
  },

  askAuth: function(aObject) {
    let els = ui.getConvElements(aObject.context);
    if (!els) return;
    let { cti, box, uiConv } = els;

    let window = cti.ownerDocument.defaultView;
    let otrAuth = cti.querySelector(".otr-auth");
    let name = uiConv.target.normalizedName;
    ui.openAuth(window, otrAuth, name, "ask", uiConv, aObject);
  },

  closeUnverified: function(context) {
    let els = ui.getConvElements(context);
    if (!els) return;
    let { cti, box, uiConv } = els;

    let notification = box.getNotificationWithValue(authVerify);
    if (notification)
      notification.close();
  },

  notifyUnverified: function(context, seen) {
    let els = ui.getConvElements(context);
    if (!els) return;
    let { cti, box, uiConv } = els;

    if (box.getNotificationWithValue(authVerify))
      return;

    let window = cti.ownerDocument.defaultView;
    let otrAuth = cti.querySelector(".otr-auth");

    let msg = _("finger." + seen, context.username);
    let buttons = [{
      label: _("finger.verify"),
      accessKey: _("verify.accessKey"),
      callback: function() {
        let name = uiConv.target.normalizedName;
        ui.openAuth(window, otrAuth, name, "start", uiConv);
        // prevent closing of notification bar when the button is hit
        return true;
      }
    }];

    let priority = box.PRIORITY_WARNING_MEDIUM;
    box.appendNotification(msg, authVerify, null, priority, buttons, null);
  },

  closeVerification: function(context) {
    let els = ui.getConvElements(context);
    if (!els) return;
    let { cti, box, uiConv } = els;

    authLabelMap.forEach(function(_, key) {
      var prevNotification = box.getNotificationWithValue(key);
      if (prevNotification)
        prevNotification.close();
    });
  },

  notifyVerification: function(context, key, cancelable) {
    let els = ui.getConvElements(context);
    if (!els) return;
    let { cti, box, uiConv } = els;

    // TODO: maybe update the .label property on the notification instead
    // of closing it ... although, buttons need to be updated too.
    ui.closeVerification(context);

    let msg = authLabelMap.get(key);
    let buttons = [];
    if (cancelable) {
      buttons = [{
        label: _("auth.cancel"),
        accessKey: _("auth.cancelAccessKey"),
        callback: function() {
          let context = otr.getContext(uiConv.target);
          otr.abortSMP(context);
        }
      }];
    }

    // higher priority to overlay the current notifyUnverified
    let priority = box.PRIORITY_WARNING_HIGH;
    box.appendNotification(msg, key, null, priority, buttons, null);
  },

  updateAuth: function(aObj) {
    let uiConv = otr.getUIConvFromContext(aObj.context);
    if (!aObj.progress) {
      ui.closeAuth(aObj.context);
      ui.notifyVerification(aObj.context, "otr:auth-error", false);
    } else if (aObj.progress === 100) {
      let key;
      if (aObj.success) {
        if (aObj.context.trust) {
          key = "otr:auth-success";
          otr.notifyTrust(aObj.context);
        } else {
          key = "otr:auth-successThem";
        }
      } else {
        key = "otr:auth-fail";
        if (!aObj.context.trust)
          otr.notifyTrust(aObj.context);
      }
      ui.notifyVerification(aObj.context, key, false);
    } else {
      // TODO: show the aObj.progress to the user with a
      //   <progressmeter mode="determined" value="10" />
      ui.notifyVerification(aObj.context, "otr:auth-waiting", true);
    }
  },

  generate: function(args) {
    let features = "chrome,modal,centerscreen,resizable=no,minimizable=no";
    args.wrappedJSObject = args;
    Services.ww.openWindow(null, privDialog, "", features, args);
  },

  onAccountCreated: function(acc) {
    let account = acc.normalizedName;
    let protocol = acc.protocol.normalizedName;
    let p = Promise.resolve();
    if (otr.privateKeyFingerprint(account, protocol) === null)
      p = otr.generatePrivateKey(account, protocol);
    p.then(function() {
      if (coniks.isEnabled)
        return coniks.onAccountCreated(acc);
    }).catch(function(err) {
      Cu.reportError(err);
    });
  },

  onAccountRemoved: function(acc, prplId) {
    let account = acc.normalizedName;
    let protocol = Services.core.getProtocolById(prplId).normalizedName;
    try {
      otr.forgetPrivateKey(account, protocol);
    } catch(err) {
      Cu.reportError(err);
    }
  },

  contactWrapper: function(contact) {
    let wrapper = {
      account: contact.preferredBuddy.preferredAccountBuddy.account.normalizedName,
      protocol: contact.preferredBuddy.protocol.normalizedName,
      screenname: contact.preferredBuddy.preferredAccountBuddy.userName,
    };
    return wrapper;
  },

  onContactAdded: function(contact) {
    let args = ui.contactWrapper(contact);
    if (otr.getFingerprintsForRecipient(args.account, args.protocol, args.screenname).length > 0)
      return;
    args.wrappedJSObject = args;
    let features = "chrome,modal,centerscreen,resizable=no,minimizable=no";
    Services.ww.openWindow(null, addFingerDialog, "", features, args);
  },

  observe: function(aObject, aTopic, aMsg) {
    switch(aTopic) {
    case "nsPref:changed":
      ui.changePref(aMsg);
      break;
    case "conversation-loaded":
      let doc = aObject.ownerDocument;
      if (doc.documentElement.getAttribute("windowtype") !== "Messenger:convs")
        return;
      let binding = doc.getBindingParent(aObject);
      ui.addButton(binding);
      break;
    case "conversation-closed":
      if (aObject.isChat)
        return;
      ui.closeAuth(otr.getContext(aObject));
      ui.disconnect(aObject);
      break;
    case "prpl-quit":
      ui.disconnect(null);
      break;
    case "domwindowopened":
      ui.addMenus(aObject);
      break;
    case "otr:generate":
      ui.generate(aObject);
      break;
    case "otr:disconnected":
    case "otr:msg-state":
      if (aTopic === "otr:disconnected" ||
          otr.trust(aObject) !== otr.trustState.TRUST_UNVERIFIED) {
        ui.closeAuth(aObject);
        ui.closeUnverified(aObject);
        ui.closeVerification(aObject);
      }
      ui.updateButton(aObject);
      break;
    case "otr:unverified":
      ui.notifyUnverified(aObject, aMsg);
      break;
    case "otr:trust-state":
      ui.alertTrust(aObject);
      break;
    case "otr:log":
      ui.log("otr: " + aObject);
      break;
    case "account-added":
      ui.onAccountCreated(aObject);
      break;
    case "account-removed":
      ui.onAccountRemoved(aObject, aMsg);
      break;
    case "contact-added":
      ui.onContactAdded(aObject);
      break;
    case "otr:auth-ask":
      ui.askAuth(aObject);
      break;
    case "otr:auth-update":
      ui.updateAuth(aObject);
      break;
    }
  },

  initConv: function(binding) {
    otr.addConversation(binding._conv);
    ui.addButton(binding);
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
    ui.disconnect(null);
    Services.obs.removeObserver(otr, "new-ui-conversation");
    // Services.obs.removeObserver(ui, "contact-added");
    Services.obs.removeObserver(ui, "account-added");
    Services.obs.removeObserver(ui, "account-removed");
    Services.obs.removeObserver(ui, "conversation-loaded");
    Services.obs.removeObserver(ui, "conversation-closed");
    Services.obs.removeObserver(ui, "prpl-quit");
    Conversations._conversations.forEach(ui.resetConv);
    ui.prefs.removeObserver("", ui);
    otr.removeObserver(ui);
    otr.close();
    ui.removeMenuObserver();
    coniks.destroy();
  },

};