var Cu = Components.utils;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("chrome://otr/content/otr.js");
Cu.import("chrome://otr/content/helpers.js");
Cu.import("chrome://otr/content/coniks/coniks.js");

var fingerDialog = "chrome://otr/content/finger.xul";
var privDialog = "chrome://otr/content/priv.xul";

var account, protocol;
if (window && window.arguments) {
  let args = window.arguments[0].wrappedJSObject;
  ({account, protocol} = args);
}

var otrPref = {

  onload: function() {
    otrPref.otrTabInit();
    if (coniks.isEnabled)
      otrPref.coniksTabInit();
  },

  tabInit: function(listElement, changeDisplayElements, func) {
    let accountList = document.getElementById(listElement);
    for (let acc of helpers.getAccounts()) {
      let menuItem = accountList.appendItem(
        `${acc.normalizedName} (${otr.protocolName(acc.protocol.normalizedName)})`,
        acc.id
      );
      if (acc.normalizedName === account &&
          acc.protocol.normalizedName === protocol) {
        accountList.selectedItem = menuItem;
        func(acc);
      }
    }
    if (accountList.itemCount) {
      if (!accountList.selectedItem) {
        let menuItem = accountList.getItemAtIndex(0);
        accountList.selectedItem = menuItem;
        let acc = Services.accounts.getAccountById(menuItem.getAttribute("value"));
        func(acc);
      }
      Object.keys(changeDisplayElements).forEach(function(key) {
        document.getElementById(key).hidden = changeDisplayElements[key];
      });
    }
  },

  otrTabInit: function() {
    let changeDisplayElements = {
      emptyal: true,
      myKeys: false,
    };
    this.tabInit("accountlist", changeDisplayElements, this.swapFinger);
  },

  coniksTabInit: function() {
    document.getElementById("coniksTab").hidden = false;
    let changeDisplayElements = {
      coniksuser: false,
    };
    this.tabInit("coniksaccountlist", changeDisplayElements, this.displayAccountPolicy);
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
    if (this.fingwin)
      return this.fingwin.focus();
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
    let features = "chrome,modal,centerscreen,resizable=no,minimizable=no";
    Services.ww.openWindow(null, privDialog, "", features, args);
    this.swapFinger(acc);
  },

  // CONIKS preferences

  displayAccountPolicy: function(acc) {
    let policy = coniks.getAccountPolicy(acc);
    document.getElementById("privateLookups").checked = policy.privateLookups;
    document.getElementById("signedKeyChange").checked = policy.signedKeyChange;
  },

  displayPolicies: function() {
    let accountList = document.getElementById("coniksaccountlist");
    let acc = Services.accounts.getAccountById(accountList.selectedItem.value);
    this.displayAccountPolicy(acc);
  },

  updateAccountPolicy: function() {
    let accountList = document.getElementById("coniksaccountlist");
    let acc = Services.accounts.getAccountById(accountList.selectedItem.value);
    let policy = {
      privateLookups: !!document.getElementById("privateLookups").checked,
      signedKeyChange: !!document.getElementById("signedKeyChange").checked
    };
    coniks.setAccountPolicy(acc, policy)
    .catch(function(err) { Cu.reportError(err); });
  },

};
