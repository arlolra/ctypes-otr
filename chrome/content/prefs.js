const Cu = Components.utils;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("chrome://otr/content/otr.js");

const fingerDialog = "chrome://otr/content/finger.xul";

XPCOMUtils.defineLazyGetter(this, "_", function()
  l10nHelper("chrome://otr/locale/auth.properties")
);

let otrPref = {

  onload: function() {
    let accountList = document.getElementById("accountlist");
    for (let acc in this.getAccounts()) {
      let menuItem = accountList.appendItem(
        `${acc.normalizedName} (${acc.protocol.normalizedName})`,
        acc.id
      );
      if (!accountList.selectedItem) {
        accountList.selectedItem = menuItem;
        this.swapFinger(acc);
      }
    }
    if (accountList.itemCount) {
      document.getElementById("emptyal").hidden = true;
      document.getElementById("myKeys").hidden = false;
    }
  },

  getAccounts: function am_getAccounts() {
    let accounts = Services.accounts.getAccounts();
    while (accounts.hasMoreElements())
      yield accounts.getNext();
  },

  swapFinger: function(acc) {
    let display = otr.privateKeyFingerprint(
      acc.normalizedName,
      acc.protocol.normalizedName
    ) || "";
    document.getElementById("fingerprint").value = display;
    document.getElementById("display").hidden = !display;
    document.getElementById("generate").hidden = !!display;
  },

  displayFinger: function() {
    let accountList = document.getElementById("accountlist");
    let acc = Services.accounts.getAccountById(accountList.selectedItem.value);
    this.swapFinger(acc);
  },

  fingwin: null,
  showFingers: function() {
    if (this.fingwin) {
      return this.fingwin.focus();
    }
    this.fingwin = document.documentElement.openWindow(
      "otr-pref-fingerprints", fingerDialog, "", null
    );
    this.fingwin.addEventListener("close", function() {
      otrPref.fingwin = null;
    });
  },

  generate: function() {
    let accountList = document.getElementById("accountlist");
    let acc = Services.accounts.getAccountById(accountList.selectedItem.value);
    let args = {
      account: acc.normalizedName,
      protocol: acc.protocol.normalizedName,
    };
    args.wrappedJSObject = args;
    otr.notifyObservers(args, "otr:generate");
    this.swapFinger(acc);
  },

};
