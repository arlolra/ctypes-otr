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

// TODO: attach a close handler
let uiConv = window.arguments[0];

let otrAuth = {

  onload: function() {
    let context = otr.getContext(uiConv.target);
    let desc = document.getElementById("fingerprints");
    let yours = otr.privateKeyFingerprint(context.account, context.protocol);
    if (!yours)
      throw new Error("Fingerprint should already be generated.");
    let theirs = otr.hashToHuman(context);
    desc.textContent = "\n" +
      trans("auth.yourFingerprint", context.account, yours) + "\n\n" +
      trans("auth.theirFingerprint", context.username, theirs) + "\n";
    let opts = document.getElementById("verifiedOption");
    let select = context.trust ? "have" : "not";
    for (let i = 0; i < opts.menupopup.childNodes.length; i ++) {
      let item = opts.menupopup.childNodes[i];
      if (select === item.value) {
        opts.selectedItem = item;
        break;
      }
    };
  },

  accept: function() {
    let context = otr.getContext(uiConv.target);
    let opts = document.getElementById("verifiedOption");
    let trust = (opts.selectedItem.value === "have");
    otr.setTrust(context, trust);
  },

  help: function() {
    prompt.alert(window, trans("auth.helpTitle"), trans("auth.help"));
  }

};