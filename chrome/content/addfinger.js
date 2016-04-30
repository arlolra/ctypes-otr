var { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("chrome://otr/content/otr.js");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://otr/locale/finger.properties")
);

var args = window.arguments[0].wrappedJSObject;

var otrAddFinger = {
  onload: function() {
    document.title = _("addfinger.title", args.screenname);
  },

  oninput: function(e) {
    e.value = e.value.replace(/[^0-9a-fA-F]/gi, "");
    document.documentElement.getButton("accept").disabled = (e.value.length != 40);
  },

  add: function(e) {
    let hex = document.getElementById("finger").value;
    let context = otr.getContextFromRecipient(
      args.account,
      args.protocol,
      args.screenname
    );
    finger = otr.addFingerprint(context, hex);
    if (finger.isNull())
      return;
    try {
        // Ignore the return, this is just a test.
        otr.getUIConvFromContext(context);
    } catch(e) {
        // We expect that a conversation may not have been started.
        context = null;
    }
    otr.setTrust(finger, true, context);
  },
};
