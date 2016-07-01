var isNode = (typeof process === "object");
var otr;

if (isNode) {
  otr = require("../chrome/content/otr.js");
} else {
  ({ otr } = require("../otr.js"));
}


function FakeConv(sendMsg) {
  this.account = { normalizedName: "test1" };
  this.sendMsg = sendMsg;
}

// Note these tests seem to be run by jpm in lexical order.

exports["test 01 otr init"] = function(assert) {
  assert.ok(!otr.hasRan);
  otr.init();
  assert.ok(otr.hasRan);
};

exports["test 02 send query message"] = function(assert) {
  var msg;
  var sendMsg = function(_msg) { msg = _msg; };
  var conv = new FakeConv(sendMsg);
  var query = "?OTRv2?\n" + conv.account.normalizedName + " has requested " +
    "an Off-the Record private conversation. However, you do not have a " +
    "plugin to support that. " +
    "See http://otr.cypherpunks.ca/ for more information.";
  otr.sendQueryMsg(conv);
  assert.equal(msg, query);
};

exports["test 03 generate a key"] = function(assert, done) {
  var account = "test1";
  var protocol = "protocol1";
  assert.equal(otr.privateKeyFingerprint(account, protocol), null);
  otr.generatePrivateKey(account, protocol).then(function() {
    assert.notEqual(otr.privateKeyFingerprint(account, protocol), null);
    done();
  });
};

exports["test 04 get fingerprint raw"] = function(assert) {
  var account = "test1";
  var protocol = "protocol1";
  var raw = otr.privateKeyFingerprintRaw(account, protocol);
  assert.ok(!raw.isNull());
};


if (isNode) {
  describe.skip("otr", function() {
    Object.keys(exports).forEach(function(key) {
      it(key, exports[key].bind(null, require("assert")));
    });
  });
} else {
  require("sdk/test").run(exports);
}
