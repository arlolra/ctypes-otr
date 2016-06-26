this.EXPORTED_SYMBOLS = ["coniks"];

var { utils: Cu } = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("chrome://otr/content/coniks/context.js");
Cu.import("chrome://otr/content/helpers.js");
Cu.import("chrome://otr/content/otr.js");

function toId(account, protocol) {
  return `${account}@${protocol}`;
}

function accToId(acc) {
  return toId(acc.normalizedName, acc.protocol.normalizedName);
}

var coniks = {
  isEnable: false,
  _contexts: new Map(),

  init: function() {
    return Promise.resolve().then(function() {
      coniks.setPrefs();
      coniks.isEnabled = coniks.prefs.getBoolPref("enabled");
      if (!coniks.isEnabled)
        return;

      for (let acc of helpers.getAccounts()) {
        coniks._contexts.set(accToId(acc), new AccountContext({
          account: acc.normalizedName,
          protocol: acc.protocol.normalizedName,
        }));
      }
      return coniks.loadFiles();
    });
  },

  destroy: function() {
    if (!coniks.isEnabled)
      return;
  },

  onAccountCreated: function(acc) {
    return Promise.resolve().then(function() {
      let account = acc.normalizedName;
      let protocol = acc.protocol.normalizedName;
      let fingerprint = otr.privateKeyFingerprint(account, protocol);
      coniks._contexts.set(accToId(acc), new AccountContext({
        account: account,
        protocol: protocol,
        fingerprint: fingerprint,
      }));
      return coniks.store(coniks._contexts);
    });
  },

  prefs: null,
  setPrefs: function() {
    let branch = "extensions.otr.coniks.";
    let coniksPrefs = {
      enabled: false,
      serverAddress: "111.221.102.190",
      serverPort: 3000
    };
    let defaults = Services.prefs.getDefaultBranch(branch);
    Object.keys(coniksPrefs).forEach(function(key) {
      if (typeof coniksPrefs[key] === "boolean") {
        defaults.setBoolPref(key, coniksPrefs[key]);
      } else {
        defaults.setCharPref(key, coniksPrefs[key]);
      }
    });
    coniks.prefs = Services.prefs.getBranch(branch);
  },

  loadFiles: function() {
    return coniks.load(coniks._contexts);
  },

  getAccountPolicy: function(acc) {
    return coniks._contexts.get(accToId(acc));
  },

  setAccountPolicy: function(acc, policy) {
    let ctx = coniks._contexts.get(accToId(acc));
    ctx.setPolicy(policy);
    return coniks.store(coniks._contexts);
  },

  path: helpers.profilePath("coniks.contexts"),

  load: function(contexts) {
    return helpers.fileExists(coniks.path).then((exists) => {
      if (!exists)
        return;
      return helpers.readTextFile(coniks.path).then(function(data) {
        let ctxs = JSON.parse(data);
        ctxs.forEach(function(c) {
          let acc = toId(c.account, c.protocol);
          if (contexts.has(acc)) {
            let ctx = contexts.get(acc);
            ctx.setPolicy(c);
            ctx.fingerprint = c.fingerprint;
          }
        });
      });
    });
  },

  store: function(contexts) {
    let data = JSON.stringify([...contexts.values()]);
    return helpers.writeTextFile(coniks.path, data);
  },

};
