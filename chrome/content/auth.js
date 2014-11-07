const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("chrome://otr/content/otr.js");

let prompt = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
let bundle = Services.strings.createBundle("chrome://otr/locale/auth.properties");

function trans(name) {
  let args = Array.prototype.slice.call(arguments, 1);
  return args.length > 0
    ? bundle.formatStringFromName(name, args, args.length)
    : bundle.GetStringFromName(name);
}

let otrAuth = {

  onload: function() {
    let uiConv = window.arguments[0];
    // attach close handler

    let context = otr.getContext(uiConv.target);
    let desc = document.getElementById("fingerprints");
    let yours = otr.privateKeyFingerprint(context.account, context.protocol);
    if (!yours)
      throw new Error("Fingerprint should already be generated.");
    let theirs = otr.hashToHuman(context.fingerprint);
    desc.textContent = "\n" +
      trans("auth.yourFingerprint", context.account, yours) + "\n\n" +
      trans("auth.theirFingerprint", context.username, theirs) + "\n";
  },

  accept: function() {
    
  },

  help: function() {
    prompt.alert(window, trans("auth.helpTitle"), trans("auth.help"));
  }

};