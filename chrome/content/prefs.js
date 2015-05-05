const Cu = Components.utils;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("chrome://otr/content/otr.js");

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
        this._displayFinger(acc);
      }
    }
    if (accountList.itemCount) {
      document.getElementById("emptyal").hidden = true;
      accountList.hidden = false;
    }
  },

  getAccounts: function am_getAccounts() {
    let accounts = Services.accounts.getAccounts();
    while (accounts.hasMoreElements())
      yield accounts.getNext();
  },

  _displayFinger: function(acc) {
    let finger = document.getElementById("fingerprint");
    finger.value = otr.privateKeyFingerprint(
      acc.normalizedName,
      acc.protocol.normalizedName
    ) || "";
  },

  displayFinger: function() {
    let accountList = document.getElementById("accountlist");
    let acc = Services.accounts.getAccountById(accountList.selectedItem.value);
    this._displayFinger(acc);
  },

  fingwin: null,
  showFingers: function() {
    if (this.fingwin) {
      return this.fingwin.focus();
    }
    this.fingwin = document.documentElement.openWindow(
      "otr-pref-fingerprints", "chrome://otr/content/finger.xul", "", null
    );
    this.fingwin.addEventListener("close", function() {
      otrPref.fingwin = null;
    });
  },

};
