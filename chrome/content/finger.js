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
  rowCount: 0,
  setTree: function(tree) {},
  getImageSrc: function(row, column) {},
  getProgressMode: function(row, column) {},
  getCellValue: function(row, column) {},
  getCellText: function(row, column) {
    let finger = fingers[row];
    return finger[column.id] || "";
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
    let min = new Object();
    let max = new Object();
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

let fingerTree;
let otrFinger = {

  onload: function() {
    fingerTree = document.getElementById("fingerTree");
    fingers = otr.knownFingerprints();
    fingerTreeView.rowCount = fingers.length;
    fingerTree.view = fingerTreeView;
  },

  select: function() {
    let selections = getSelections(fingerTree);
    if (selections.length)
      document.getElementById("remove").removeAttribute("disabled");
    else
      document.getElementById("remove").setAttribute("disabled", "true");
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

};
