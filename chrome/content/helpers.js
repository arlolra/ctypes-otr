var isNode = (typeof process === "object");
var isJpm = !isNode && (typeof require === "function");

var OS;

if (!isNode) {
  var Ci, Cu, Cc;
  if (isJpm) {
    ({ Ci, Cu, Cc } = require("chrome"));
  } else {
    ({ interfaces: Ci, utils: Cu, classes: Cc } = Components);
    Cu.import("resource:///modules/imServices.jsm");
  }
  Cu.import("resource://gre/modules/osfile.jsm");
}

var helpers = {

  profilePath: function(filename) {
    return isNode ?
      path.resolve(__dirname, filename) :
      OS.Path.join(OS.Constants.Path.profileDir, filename);
  },

  getAccounts: function* () {
    let accounts = Services.accounts.getAccounts();
    while (accounts.hasMoreElements())
      yield accounts.getNext();
  },

};

// exports

if (isNode) {
  module.exports = { helpers: helpers };
} else if (isJpm) {
  exports.helpers = helpers;
} else {
  this.EXPORTED_SYMBOLS = ["helpers"];
}
