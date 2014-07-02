const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imWindows.jsm");

const XULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

let csl = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
function log(msg) csl.logStringMessage(msg);

function getUniqueId() {
  let counter = 0;
  while (true)
    yield counter++;
}
var uniqueId = getUniqueId();

let ui = {

  otr: null,
  prefs: null,
  origAddConv: null,

  init: function() {
    ui.prefs = Services.prefs.getBranch("extensions.otr.");
    let opts = {
      requireEncryption: ui.prefs.getBoolPref("requireEncryption")
    };
    ui.otr = new OTR(opts);
    ui.otr.addObserver(ui);
    ui.otr.loadFiles().then(function() {
      Services.obs.addObserver(ui, "conversation-loaded", false);
      Services.obs.addObserver(ui, "new-conversation", false);
      Services.obs.addObserver(ui, "account-disconnecting", false);
      ui.prefs.addObserver("", ui, false);
    }, function(reason) { throw new Error(reason); });
  },

  disconnect: function(aAccount) {
    Conversations._conversations.forEach(function(binding) {
      let conv = binding._conv;
      if (conv.isChat || conv.account.id !== aAccount.id)
        return;
      ui.otr.disconnect(conv);
    });
  },

  changePref: function(aMsg) {
    switch(aMsg) {
    case "requireEncryption":
      ui.otr.setPolicy(ui.prefs.getBoolPref("requireEncryption"));
      break;
    default:
      log(aMsg);
    }
  },

  resize: function(aEvent) {
    let convElt = aEvent.originalTarget.document.getElementById("conversations");
    if (!convElt)
      return;

    let conversations = convElt.conversations;
    for each (let binding in conversations) {
      if (binding.conv.isChat)
        continue;
      ui.addButton(binding, false);
    }
  },

  tabListener: function(aObject) {
    let binding = aObject.ownerDocument.getBindingParent(aObject);
    ui.addButton(binding, true);
  },

  addButton: function(binding, attachResize) {
    let convTop = binding.getElt("conv-top-info");
    let doc = convTop.ownerDocument;
    let window = doc.defaultView;

    if (attachResize)
      window.addEventListener("resize", ui.resize, false);

    // only add to large view
    if (window.getComputedStyle(convTop).MozBinding.indexOf("conv-info-large") < 0)
      return;

    // handle timing issue
    if (doc.getAnonymousElementByAttribute(convTop, "anonid", "otr:hbox") != null)
      return;

    let smElt = doc.getAnonymousElementByAttribute(convTop, "anonid", "statusMessage");

    // workaround so status message still gets its attributes updated
    let broadcaster = doc.createElementNS(XULNS, "xul:broadcaster")
    let broadcastID = "brID_" + uniqueId.next();
    broadcaster.setAttribute("id", broadcastID);
    broadcaster.setAttribute("isBroadcaster", "true");
    smElt.parentNode.appendChild(broadcaster);
    smElt.setAttribute("observes", broadcastID);

    let hboxElt = doc.createElementNS(XULNS, "xul:hbox");
    hboxElt.setAttribute("flex", "1");
    hboxElt.setAttribute("anonid", "otr:hbox");
    smElt.parentNode.appendChild(hboxElt);
    hboxElt.appendChild(smElt);

    let tbb = doc.createElementNS(XULNS, "xul:toolbarbutton");
    tbb.setAttribute("anonid", "otr:button");
    tbb.setAttribute("tooltiptext", "OTR");
    tbb.setAttribute("type", "button");
    tbb.addEventListener("command", function(e) {
      e.preventDefault();
      menupopup.openPopup(tbb, "after_start");
    }, false);

    tbb.style.margin = "29px 0px 0px 0px";
    tbb.style.setProperty("padding", "0", "important");

    let menupopup = doc.createElementNS(XULNS, "xul:menupopup");
    menupopup.setAttribute("position", "after_end");
    let menuitem = doc.createElementNS(XULNS, "xul:menuitem");
    menuitem.setAttribute("label", "Testing");
    menupopup.appendChild(menuitem);
    tbb.appendChild(menupopup);

    // get otr msg state
    let msgState = ui.otr.getMsgState(binding._conv);
    ui.setMsgState(msgState, tbb);

    hboxElt.appendChild(tbb);
  },

  updateButton: function(context) {
    log("update button")
    let conv = ui.otr.convos.get(context.id);
    Conversations._conversations.forEach(function(binding) {
      if (binding._conv.id !== conv.conv.id)
        return;

      let convTop = binding.getElt("conv-top-info");
      let doc = convTop.ownerDocument;
      let window = doc.defaultView;

      if (window.getComputedStyle(convTop).MozBinding.indexOf("conv-info-large") < 0)
        return;

      let tbb = doc.getAnonymousElementByAttribute(convTop, "anonid", "otr:button");
      ui.setMsgState(context.msgState, tbb);
    });
  },

  // set msg state on toolbar button
  setMsgState: function(msgState, tbb) {
    let label, color;
    switch(msgState) {
    case ui.otr.messageState.OTRL_MSGSTATE_ENCRYPTED:
      label = "Private";
      color = "black";
      break;
    case ui.otr.messageState.OTRL_MSGSTATE_FINISHED:
    case ui.otr.messageState.OTRL_MSGSTATE_PLAINTEXT:
      label = "Not private";
      color = "red";
      break;
    default:
      throw new Error("Shouldn't be here.");
    }
    tbb.setAttribute("label", label);
    tbb.style.color = color;
  },

  observe: function(aObject, aTopic, aMsg) {
    switch(aTopic) {
    case "nsPref:changed":
      this.changePref(aMsg);
      break;
    case "conversation-loaded":
      this.tabListener(aObject);
      break;
    case "msg-state":
      this.updateButton(aObject);
      break;
    case "new-conversation":
      ui.otr.addConversation(aObject);
      break;
    case "account-disconnecting":
      ui.disconnect(aObject);
      break;
    default:
      log(aTopic)
    }
  },

  resetConv: function(binding) {
    let convTop = binding.getElt("conv-top-info");
    let doc = convTop.ownerDocument;
    let window = doc.defaultView;
    window.removeEventListener("resize", ui.resize, false);

    if (window.getComputedStyle(convTop).MozBinding.indexOf("conv-info-large") < 0)
      return;

    if (!doc.getAnonymousElementByAttribute(convTop, "anonid", "otr:button"))
      return;

    let smElt = doc.getAnonymousElementByAttribute(convTop, "anonid", "statusMessage");
    smElt.parentNode.appendChild(smElt);
    stackElt.removeChild(doc.getAnonymousElementByAttribute(convTop, "anonid", "otr:hbox"));
    stackElt.removeChild(doc.getAnonymousElementByAttribute(convTop, "isBroadcaster", "true"));
    smElt.removeAttribute("observes");
  },

  destroy: function() {
    Services.obs.removeObserver(ui, "conversation-loaded");
    Conversations._conversations.forEach(ui.resetConv);

    let cs = Services.conversations.wrappedJSObject;
    for each (let prplIConvIM in cs.getUIConversations())
      ui.otr.removeConversation(prplIConvIM);
    cs.addConversation = ui.origAddConv;

    ui.prefs.removeObserver("", ui);
    ui.otr.removeObserver(ui);
    // ui.otr.close();
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