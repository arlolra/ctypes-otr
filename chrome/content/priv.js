const Cu = Components.utils;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("chrome://otr/content/otr.js");

XPCOMUtils.defineLazyGetter(this, "_", function()
  l10nHelper("chrome://otr/locale/priv.properties")
);

let otrPriv = {

  onload: function() {
    let args = window.arguments[0].wrappedJSObject;
    let priv = document.getElementById("priv");
    priv.textContent = _("priv.account", args.account, otr.protocolName(args.protocol));
    otr.generatePrivateKey(args.account, args.protocol).then(function(success) {
      if (!success)
        throw new Error("Generating key failed!")
      // document.documentElement.acceptDialog();
      document.documentElement.getButton("accept").disabled = false;
    });
  },

};
