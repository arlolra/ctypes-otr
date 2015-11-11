var { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");

function init() {
  Cu.import("chrome://otr/content/ui.js");
  let sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
  let ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  let uri = ios.newURI("chrome://otr/skin/otr.css", null, null);
  sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
  ui.init();
}

function initializer() {
  init();
  Services.obs.removeObserver(initializer, "prpl-init");
}

function startup(data, reason) {
  if (Services.core.initialized)
    init();
  else
    Services.obs.addObserver(initializer, "prpl-init", false);
}

function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN)
    return;
  ui.destroy();
  Cu.unload("chrome://otr/content/ui.js");
}

function install(data, reason) {}
function uninstall(data, reason) {}