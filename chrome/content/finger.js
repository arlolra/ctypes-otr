var { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("chrome://otr/content/otr.js");

var authDialog = "chrome://otr/content/auth.xul";

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://otr/locale/finger.properties")
);

var fingers;
var fingerTreeView = {
  selection: null,
  rowCount: 0,
  setTree: function(tree) {},
  getImageSrc: function(row, column) {},
  getProgressMode: function(row, column) {},
  getCellValue: function(row, column) {},
  getCellText: function(row, column) {
    let finger = fingers[row];
    switch(column.id) {
    case "verified":
      return finger.trust ? _("verified.yes") : _("verified.no");
    case "protocol":
      return otr.protocolName(finger.protocol);
    default:
      return finger[column.id] || "";
    }
  },
  isSeparator: function(index) { return false; },
  isSorted: function() { return false; },
  isContainer: function(index) { return false; },
  cycleHeader: function(column) {},
  getRowProperties: function(row) { return ""; },
  getColumnProperties: function(column) { return ""; },
  getCellProperties: function(row, column) { return ""; },
};

function getSelections(tree) {
  let selections = [];
  let select = tree.view.selection;
  if (select) {
    let count = select.getRangeCount();
    let min = {};
    let max = {};
    for (let i = 0; i < count; i++) {
      select.getRangeAt(i, min, max);
      for (let k = min.value; k <= max.value; k++) {
        if (k != -1)
          selections[selections.length] = k;
      }
    }
  }
  return selections;
}

var fingerTree;
var otrFinger = {

  onload: function() {
    fingerTree = document.getElementById("fingerTree");
    fingers = otr.knownFingerprints();
    fingerTreeView.rowCount = fingers.length;
    fingerTree.view = fingerTreeView;
  },

  select: function() {
    let selections = getSelections(fingerTree);
    document.getElementById("verify").disabled = (selections.length !== 1);
    document.getElementById("remove").disabled = !selections.length;
  },

  remove: function() {
    fingerTreeView.selection.selectEventsSuppressed = true;
    // mark fingers for removal
    getSelections(fingerTree).forEach(function(sel) {
      fingers[sel].purge = true;
    });
    otr.forgetFingerprints(fingers);  // will null out removed fingers
    for (let j = 0; j < fingers.length; j++) {
      if (fingers[j] === null) {
        let k = j;
        while (k < fingers.length && fingers[k] === null)
          k++;
        fingers.splice(j, k - j);
        fingerTreeView.rowCount -= k - j;
        fingerTree.treeBoxObject.rowCountChanged(j, j - k);  // negative
      }
    }
    fingerTreeView.selection.selectEventsSuppressed = false;
  },

  verify: function() {
    fingerTreeView.selection.selectEventsSuppressed = true;
    let selections = getSelections(fingerTree);
    if (selections.length !== 1)
      return;
    let row = selections[0];
    let finger = fingers[row];
    let features = "modal,centerscreen,resizable=no,minimizable=no";
    let name = "auth=" + finger.screenname;
    let uiConv = null;
    try {
      uiConv = otr.getUIConvForRecipient(
        finger.account,
        finger.protocol,
        finger.screenname
      );
    } catch (e) {}
    let win = window.openDialog(authDialog, name, features, (uiConv ? "start" : "pref"), uiConv, finger);
    finger.trust = otr.isFingerprintTrusted(finger.fpointer);
    if (uiConv) {
      let context = otr.getContext(uiConv.target);
      finger.status = otr.getStatus(otr.getTrustLevel(context));
    }
    fingerTree.treeBoxObject.invalidateRow(row);
    fingerTreeView.selection.selectEventsSuppressed = false;
  },

};
