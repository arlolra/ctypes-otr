const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");

let csl = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
function log(msg) csl.logStringMessage(msg);

let ui = {

  otr: null,
  prefs: null,
  origAddConv: null,

  init: function() {
    ui.prefs = Services.prefs.getBranch("extensions.otr.");
    ui.prefs.addObserver("", ui, false);

    let opts = {
      ui: ui,
      requireEncryption: ui.prefs.getBoolPref("requireEncryption")
    };

    ui.otr = new OTR(opts);
    ui.otr.loadFiles().then(function() {
      let cs = Services.conversations.wrappedJSObject;
      ui.origAddConv = cs.addConversation;
      cs.addConversation = function(prplIConvIM) {
        ui.otr.addConversation(prplIConvIM);
        ui.origAddConv.call(cs, prplIConvIM);
      };
    }, function(reason) { throw new Error(reason); });
  },

  observe: function(aObject, aTopic, aMsg) {
    if (aTopic !== "nsPref:changed")
      return;

    switch(aMsg) {
    case "requireEncryption":
      ui.otr.setPolicy(ui.prefs.getBoolPref("requireEncryption"));
      break;
    default:
      log(aMsg);
    }
  },

  destroy: function() {
    let cs = Services.conversations.wrappedJSObject;
    for each (let prplIConvIM in cs.getUIConversations())
      ui.otr.removeConversation(prplIConvIM);
    cs.addConversation = ui.origAddConv;

    ui.prefs.removeObserver("", ui);
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