const Cu = Components.utils;

function startup(data, reason) {
  Cu.import("chrome://otr/content/otr.js");
  let otr = new OTR();
  otr.genKey(function (err, fingerprint) {
    throw err ? err : new Error(fingerprint);
  });
}

function shutdown(data, reason) {}

function install(data, reason) {}

function uninstall(data, reason) {}