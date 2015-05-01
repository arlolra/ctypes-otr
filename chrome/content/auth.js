const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("chrome://otr/content/otr.js");

XPCOMUtils.defineLazyGetter(this, "_", function()
  l10nHelper("chrome://otr/locale/auth.properties")
);

let [mode, uiConv, aObject] = window.arguments;

function showSection(selected, hideMenu, hideAccept) {
  if (hideMenu) {
    document.getElementById("how").hidden = true;
  }
  if (hideAccept) {
    document.documentElement.getButton("accept").hidden = true;
  }
  if (selected === "finished") {
    document.documentElement.getButton("cancel").label = _("auth.done");
  }
  [ "questionAndAnswer",
    "sharedSecret",
    "manualVerification",
    "waiting",
    "ask",
    "finished"
  ].forEach(function(key) {
    document.getElementById(key).hidden = (key !== selected);
  });
  window.sizeToContent();
}

function startSMP(context, answer, question) {
  showSection("waiting", true, true);
  otrAuth.waiting = true;
  otr.sendSecret(context, answer, question);
  return false;
}

let otrAuth = {

  waiting: false,
  finished: false,

  onload: function() {
    otr.addObserver(otrAuth);
    switch(mode) {
    case "start":
      // populate manual verification
      let context = otr.getContext(uiConv.target);
      let fingers = document.getElementById("fingerprints");
      let yours = otr.privateKeyFingerprint(context.account, context.protocol);
      if (!yours)
        throw new Error("Fingerprint should already be generated.");
      let theirs = otr.hashToHuman(context.fingerprint);
      fingers.value =
        _("auth.yourFingerprint", context.account, yours) + "\n\n" +
        _("auth.theirFingerprint", context.username, theirs);
      let opts = document.getElementById("verifiedOption");
      let select = context.trust ? "yes" : "no";
      for (let i = 0; i < opts.menupopup.childNodes.length; i ++) {
        let item = opts.menupopup.childNodes[i];
        if (select === item.value) {
          opts.selectedItem = item;
          break;
        }
      };
      break;
    case "ask":
      otrAuth.waiting = true;
      document.getElementById("askLabel").textContent = aObject.question
        ? _("auth.question", aObject.question)
        : _("auth.secret");
      showSection("ask", true);
      break;
    }
  },

  onunload: function() {
    otr.removeObserver(otrAuth);
  },

  accept: function() {
    let context = otr.getContext(uiConv.target);
    if (mode === "start") {
      let how = document.getElementById("howOption");
      switch(how.selectedItem.value) {
      case "questionAndAnswer":
        let question = document.getElementById("question").value;
        let answer = document.getElementById("answer").value;
        return startSMP(context, answer, question);
      case "sharedSecret":
        let secret = document.getElementById("secret").value;
        return startSMP(context, secret);
      case "manualVerification":
        let opts = document.getElementById("verifiedOption");
        let trust = (opts.selectedItem.value === "yes");
        otr.setTrust(context, trust);
        return true;
      }
    } else if (mode === "ask") {
      let response = document.getElementById("response").value;
      document.getElementById("progress").value = aObject.progress;
      document.getElementById("waitingLabel").hidden = true;
      showSection("waiting", true, true);
      otr.sendResponse(context, response);
      return false;
    }
  },

  cancel: function() {
    if (otrAuth.waiting && !otrAuth.finished) {
      let context = otr.getContext(uiConv.target);
      otr.abortSMP(context);
    }
  },

  oninput: function(e) {
    document.documentElement.getButton("accept").disabled = !e.value;
  },

  how: function() {
    let how = document.getElementById("howOption").selectedItem.value;
    switch(how) {
    case "questionAndAnswer":
      this.oninput(document.getElementById("answer"));
      break;
    case "sharedSecret":
      this.oninput(document.getElementById("secret"));
      break;
    case "manualVerification":
      this.oninput({ value: true });
      break;
    }
    showSection(how);
  },

  help: function() {
    let prompt = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
    prompt.alert(window, _("auth.helpTitle"), _("auth.help"));
  },

  updateProgress: function(aObj) {
    if (!otrAuth.waiting || aObj.context.username !== uiConv.target.normalizedName)
      return;

    if (!aObj.progress) {
      otrAuth.finished = true;
      document.getElementById("finLabel").textContent = _("auth.error");
      showSection("finished", true, true);
    } else if (aObj.progress === 100) {
      otrAuth.finished = true;
      let str;
      if (aObj.success) {
        if (aObj.context.trust) {
          str = "auth.success";
          otr.notifyTrust(aObj.context);
        } else {
          str = "auth.successThem";
        }
      } else {
        str = "auth.fail";
        if (!aObj.context.trust)
          otr.notifyTrust(aObj.context);
      }
      document.getElementById("finLabel").textContent = _(str);
      showSection("finished", true, true);
    } else {
      document.getElementById("progress").value = aObj.progress;
      document.getElementById("waitingLabel").hidden = true;
    }
  },

  observe: function(aObj, aTopic, aMsg) {
    switch(aTopic) {
    case "otr:auth-update":
      otrAuth.updateProgress(aObj);
      break;
    }
  }

};