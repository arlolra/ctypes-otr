Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");

let otr = (function () {

  let libotr = new libOTR();

  const otrl_version = [4, 0, 0];
  const account = "default_account";
  const protocol = "default_protocol";

  return {

    userState: null,
    privKey: null,

    init: function () {

      if (libotr.otrl_init.apply(libotr.libotr, otrl_version))
        return console.error("Couldn't initialize OTR.");

      this.userState = libotr.otrl_userstate_create();
      this.privKey = FileUtils.getFile("ProfD", ["otr.privKey"]);

      if (Services.prefs.getBoolPref("extensions.ctypes-otr.autorun"))
        setTimeout(this.tab.bind(this), 1 * 1000);

    },

    // generate a private key
    // TODO: maybe move this to a ChromeWorker
    genKey: function (doc) {

      function render(err, fingerprint) {
        let html = err
          ? "Oh no! libotr returned an error: " + err
          : "Your fingerprint is: " + fingerprint;
        doc.getElementById("result").innerHTML = html;
      }

      let err = libotr.otrl_privkey_generate(
        this.userState,
        this.privKey.path,
        account,
        protocol
      );

      if (err)
        return render(new Error("code: " + err));

      let fingerprint = new ctypes.ArrayType(
        ctypes.char, libotr.OTRL_PRIVKEY_FPRINT_HUMAN_LEN
      )();

      err = libotr.otrl_privkey_fingerprint(
        this.userState,
        fingerprint,
        account,
        protocol
      );

      if (err.isNull())
        render(new Error("null pointer."));
      else
        render(null, fingerprint.readString());

    },

    tab: function () {
      let tab = gBrowser.addTab("chrome://otr/content/index.html");
      let tabBrowser = gBrowser.getBrowserForTab(tab);
      tabBrowser.addEventListener("load", function () {
        gBrowser.selectedTab = tab;
        let doc = tabBrowser.contentDocument;
        doc.addEventListener("genKey", this.genKey.bind(this, doc));
      }.bind(this), true);
    }

  };

}());

window.addEventListener("load", otr.init.bind(otr));