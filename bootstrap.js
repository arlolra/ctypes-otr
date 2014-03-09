const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource://gre/modules/Services.jsm");

const CHROME_URI = "chrome://otr/content/";

let consoleService = Cc["@mozilla.org/consoleservice;1"]
                       .getService(Ci.nsIConsoleService);

function log(msg) {
  consoleService.logStringMessage(msg);
}

let otr;
function startup(data, reason) {
  Cu.import(CHROME_URI + "otr.js");
  otr = new OTR();
  otr.genKey(function (err, fingerprint) {
    log(fingerprint);
  });
}

function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN) return;
  if (otr) otr.close();
  Cu.unload(CHROME_URI + "otr.js");
}

function install(data, reason) {}

function uninstall(data, reason) {}