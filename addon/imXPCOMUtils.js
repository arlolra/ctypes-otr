var { Cu } = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function l10nHelper(aChromeURL) {
  // Hackity, hack, hack!
  aChromeURL = aChromeURL.replace("chrome://otr/locale/", "resource://addon/chrome/locale/en/");
  let bundle = Services.strings.createBundle(aChromeURL);
  return function (aStringId) {
    try {
      if (arguments.length == 1)
        return bundle.GetStringFromName(aStringId);
      return bundle.formatStringFromName(aStringId,
                                         Array.prototype.slice.call(arguments, 1),
                                         arguments.length - 1);
    } catch (e) {
      Cu.reportError(e);
      dump("Failed to get " + aStringId + "\n");
      return aStringId;
    }
  };
}

exports.XPCOMUtils = XPCOMUtils;
exports.l10nHelper = l10nHelper;
