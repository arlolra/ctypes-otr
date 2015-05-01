const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("chrome://otr/content/otr.js");

XPCOMUtils.defineLazyGetter(this, "_", function()
  l10nHelper("chrome://otr/locale/finger.properties")
);

let fingers;
let fingerTreeView = {
  selection: null,
  rowCount : 0,
  setTree : function(tree) {},
  getImageSrc : function(row, column) {},
  getProgressMode : function(row, column) {},
  getCellValue : function(row, column) {},
  getCellText : function(row, column) {
    let finger = fingers[row];
    return finger[column.id] || "";
  },
  isSeparator : function(index) { return false; },
  isSorted : function() { return false; },
  isContainer : function(index) { return false; },
  cycleHeader : function(column) {},
  getRowProperties : function(row) { return ""; },
  getColumnProperties : function(column) { return ""; },
  getCellProperties : function(row, column) { return ""; },
};

let fingerTree;
let otrFinger = {
  onload: function() {
    fingerTree = document.getElementById("fingerTree");
    fingers = otr.knownFingerprints();
    fingerTreeView.rowCount = fingers.length;
    fingerTree.view = fingerTreeView;
  },
};
