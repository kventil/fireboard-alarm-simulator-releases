// Protocol version 1 of the FAS remote control, phone side.
// Must match internal/remote/crypto.go. Uses only the browser's WebCrypto.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const LABEL_UP = "fas-up-v1";
export const LABEL_DOWN = "fas-down-v1";

// Versions, see internal/remote/remote.go: TRANSPORTS are the encryption and
// relay schemes this page speaks (v= in the QR code), API_LEVEL the level of
// messages and commands.
export const TRANSPORTS = [1];
export const API_LEVEL = 1;

export function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function sha256(label, data) {
  const buf = new Uint8Array(label.length + data.length);
  buf.set(enc.encode(label));
  buf.set(data, label.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}

// deriveKeys turns the 32-byte secret from the QR code into the encryption
// key and the two relay topics.
export async function deriveKeys(secret) {
  if (secret.length !== 32) throw new Error("secret must be 32 bytes");
  const raw = await sha256("fas-enc-v1", secret);
  return {
    aes: await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]),
    topicUp: "fas-" + b64url(await sha256(LABEL_UP, secret)).slice(0, 28),
    topicDown: "fas-" + b64url(await sha256(LABEL_DOWN, secret)).slice(0, 28),
  };
}

export async function seal(keys, label, plaintext) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: enc.encode(label) }, keys.aes, plaintext),
  );
  const out = new Uint8Array(12 + ct.length);
  out.set(nonce);
  out.set(ct, 12);
  return b64url(out);
}

export async function open(keys, label, msg) {
  const raw = unb64url(msg);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.slice(0, 12), additionalData: enc.encode(label) },
    keys.aes,
    raw.slice(12),
  );
  return new Uint8Array(pt);
}

// Device keys: each phone signs its commands with its own P-256 key.

export async function newDevice() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return deviceFromPair(pair);
}

export async function exportDevice(dev) {
  return { priv: await crypto.subtle.exportKey("jwk", dev.priv), pub: b64url(dev.raw) };
}

export async function importDevice(stored) {
  const priv = await crypto.subtle.importKey("jwk", stored.priv, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  return describe(priv, unb64url(stored.pub));
}

async function deviceFromPair(pair) {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return describe(pair.privateKey, raw);
}

// describe computes the device id and the 4-digit pairing code, exactly as
// the laptop does, so both screens show the same code.
async function describe(priv, raw) {
  const sum = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  const n = ((sum[0] << 24) >>> 0) + (sum[1] << 16) + (sum[2] << 8) + sum[3];
  return { priv, raw, id: b64url(sum).slice(0, 16), code: String(n % 10000).padStart(4, "0") };
}

async function signed(keys, dev, payload) {
  const p = JSON.stringify(payload);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, dev.priv, enc.encode(p)));
  return seal(keys, LABEL_UP, enc.encode(JSON.stringify({ p, s: b64url(sig) })));
}

export function hello(keys, dev, name, page) {
  return signed(keys, dev, { t: "hello", dev: b64url(dev.raw), name, page, api: API_LEVEL });
}

export function command(keys, dev, seq, c, u) {
  return signed(keys, dev, { t: "cmd", id: dev.id, seq, c, u: u || "" });
}

export async function readDown(keys, msg) {
  return JSON.parse(dec.decode(await open(keys, LABEL_DOWN, msg)));
}
