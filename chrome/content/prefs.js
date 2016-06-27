var Cu = Components.utils;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("chrome://otr/content/otr.js");

var fingerDialog = "chrome://otr/content/finger.xul";
var privDialog = "chrome://otr/content/priv.xul";

var account, protocol;
if (window && window.arguments) {
  let args = window.arguments[0].wrappedJSObject;
  ({account, protocol} = args);
}

var otrPref = {

  onload: function() {
    let accountList = document.getElementById("accountlist");
    for (let acc of this.getAccounts()) {
      let menuItem = accountList.appendItem(
        `${acc.normalizedName} (${otr.protocolName(acc.protocol.normalizedName)})`,
        acc.id
      );
      if (acc.normalizedName === account &&
          acc.protocol.normalizedName === protocol) {
        accountList.selectedItem = menuItem;
        this.swapFinger(acc);
      }
    }
    if (accountList.itemCount) {
      if (!accountList.selectedItem) {
        let menuItem = accountList.getItemAtIndex(0);
        accountList.selectedItem = menuItem;
        let acc = Services.accounts.getAccountById(menuItem.getAttribute("value"));
        this.swapFinger(acc);
      }
      document.getElementById("emptyal").hidden = true;
      document.getElementById("myKeys").hidden = false;
    }
  },

  getAccounts: function* () {
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
    let features = "modal,centerscreen,resizable=no,minimizable=no";
    Services.ww.openWindow(null, privDialog, "", features, args);
    this.swapFinger(acc);
  },

};
