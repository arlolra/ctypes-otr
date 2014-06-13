const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");

const CHROME_URI = "chrome://otr/content/";

let consoleService = Cc["@mozilla.org/consoleservice;1"]
                       .getService(Ci.nsIConsoleService);

function log(msg) {
  consoleService.logStringMessage(msg);
}

function asyncErr(reason) {
  throw new Error(reason);
}

let otr, originalAddConversation;
function startup(data, reason) {
  Cu.import(CHROME_URI + "otr.js");
  otr = new OTR();
  otr.loadFiles().then(function() {
    let cs = Services.conversations.wrappedJSObject;
    originalAddConversation = cs.addConversation;
    cs.addConversation = function(prplIConvIM) {
      otr.addConversation(prplIConvIM);
      originalAddConversation.call(cs, prplIConvIM);
    };
  }, asyncErr);
}

function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN)
    return;

  otr.close();

  let cs = Services.conversations.wrappedJSObject;
  for each (let prplIConvIM in cs.getUIConversations())
    otr.removeConversation(prplIConvIM);
  cs.addConversation = originalAddConversation;

  Cu.unload(CHROME_URI + "otr.js");
}

function install(data, reason) {}

function uninstall(data, reason) {}