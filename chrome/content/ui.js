// just something to play with

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("chrome://otr/content/otr.js");

let UI = (function () {
  
  let otr = new OTR();

  let UI = function () {
    // bind methods
    ;["init", "tab", "tabLoaded", "renderFp"].forEach(function (method) {
      this[method] = this[method].bind(this);
    }.bind(this));
  }

  UI.prototype = {

    constructor: UI,

    renderFp: function (err, fingerprint) {
      let html = err
        ? "Oh no! libotr returned an error: " + err
        : "Your fingerprint is: " + fingerprint;
      this.doc.getElementById("result").innerHTML = html;
    },

    tabLoaded: function () {
      tabBrowser.removeEventListener("load", this.tabLoaded, true);
      gBrowser.selectedTab = tabAdded;
      this.doc = tabBrowser.contentDocument;
      this.doc.addEventListener("genKey", otr.genKey.bind(otr, this.renderFp));
    },

    tab: function () {
      tabAdded = gBrowser.addTab("chrome://otr/content/index.html");
      tabBrowser = gBrowser.getBrowserForTab(tabAdded);
      tabBrowser.addEventListener("load", this.tabLoaded, true);
    },

    init: function() {
      window.removeEventListener("load", this.init);
      if (Services.prefs.getBoolPref("extensions.ctypes-otr.autorun"))
        // delay to avoid conflict with start page
        setTimeout(this.tab, 1 * 1000);
    }

  }

  return new UI();

}());

window.addEventListener("load", UI.init);