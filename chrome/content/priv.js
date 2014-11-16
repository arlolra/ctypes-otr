const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("chrome://otr/content/otr.js");

let bundle = Services.strings.createBundle("chrome://otr/locale/priv.properties");

function trans(name) {
  let args = Array.prototype.slice.call(arguments, 1);
  return args.length > 0
    ? bundle.formatStringFromName(name, args, args.length)
    : bundle.GetStringFromName(name);
}

let otrPriv = {

  onload: function() {
    let args = window.arguments[0].wrappedJSObject;
    let priv = document.getElementById("priv");
    priv.textContent = trans("priv.account", args.account, args.protocol);
    setTimeout(function() {
      otr._generatePrivateKey(args.account, args.protocol);
      // document.documentElement.acceptDialog();
      document.documentElement.getButton("accept").disabled = false;
    }, 1000);
  }

};
