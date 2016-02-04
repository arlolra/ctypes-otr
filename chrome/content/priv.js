var Cu = Components.utils;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("chrome://otr/content/otr.js");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://otr/locale/priv.properties")
);

var otrPriv = {

  onload: function() {
    let args = window.arguments[0].wrappedJSObject;
    let priv = document.getElementById("priv");
    priv.textContent = _("priv.account", args.account, otr.protocolName(args.protocol));
    otr.generatePrivateKey(args.account, args.protocol).then(function() {
      document.documentElement.getButton("accept").disabled = false;
      document.documentElement.acceptDialog();
    }).catch(function(err) {
      document.documentElement.getButton("accept").disabled = false;
      priv.textContent = _("priv.failed", String(err));
    });
  },

};
