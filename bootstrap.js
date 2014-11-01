const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imWindows.jsm");

let bundle = Services.strings.createBundle("chrome://otr/locale/ui.properties");

function trans(name) {
  let args = Array.prototype.slice.call(arguments, 1);
  return args.length > 0
    ? bundle.formatStringFromName(name, args, args.length)
    : bundle.GetStringFromName(name);
}

let ui = {

  debug: false,
  log: function log(msg) {
    if (!ui.debug)
      return;
    let csl = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
    csl.logStringMessage(msg);
  },

  otr: null,
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
    this.setPrefs();
    let opts = {
      requireEncryption: ui.prefs.getBoolPref("requireEncryption")
    };
    ui.otr = new OTR(opts);
    ui.otr.addObserver(ui);
    ui.otr.loadFiles().then(function() {
      Services.obs.addObserver(ui.otr, "new-ui-conversation", false);
      Services.obs.addObserver(ui, "conversation-loaded", false);
      Services.obs.addObserver(ui, "conversation-closed", false);
      Services.obs.addObserver(ui, "prpl-quit", false);
      ui.prefs.addObserver("", ui, false);
    }, function(reason) { throw new Error(reason); });
  },

  disconnect: function(aConv) {
    if (aConv)
      return ui.otr.disconnect(aConv, true);
    let conversations = Services.conversations.getConversations();
    while (conversations.hasMoreElements()) {
      let conv = conversations.getNext();
      if (conv.isChat)
        return;
      ui.otr.disconnect(conv, true);
    }
  },

  changePref: function(aMsg) {
    switch(aMsg) {
    case "requireEncryption":
      ui.otr.setPolicy(ui.prefs.getBoolPref("requireEncryption"));
      break;
    default:
      ui.log(aMsg);
    }
  },

  addButton: function(aObject) {
    let binding = aObject.ownerDocument.getBindingParent(aObject);
    let uiConv = binding._conv;
    let conv = uiConv.target;
    if (conv.isChat)
      return;

    let cti = binding.getElt("conv-top-info");
    let doc = cti.ownerDocument;

    let otrStart = doc.createElement("menuitem");
    otrStart.setAttribute("label", trans("start.label"));
    otrStart.classList.add("otr-start");
    otrStart.addEventListener("click", function(e) {
      e.preventDefault();
      if (!e.target.disabled)
        ui.otr.sendQueryMsg(conv);
    });

    let otrEnd = doc.createElement("menuitem");
    otrEnd.setAttribute("label", trans("end.label"));
    otrEnd.classList.add("otr-end");
    otrEnd.addEventListener("click", function(e) {
      e.preventDefault();
      if (!e.target.disabled)
        ui.otr.disconnect(conv, false);
    });

    let otrMenu = doc.createElement("menupopup");
    otrMenu.appendChild(otrStart);
    otrMenu.appendChild(otrEnd);

    let otrButton = doc.createElement("toolbarbutton");
    otrButton.classList.add("otr-button");
    otrButton.setAttribute("tooltiptext", trans("tooltip"));
    otrButton.addEventListener("command", function(e) {
      e.preventDefault();
      otrMenu.openPopup(otrButton, "after_start");
    }, false);

    otrButton.appendChild(otrMenu);
    cti.appendChild(otrButton);

    // get otr msg state
    let context = ui.otr.getContext(conv);
    let trust = ui.getTrustSettings(context);
    ui.setMsgState(trust, otrButton, otrStart, otrEnd);
    uiConv.systemMessage(trans("alert.state", trust.label));
  },

  updateButton: function(context) {
    let uiConv = ui.otr.getUIConvFromContext(context);
    if (!uiConv)
      Cu.reportError("Couldn't find conversation to update.");
    Conversations._conversations.forEach(function(binding) {
      if (binding._conv.id !== uiConv.id)
        return;
      let cti = binding.getElt("conv-top-info");
      let otrButton = cti.querySelector(".otr-button");
      let otrStart = cti.querySelector(".otr-start");
      let otrEnd = cti.querySelector(".otr-end");
      let trust = ui.getTrustSettings(context);
      ui.setMsgState(trust, otrButton, otrStart, otrEnd);
    });
  },

  getTrustSettings: function(context) {
    switch(ui.otr.trust(context)) {
    case ui.otr.trustState.TRUST_NOT_PRIVATE:
      return {
        label: trans("trust.not_private"),
        color: "red",
        disableStart: false,
        disableEnd: true
      };
    case ui.otr.trustState.TRUST_UNVERIFIED:
      return {
        label: trans("trust.unverified"),
        color: "darkorange",
        disableStart: true,
        disableEnd: false
      };
    case ui.otr.trustState.TRUST_PRIVATE:
      return {
        label: trans("trust.private"),
        color: "black",
        disableStart: true,
        disableEnd: false
      };
    case ui.otr.trustState.TRUST_FINISHED:
      return {
        label: trans("trust.finished"),
        color: "darkorange",
        disableStart: false,
        disableEnd: false
      };
    default:
      throw new Error("Shouldn't be here.");
    }
  },

  // set msg state on toolbar button
  setMsgState: function(trust, otrButton, otrStart, otrEnd) {
    otrButton.setAttribute("label", trust.label);
    otrButton.style.color = trust.color;
    otrStart.setAttribute("disabled", trust.disableStart);
    otrEnd.setAttribute("disabled", trust.disableEnd);
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
    case "prpl-quit":
      ui.disconnect(aTopic === "prpl-quit" ? null : aObject);
      break;
    case "otr:msg-state":
      ui.updateButton(aObject);
      break;
    case "otr:log":
      ui.log("otr: " + aObject);
      break;
    default:
      ui.log(aTopic);
    }
  },

  resetConv: function(binding) {
    ui.otr.removeConversation(binding._conv);
    let cti = binding.getElt("conv-top-info");
    let otrButton = cti.querySelector(".otr-button");
    if (!otrButton)
      return;
    otrButton.parentNode.removeChild(otrButton);
  },

  destroy: function() {
    Services.obs.removeObserver(ui.otr, "new-ui-conversation");
    Services.obs.removeObserver(ui, "conversation-loaded");
    Services.obs.removeObserver(ui, "conversation-closed");
    Services.obs.removeObserver(ui, "prpl-quit");
    Conversations._conversations.forEach(ui.resetConv);
    ui.prefs.removeObserver("", ui);
    ui.otr.removeObserver(ui);
  }

};

function startup(data, reason) {
  Cu.import("chrome://otr/content/otr.js");
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