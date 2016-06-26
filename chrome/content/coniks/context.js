this.EXPORTED_SYMBOLS = ["AccountContext", "ConiksContext"];

var { utils: Cu } = Components;

Cu.import("chrome://otr/content/helpers.js");

class ConiksContext {
  constructor(opts) {
    opts = opts || {};

    if (opts.account === null)
      throw Error("Account should not be nil");

    this.account = opts.account;
    this.setPolicy(opts);
  }

  setPolicy(ctx) {
    this.signedKeyChange = !!ctx.signedKeyChange;
    this.privateLookups = !!ctx.privateLookups;
  }
}

class AccountContext extends ConiksContext {
  constructor(opts) {
    opts = opts || {};

    if (opts.account === null || opts.protocol === null)
      throw Error("Account and protocol should not be nil");

    super(opts);

    if (opts.fingerprint)
      this.fingerprint = opts.fingerprint;

    this.protocol = opts.protocol;
    this.contacts = [];  // array of ConiksContext
    // this.TB = null;
  }
}
