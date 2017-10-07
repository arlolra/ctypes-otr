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

  fileExists: function(filename) {
    return OS.File.exists(filename);
  },

  removeFile: function(filename) {
    return OS.File.remove(filename);
  },

  readTextFile: function(filename) {
    let decoder = new TextDecoder();
    return OS.File.read(filename).then(function(array) {
      return decoder.decode(array);
    });
  },

  writeTextFile: function(filename, data) {
    let encoder = new TextEncoder();
    let array = encoder.encode(data);
    // https://dutherenverseauborddelatable.wordpress.com/2014/02/05/is-my-data-on-the-disk-safety-properties-of-os-file-writeatomic/
    return OS.File.writeAtomic(filename, array, { tmpPath: `${filename}.tmp` });
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
