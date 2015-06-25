importScripts("resource://gre/modules/workers/require.js");

let PromiseWorker = require("resource://gre/modules/workers/PromiseWorker.js");

let Funcs = {};

// Only what we need from libotr.js
Funcs.generateKey = function(path, otrl_version, newkeySource) {
  let newkey = eval(newkeySource);
  let libotr = ctypes.open(path);

  let abi = ctypes.default_abi;
  let gcry_error_t = ctypes.unsigned_int;

  // Initialize the OTR library. Pass the version of the API you are using.
  let otrl_init = libotr.declare(
    "otrl_init", abi, gcry_error_t,
    ctypes.unsigned_int, ctypes.unsigned_int, ctypes.unsigned_int
  );

  // Do the private key generation calculation. You may call this from a
  // background thread.  When it completes, call
  // otrl_privkey_generate_finish from the _main_ thread.
  let otrl_privkey_generate_calculate = libotr.declare(
    "otrl_privkey_generate_calculate", abi, gcry_error_t,
    ctypes.void_t.ptr
  );

  otrl_init.apply(libotr, otrl_version);
  let err = otrl_privkey_generate_calculate(newkey);
  libotr.close();
  return err;
};

let worker = new PromiseWorker.AbstractWorker();

worker.dispatch = function(method, args = []) {
  return Funcs[method](...args);
};

worker.postMessage = function(res, ...args) {
  self.postMessage(res, ...args);
};

worker.close = function() {
  self.close();
};

self.addEventListener("message", msg => worker.handleMessage(msg));
