let EXPORTED_SYMBOLS = ["libOTR"];

const { interfaces: Ci, utils: Cu, classes: Cc } = Components;

let Cr = Cc["@mozilla.org/chrome/chrome-registry;1"]
           .getService(Ci.nsIXULChromeRegistry);

Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// load libotr
let uri = "chrome://otr/content/" + ctypes.libraryName("otr");
uri = Cr.convertChromeURL(Services.io.newURI(uri, null, null));
let libotr = ctypes.open(uri.QueryInterface(Ci.nsIFileURL).file.path);

// libotr API version
const otrl_version = [4, 0, 0];

// ABI used to call native functions in the library
const abi = ctypes.default_abi;

function libOTR() {
  // Apply version array as arguments to init function
  if (this.otrl_init.apply(this, otrl_version))
    throw new Error("Couldn't initialize libotr.");
}

// type defs

const time_t = ctypes.long;
const gcry_error_t = ctypes.unsigned_int;
const gcry_cipher_hd_t = ctypes.StructType("gcry_cipher_handle").ptr;
const gcry_md_hd_t = ctypes.StructType("gcry_md_handle").ptr
const gcry_mpi_t = ctypes.StructType("gcry_mpi").ptr;

const otrl_instag_t = ctypes.unsigned_int;
const OtrlPolicy = ctypes.unsigned_int;
const OtrlTLV = ctypes.StructType("s_OtrlTLV");
const ConnContext = ctypes.StructType("context");
const ConnContextPriv = ctypes.StructType("context_priv");
const OtrlMessageAppOps = ctypes.StructType("s_OtrlMessageAppOps");
const OtrlAuthInfo = ctypes.StructType("OtrlAuthInfo");
const Fingerprint = ctypes.StructType("s_fingerprint");
const OtrlUserState = ctypes.StructType("s_OtrlUserState").ptr;
const OtrlSMState = ctypes.StructType("OtrlSMState");
const DH_keypair = ctypes.StructType("DH_keypair");

const OTRL_PRIVKEY_FPRINT_HUMAN_LEN = 45;
const fingerprint_t = ctypes.char.array(OTRL_PRIVKEY_FPRINT_HUMAN_LEN);

const app_data_free_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr
]).ptr;

// enums

const OtrlErrorCode = ctypes.int;
const OtrlSMPEvent = ctypes.int;
const OtrlMessageEvent = ctypes.int;
const OtrlFragmentPolicy = ctypes.int;
const OtrlConvertType = ctypes.int;
const OtrlMessageState = ctypes.int;
const OtrlAuthState = ctypes.int;
const OtrlSessionIdHalf = ctypes.int;
const OtrlSMProgState = ctypes.int;
const NextExpectedSMP = ctypes.int;

// callback signatures

const policy_cb_t = ctypes.FunctionType(abi, OtrlPolicy, [
  ctypes.void_t.ptr, ConnContext.ptr
]).ptr;

const create_privkey_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ctypes.char.ptr, ctypes.char.ptr
]).ptr;

const is_logged_in_cb_t = ctypes.FunctionType(abi, ctypes.int, [
  ctypes.void_t.ptr, ctypes.char.ptr, ctypes.char.ptr, ctypes.char.ptr
]).ptr;

const inject_message_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ctypes.char.ptr, ctypes.char.ptr, ctypes.char.ptr,
  ctypes.char.ptr
]).ptr;

const update_context_list_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr
]).ptr;

const new_fingerprint_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, OtrlUserState, ctypes.char.ptr, ctypes.char.ptr,
  ctypes.char.ptr, ctypes.unsigned_char.array(20)
]).ptr;

const write_fingerprint_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr
]).ptr;

const gone_secure_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ConnContext.ptr
]).ptr;

const gone_insecure_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ConnContext.ptr
]).ptr;

const still_secure_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ConnContext.ptr, ctypes.int
]).ptr;

const max_message_size_cb_t = ctypes.FunctionType(abi, ctypes.int, [
  ctypes.void_t.ptr, ConnContext.ptr
]).ptr;

const account_name_cb_t = ctypes.FunctionType(abi, ctypes.char.ptr, [
  ctypes.void_t.ptr, ctypes.char.ptr, ctypes.char.ptr
]).ptr;

const account_name_free_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ctypes.char.ptr
]).ptr;

const received_symkey_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ConnContext.ptr, ctypes.unsigned_int,
  ctypes.unsigned_char.ptr, ctypes.size_t, ctypes.unsigned_char.ptr
]).ptr;

const otr_error_message_cb_t = ctypes.FunctionType(abi, ctypes.char.ptr, [
  ctypes.void_t.ptr, ConnContext.ptr, OtrlErrorCode
]).ptr;

const otr_error_message_free_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ctypes.char.ptr
]).ptr;

const resent_msg_prefix_cb_t = ctypes.FunctionType(abi, ctypes.char.ptr, [
  ctypes.void_t.ptr, ConnContext.ptr
]).ptr;

const resent_msg_prefix_free_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ctypes.char.ptr
]).ptr;

const handle_smp_event_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, OtrlSMPEvent, ConnContext.ptr, ctypes.unsigned_short,
  ctypes.char.ptr
]).ptr;

const handle_msg_event_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, OtrlMessageEvent, ConnContext.ptr, ctypes.char.ptr,
  gcry_error_t
]).ptr;

const create_instag_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ctypes.char.ptr, ctypes.char.ptr
]).ptr;

const convert_msg_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ConnContext.ptr, OtrlConvertType, ctypes.char.ptr.ptr,
  ctypes.char.ptr
]).ptr;

const convert_free_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ConnContext.ptr, ctypes.char.ptr
]).ptr;

const timer_control_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr, ctypes.unsigned_int
]).ptr;

// defines

Fingerprint.define([
  { next: Fingerprint.ptr },
  { tous: Fingerprint.ptr.ptr },
  { fingerprint: ctypes.unsigned_char.ptr },
  { context: ConnContext.ptr },
  { trust: ctypes.char.ptr }
]);

DH_keypair.define([
  { groupid: ctypes.unsigned_int },
  { priv: gcry_mpi_t },
  { pub: gcry_mpi_t }
]);

OtrlSMState.define([
  { secret: gcry_mpi_t },
  { x2: gcry_mpi_t },
  { x3: gcry_mpi_t },
  { g1: gcry_mpi_t },
  { g2: gcry_mpi_t },
  { g3: gcry_mpi_t },
  { g3o: gcry_mpi_t },
  { p: gcry_mpi_t },
  { q: gcry_mpi_t },
  { pab: gcry_mpi_t },
  { qab: gcry_mpi_t },
  { nextExpected: NextExpectedSMP },
  { received_question: ctypes.int },
  { sm_prog_state: OtrlSMProgState }
]);

OtrlAuthInfo.define([
  { authstate: OtrlAuthState },
  { context: ConnContext.ptr },
  { our_dh: DH_keypair },
  { our_keyid: ctypes.unsigned_int },
  { encgx: ctypes.unsigned_int.ptr },
  { encgx_len: ctypes.size_t },
  { r: ctypes.unsigned_char.array(16) },
  { hashgx: ctypes.unsigned_char.array(32) },
  { their_pub: gcry_mpi_t },
  { their_keyid: ctypes.unsigned_int },
  { enc_c: gcry_cipher_hd_t },
  { enc_cp: gcry_cipher_hd_t },
  { mac_m1: gcry_md_hd_t },
  { mac_m1p: gcry_md_hd_t },
  { mac_m2: gcry_md_hd_t },
  { mac_m2p: gcry_md_hd_t },
  { their_fingerprint: ctypes.unsigned_char.array(20) },
  { initiated: ctypes.int },
  { protocol_version: ctypes.unsigned_int },
  { secure_session_id: ctypes.unsigned_char.array(20) },
  { secure_session_id_len: ctypes.size_t },
  { session_id_half: OtrlSessionIdHalf },
  { lastauthmsg: ctypes.char.ptr },
  { commit_sent_time: time_t }
]);

ConnContext.define([
  { next: ConnContext.ptr },
  { tous: ConnContext.ptr.ptr },
  { context_priv: ConnContextPriv.ptr },
  { username: ctypes.char.ptr },
  { accountname: ctypes.char.ptr },
  { protocol: ctypes.char.ptr },
  { m_context: ConnContext.ptr },
  { recent_rcvd_child: ConnContext.ptr },
  { recent_sent_child: ConnContext.ptr },
  { recent_child: ConnContext.ptr },
  { our_instance: otrl_instag_t },
  { their_instance: otrl_instag_t },
  { msgstate: OtrlMessageState },
  { auth: OtrlAuthInfo },
  { fingerprint_root: Fingerprint },
  { active_fingerprint: Fingerprint.ptr },
  { sessionid: ctypes.unsigned_char.array(20) },
  { sessionid_len: ctypes.size_t },
  { sessionid_half: OtrlSessionIdHalf },
  { protocol_version: ctypes.unsigned_int },
  { otr_offer: ctypes.int },
  { app_data: ctypes.void_t.ptr },
  { app_data_free: app_data_free_t },
  { smstate: OtrlSMState.ptr }
]);

OtrlMessageAppOps.define([
  { policy: policy_cb_t },
  { create_privkey: create_privkey_cb_t },
  { is_logged_in: is_logged_in_cb_t },
  { inject_message: inject_message_cb_t },
  { update_context_list: update_context_list_cb_t },
  { new_fingerprint: new_fingerprint_cb_t },
  { write_fingerprint: write_fingerprint_cb_t },
  { gone_secure: gone_secure_cb_t },
  { gone_insecure: gone_insecure_cb_t },
  { still_secure: still_secure_cb_t },
  { max_message_size: max_message_size_cb_t },
  { account_name: account_name_cb_t },
  { account_name_free: account_name_free_cb_t },
  { received_symkey: received_symkey_cb_t },
  { otr_error_message: otr_error_message_cb_t },
  { otr_error_message_free: otr_error_message_free_cb_t },
  { resent_msg_prefix: resent_msg_prefix_cb_t },
  { resent_msg_prefix_free: resent_msg_prefix_free_cb_t },
  { handle_smp_event: handle_smp_event_cb_t },
  { handle_msg_event: handle_msg_event_cb_t },
  { create_instag: create_instag_cb_t },
  { convert_msg: convert_msg_cb_t },
  { convert_free: convert_free_cb_t },
  { timer_control: timer_control_cb_t }
]);

// policies

const OTRL_POLICY_ALLOW_V1 = 0x01;
const OTRL_POLICY_ALLOW_V2 = 0x02;
const OTRL_POLICY_ALLOW_V3 = 0x04;
const OTRL_POLICY_REQUIRE_ENCRYPTION = 0x08;
const OTRL_POLICY_SEND_WHITESPACE_TAG = 0x10;
const OTRL_POLICY_WHITESPACE_START_AKE = 0x20;
const OTRL_POLICY_ERROR_START_AKE = 0x40;

libOTR.prototype = {

  constructor: libOTR,
  close: () => libotr.close(),

  // proto.h

  OTRL_POLICY_OPPORTUNISTIC: new ctypes.unsigned_int(
    OTRL_POLICY_ALLOW_V2 |
    OTRL_POLICY_ALLOW_V3 |
    OTRL_POLICY_SEND_WHITESPACE_TAG |
    OTRL_POLICY_WHITESPACE_START_AKE |
    OTRL_POLICY_ERROR_START_AKE
  ),

  OTRL_POLICY_ALWAYS: new ctypes.unsigned_int(
    OTRL_POLICY_ALLOW_V2 |
    OTRL_POLICY_ALLOW_V3 |
    OTRL_POLICY_REQUIRE_ENCRYPTION |
    OTRL_POLICY_WHITESPACE_START_AKE |
    OTRL_POLICY_ERROR_START_AKE
  ),

  fragPolicy: {
    OTRL_FRAGMENT_SEND_SKIP: 0,
    OTRL_FRAGMENT_SEND_ALL: 1,
    OTRL_FRAGMENT_SEND_ALL_BUT_FIRST: 2,
    OTRL_FRAGMENT_SEND_ALL_BUT_LAST: 3
  },

  // Initialize the OTR library. Pass the version of the API you are using.
  otrl_init: libotr.declare(
    "otrl_init", abi, gcry_error_t,
    ctypes.uint32_t, ctypes.uint32_t, ctypes.uint32_t
  ),

  // instag.h

  OTRL_INSTAG_BEST: new ctypes.unsigned_int(1),

  // Get a new instance tag for the given account and write to file.
  otrl_instag_generate: libotr.declare(
    "otrl_instag_generate", abi, gcry_error_t,
    OtrlUserState, ctypes.char.ptr, ctypes.char.ptr, ctypes.char.ptr
  ),

  // auth.h

  authState: {
    OTRL_AUTHSTATE_NONE: 0,
    OTRL_AUTHSTATE_AWAITING_DHKEY: 1,
    OTRL_AUTHSTATE_AWAITING_REVEALSIG: 2,
    OTRL_AUTHSTATE_AWAITING_SIG: 3,
    OTRL_AUTHSTATE_V1_SETUP: 4
  },

  // context.h

  messageState: {
    OTRL_MSGSTATE_PLAINTEXT: 0,
    OTRL_MSGSTATE_ENCRYPTED: 1,
    OTRL_MSGSTATE_FINISHED: 2
  },

  // dh.h

  sessionIdHalf: {
    OTRL_SESSIONID_FIRST_HALF_BOLD: 0,
    OTRL_SESSIONID_SECOND_HALF_BOLD: 1
  },

  // sm.h

  nextExpectedSMP: {
    OTRL_SMP_EXPECT1: 0,
    OTRL_SMP_EXPECT2: 1,
    OTRL_SMP_EXPECT3: 2,
    OTRL_SMP_EXPECT4: 3,
    OTRL_SMP_EXPECT5: 4
  },

  smProgState: {
    OTRL_SMP_PROG_OK: 0,
    OTRL_SMP_PROG_CHEATED: -2,
    OTRL_SMP_PROG_FAILED: -1,
    OTRL_SMP_PROG_SUCCEEDED: 1
  },

  // userstate.h

  // Create a new OtrlUserState.
  otrl_userstate_create: libotr.declare(
    "otrl_userstate_create", abi, OtrlUserState
  ),

  // privkey.h

  // Generate a private DSA key for a given account, storing it into a file on
  // disk, and loading it into the given OtrlUserState. Overwrite any
  // previously generated keys for that account in that OtrlUserState.
  otrl_privkey_generate: libotr.declare(
    "otrl_privkey_generate", abi, gcry_error_t,
    OtrlUserState, ctypes.char.ptr, ctypes.char.ptr, ctypes.char.ptr
  ),

  // Read a sets of private DSA keys from a file on disk into the given
  // OtrlUserState.
  otrl_privkey_read: libotr.declare(
    "otrl_privkey_read", abi, gcry_error_t, OtrlUserState, ctypes.char.ptr
  ),

  // Read the fingerprint store from a file on disk into the given
  // OtrlUserState.
  otrl_privkey_read_fingerprints: libotr.declare(
    "otrl_privkey_read_fingerprints", abi, gcry_error_t,
    OtrlUserState, ctypes.char.ptr, ctypes.void_t.ptr, ctypes.void_t.ptr
  ),

  // Write the fingerprint store from a given OtrlUserState to a file on disk.
  otrl_privkey_write_fingerprints: libotr.declare(
    "otrl_privkey_write_fingerprints", abi, gcry_error_t,
    OtrlUserState, ctypes.char.ptr
  ),

  // The length of a string representing a human-readable version of a
  // fingerprint (including the trailing NUL).
  OTRL_PRIVKEY_FPRINT_HUMAN_LEN: OTRL_PRIVKEY_FPRINT_HUMAN_LEN,

  // Human readable fingerprint type
  fingerprint_t: fingerprint_t,

  // Calculate a human-readable hash of our DSA public key. Return it in the
  // passed fingerprint buffer. Return NULL on error, or a pointer to the given
  // buffer on success.
  otrl_privkey_fingerprint: libotr.declare(
    "otrl_privkey_fingerprint", abi, ctypes.char.ptr,
    OtrlUserState, fingerprint_t, ctypes.char.ptr, ctypes.char.ptr
  ),

  // uiOps callbacks
  policy_cb_t: policy_cb_t,
  create_privkey_cb_t: create_privkey_cb_t,
  is_logged_in_cb_t: is_logged_in_cb_t,
  inject_message_cb_t: inject_message_cb_t,
  update_context_list_cb_t: update_context_list_cb_t,
  new_fingerprint_cb_t: new_fingerprint_cb_t,
  write_fingerprint_cb_t: write_fingerprint_cb_t,
  gone_secure_cb_t: gone_secure_cb_t,
  gone_insecure_cb_t: gone_insecure_cb_t,
  still_secure_cb_t: still_secure_cb_t,
  max_message_size_cb_t: max_message_size_cb_t,
  account_name_cb_t: account_name_cb_t,
  account_name_free_cb_t: account_name_free_cb_t,
  received_symkey_cb_t: received_symkey_cb_t,
  otr_error_message_cb_t: otr_error_message_cb_t,
  otr_error_message_free_cb_t: otr_error_message_free_cb_t,
  resent_msg_prefix_cb_t: resent_msg_prefix_cb_t,
  resent_msg_prefix_free_cb_t: resent_msg_prefix_free_cb_t,
  handle_smp_event_cb_t: handle_smp_event_cb_t,
  handle_msg_event_cb_t: handle_msg_event_cb_t,
  create_instag_cb_t: create_instag_cb_t,
  convert_msg_cb_t: convert_msg_cb_t,
  convert_free_cb_t: convert_free_cb_t,
  timer_control_cb_t: timer_control_cb_t,

  // message.h

  OtrlMessageAppOps: OtrlMessageAppOps,

  errorCode: {
    OTRL_ERRCODE_NONE: 0,
    OTRL_ERRCODE_ENCRYPTION_ERROR: 1,
    OTRL_ERRCODE_MSG_NOT_IN_PRIVATE: 2,
    OTRL_ERRCODE_MSG_UNREADABLE: 3,
    OTRL_ERRCODE_MSG_MALFORMED: 4
  },

  smpEvent: {
    OTRL_SMPEVENT_NONE: 0,
    OTRL_SMPEVENT_ERROR: 1,
    OTRL_SMPEVENT_ABORT: 2,
    OTRL_SMPEVENT_CHEATED: 3,
    OTRL_SMPEVENT_ASK_FOR_ANSWER: 4,
    OTRL_SMPEVENT_ASK_FOR_SECRET: 5,
    OTRL_SMPEVENT_IN_PROGRESS: 6,
    OTRL_SMPEVENT_SUCCESS: 7,
    OTRL_SMPEVENT_FAILURE: 8
  },

  messageEvent: {
    OTRL_MSGEVENT_NONE: 0,
    OTRL_MSGEVENT_ENCRYPTION_REQUIRED: 1,
    OTRL_MSGEVENT_ENCRYPTION_ERROR: 2,
    OTRL_MSGEVENT_CONNECTION_ENDED: 3,
    OTRL_MSGEVENT_SETUP_ERROR: 4,
    OTRL_MSGEVENT_MSG_REFLECTED: 5,
    OTRL_MSGEVENT_MSG_RESENT: 6,
    OTRL_MSGEVENT_RCVDMSG_NOT_IN_PRIVATE: 7,
    OTRL_MSGEVENT_RCVDMSG_UNREADABLE: 8,
    OTRL_MSGEVENT_RCVDMSG_MALFORMED: 9,
    OTRL_MSGEVENT_LOG_HEARTBEAT_RCVD: 10,
    OTRL_MSGEVENT_LOG_HEARTBEAT_SENT: 11,
    OTRL_MSGEVENT_RCVDMSG_GENERAL_ERR: 12,
    OTRL_MSGEVENT_RCVDMSG_UNENCRYPTED: 13,
    OTRL_MSGEVENT_RCVDMSG_UNRECOGNIZED: 14,
    OTRL_MSGEVENT_RCVDMSG_FOR_OTHER_INSTANCE: 15
  },

  convertType: {
    OTRL_CONVERT_SENDING: 0,
    OTRL_CONVERT_RECEIVING: 1
  },

  // Deallocate a message allocated by other otrl_message_* routines.
  otrl_message_free: libotr.declare(
    "otrl_message_free", abi, ctypes.void_t, ctypes.char.ptr
  ),

  otrl_message_sending: libotr.declare(
    "otrl_message_sending", abi, gcry_error_t,
    OtrlUserState,
    OtrlMessageAppOps.ptr,
    ctypes.void_t.ptr,
    ctypes.char.ptr,
    ctypes.char.ptr,
    ctypes.char.ptr,
    otrl_instag_t,
    ctypes.char.ptr,
    OtrlTLV.ptr,
    ctypes.char.ptr.ptr,
    OtrlFragmentPolicy,
    ConnContext.ptr.ptr,
    ctypes.void_t.ptr,
    ctypes.void_t.ptr
  ),

  otrl_message_receiving: libotr.declare(
    "otrl_message_receiving", abi, ctypes.int,
    OtrlUserState,
    OtrlMessageAppOps.ptr,
    ctypes.void_t.ptr,
    ctypes.char.ptr,
    ctypes.char.ptr,
    ctypes.char.ptr,
    ctypes.char.ptr,
    ctypes.char.ptr.ptr,
    OtrlTLV.ptr.ptr,
    ConnContext.ptr,
    ctypes.void_t.ptr,
    ctypes.void_t.ptr
  )

};