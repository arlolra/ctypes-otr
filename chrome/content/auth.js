var { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("chrome://otr/content/otr.js");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://otr/locale/auth.properties")
);

var [mode, uiConv, aObject] = window.arguments;

document.title = _("auth.title",
  (mode === "pref") ? aObject.screenname : uiConv.normalizedName);

function showSection(selected, hideMenu) {
  document.getElementById("how").hidden = !!hideMenu;
  [ "questionAndAnswer",
    "sharedSecret",
    "manualVerification",
    "ask",
  ].forEach(function(key) {
    document.getElementById(key).hidden = (key !== selected);
  });
  window.sizeToContent();
}

function startSMP(context, answer, question) {
  otr.sendSecret(context, answer, question);
  otr.authUpdate(context, 10);
}

function manualVerification(fingerprint, context) {
  let opts = document.getElementById("verifiedOption");
  let trust = (opts.selectedItem.value === "yes");
  otr.setTrust(fingerprint, trust, context);
}

function populateFingers(context, theirs, trust) {
  let fingers = document.getElementById("fingerprints");
  let yours = otr.privateKeyFingerprint(context.account, context.protocol);
  if (!yours)
    throw new Error("Fingerprint should already be generated.");
  fingers.value =
    _("auth.yourFingerprint", context.account, yours) + "\n\n" +
    _("auth.theirFingerprint", context.username, theirs);
  let opts = document.getElementById("verifiedOption");
  let verified = trust ? "yes" : "no";
  for (let i = 0; i < opts.menupopup.childNodes.length; i ++) {
    let item = opts.menupopup.childNodes[i];
    if (verified === item.value) {
      opts.selectedItem = item;
      break;
    }
  };
}

var otrAuth = {

  onload: function() {
    let context, theirs;
    switch(mode) {
      case "start":
        context = otr.getContext(uiConv.target);
        theirs = otr.hashToHuman(context.fingerprint);
        populateFingers(context, theirs, context.trust);
        showSection("questionAndAnswer");
        break;
      case "pref":
        context = otr.getContextFromRecipient(
          aObject.account,
          aObject.protocol,
          aObject.screenname
        );
        theirs = aObject.fingerprint;
        populateFingers(context, theirs, aObject.trust);
        showSection("manualVerification", true);
        this.oninput({ value: true });
        break;
      case "ask":
        document.getElementById("askLabel").textContent = aObject.question
          ? _("auth.question", aObject.question)
          : _("auth.secret");
        showSection("ask", true);
        break;
    }
  },

  accept: function() {
    let opts, trust;
    // uiConv may not be present in pref mode
    let context = uiConv ? otr.getContext(uiConv.target) : null;
    if (mode === "pref") {
      manualVerification(aObject.fpointer, context);
    } else if (mode === "start") {
      let how = document.getElementById("howOption");
      switch(how.selectedItem.value) {
        case "questionAndAnswer":
          let question = document.getElementById("question").value;
          let answer = document.getElementById("answer").value;
          startSMP(context, answer, question);
          break;
        case "sharedSecret":
          let secret = document.getElementById("secret").value;
          startSMP(context, secret);
          break;
        case "manualVerification":
          manualVerification(context.fingerprint, context);
          break;
        default:
          throw new Error('Unreachable!');
      }
    } else if (mode === "ask") {
      let response = document.getElementById("response").value;
      otr.sendResponse(context, response);
      otr.authUpdate(context, aObject.progress);
    } else {
      throw new Error('Unreachable!');
    }
    return true;
  },

  cancel: function() {
    if (mode === "ask") {
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

};