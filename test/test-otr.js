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

exports["test otr init"] = function(assert) {
  assert.ok(!otr.hasRan);
  otr.init();
  assert.ok(otr.hasRan);
};

exports["test send query message"] = function(assert) {
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


if (isNode) {
  describe.skip("otr", function() {
    Object.keys(exports).forEach(function(key) {
      it(key, exports[key].bind(null, require("assert")));
    });
  });
} else {
  require("sdk/test").run(exports);
}
