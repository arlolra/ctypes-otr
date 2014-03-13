const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

const CHROME_URI = "chrome://otr/content/";

let consoleService = Cc["@mozilla.org/consoleservice;1"]
                       .getService(Ci.nsIConsoleService);

function log(msg) {
  consoleService.logStringMessage(msg);
}

function ConversationWrapper(prplIConvIM) {
  this._account = prplIConvIM.wrappedJSObject._account;
  this._name = prplIConvIM.name;
  this._observers = [];
  this._conv = prplIConvIM;
}

ConversationWrapper.prototype = {
  __proto__: GenericConvIMPrototype,
  constructor: ConversationWrapper,
  get id() this._conv.id,
  set id(aId) this._conv.id = aId,
  sendMsg: function (aMsg) {
    this._conv.sendMsg(aMsg);
  },
  notifyObservers: function(aSubject, aTopic, aData) {
    for each (let observe in this._observers)
      observe(aSubject, aTopic, aData);
  },
  observe: function (aSubject, aTopic, aData) {
    this.notifyObservers(aSubject, aTopic, aData);
  }
};

let otr, originalAddConversation;
function startup(data, reason) {
  Cu.import(CHROME_URI + "otr.js");
  otr = new OTR();

  otr.loadFiles().then(() => {
    if (otr.privateKeyFingerprint() === null)
      otr.generatePrivateKey();
  }).then(null, function (reason) {
    log("we have an error")
    log(reason)
  });

  let cs = Services.conversations.wrappedJSObject;
  originalAddConversation = cs.addConversation;
  cs.addConversation = function (prplIConvIM) {
    let wrapper = new ConversationWrapper(prplIConvIM);
    prplIConvIM.addObserver(wrapper.observe.bind(wrapper));
    originalAddConversation.call(cs, wrapper);
  };
}

function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN) return;
  if (otr) otr.close();
  Cu.unload(CHROME_URI + "otr.js");

  let cs = Services.conversations.wrappedJSObject;
  cs.addConversation = originalAddConversation;
}

function install(data, reason) {}

function uninstall(data, reason) {}