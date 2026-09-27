// FAS remote control page. Talks to the laptop through the relay; everything
// is end-to-end encrypted (see fascrypto.js).
import * as fc from "./fascrypto.js";
import { PAGE_VERSION } from "./version.js";

const $ = (id) => document.getElementById(id);
const DEFAULT_RELAY = "https://ntfy.sh";

let keys, dev, relay;
let paired = false;
let connLost = false; // relay connection interrupted (EventSource reconnects by itself)

// What the laptop told us about itself. Older FAS versions send no list of
// commands; they accept these.
const DEFAULT_CMDS = ["send", "update", "close", "pause", "random"];
let laptop = { app: "", api: 1, cmds: DEFAULT_CMDS };
let state = null; // latest state from the laptop
let offset = 0; // phone clock minus laptop clock
let lastSeen = 0; // when the last message arrived (phone time)
let lastSeq = 0; // commands need increasing numbers, also across reloads
let armedKey = null, armedUntil = 0; // LIVE: first tap arms, second sends

// Commands waiting for the laptop to confirm them through a state change.
// key -> { since, done(state) }. Their buttons show "Wird übertragen …" and
// stay locked, so nobody taps twice because the answer takes a moment.
const pendingCmds = new Map();
const PENDING_TIMEOUT = 30000;

// --- start ---------------------------------------------------------------

async function main() {
  $("versions").textContent = `Steuerseite v${PAGE_VERSION}`;
  const session = readSession();
  if (!session) {
    status("Bitte den QR-Code in FAS am Laptop scannen (Taste h in der Übungsansicht).", true);
    return;
  }
  relay = session.relay;
  if (!fc.TRANSPORTS.includes(session.v)) {
    status("Diese FAS-Version ist neuer als diese Steuerseite. Bitte die Seite neu laden (ggf. den QR-Code erneut scannen).", true);
    return;
  }
  keys = await fc.deriveKeys(fc.unb64url(session.k));
  dev = await loadDevice();
  subscribe();
  setInterval(render, 1000);
}

// readSession takes the secret from the link and removes it from the address
// bar, so it does not end up in bookmarks, screenshots or the history. It
// stays in this browser tab only (sessionStorage) for reloads.
function readSession() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get("k")) {
    const s = { k: params.get("k"), v: Number(params.get("v") || 1), relay: params.get("r") || DEFAULT_RELAY };
    sessionStorage.setItem("fas-session", JSON.stringify(s));
    history.replaceState(null, "", location.pathname);
    return s;
  }
  const stored = sessionStorage.getItem("fas-session");
  return stored ? { v: 1, ...JSON.parse(stored) } : null;
}

// loadDevice keeps this phone's signing key, so a reload does not need a new
// approval. The key never leaves the phone.
async function loadDevice() {
  const stored = localStorage.getItem("fas-device");
  if (stored) {
    try {
      return await fc.importDevice(JSON.parse(stored));
    } catch {
      /* create a new one */
    }
  }
  const d = await fc.newDevice();
  localStorage.setItem("fas-device", JSON.stringify(await fc.exportDevice(d)));
  return d;
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  return "Browser";
}

// --- relay -----------------------------------------------------------------

function subscribe() {
  const es = new EventSource(`${relay}/${keys.topicDown}/sse`);
  es.onopen = () => {
    connLost = false;
    if (!paired) status("Verbunden mit dem Relay, frage beim Laptop an …");
    post(fc.hello(keys, dev, deviceName(), PAGE_VERSION));
    if (!paired) showPairing();
  };
  es.onerror = () => {
    connLost = true;
    status("Verbindung unterbrochen – versuche es erneut …", true);
  };
  es.onmessage = async (ev) => {
    let m;
    try {
      m = await fc.readDown(keys, JSON.parse(ev.data).message);
    } catch {
      return; // not for us
    }
    lastSeen = Date.now();
    handle(m);
  };
}

async function post(msgPromise) {
  try {
    const res = await fetch(`${relay}/${keys.topicUp}`, {
      method: "POST",
      body: await msgPromise,
      headers: { "X-Firebase": "no" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    toast("Senden an das Relay fehlgeschlagen: " + e.message);
  }
}

function send(c, u) {
  lastSeq = Math.max(Date.now(), lastSeq + 1);
  post(fc.command(keys, dev, lastSeq, c, u));
}

// --- messages from the laptop ----------------------------------------------

function handle(m) {
  switch (m.t) {
    case "pair":
      if (m.id !== dev.id) return;
      learn(m);
      if (!m.ok && m.reason === "page-too-old") {
        paired = false;
        $("pairing").hidden = true;
        $("control").hidden = true;
        status(`Diese Steuerseite (v${PAGE_VERSION}) ist zu alt für FAS v${m.app}. Bitte die Seite neu laden.`, true);
        return;
      }
      if (m.ok) {
        paired = true;
        $("pairing").hidden = true;
        $("control").hidden = false;
        status("Verbunden. Befehle werden direkt an FAS geschickt.");
      } else {
        paired = false;
        $("pairing").hidden = true;
        $("control").hidden = true;
        status("Am Laptop abgelehnt. Für einen neuen Versuch am Laptop einen neuen QR-Code anzeigen.", true);
      }
      break;
    case "state":
      learn(m);
      state = m;
      offset = Date.now() - m.now;
      for (const [key, p] of pendingCmds) if (p.done(state)) pendingCmds.delete(key);
      render();
      break;
    case "err":
      if (m.id === dev.id) {
        pendingCmds.clear(); // the refused command is no longer waiting
        toast(m.msg);
        render();
      }
      break;
  }
}

// learn takes over what the laptop says about its version and commands.
function learn(m) {
  if (m.app) laptop.app = m.app;
  if (m.api) laptop.api = m.api;
  if (Array.isArray(m.cmds)) laptop.cmds = m.cmds;
  $("versions").textContent = `Steuerseite v${PAGE_VERSION}` + (laptop.app ? ` · FAS v${laptop.app}` : "");
}

function can(cmd) {
  return laptop.cmds.includes(cmd);
}

// --- display ---------------------------------------------------------------

function status(text, error = false) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", error);
}

function showPairing() {
  $("pairing").hidden = false;
  $("code").textContent = dev.code;
}

let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 6000);
}

function laptopNow() {
  return Date.now() - offset;
}

function fmt(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

// expect records a command and what state change confirms it.
function expect(key, done) {
  pendingCmds.set(key, { since: Date.now(), done });
  render();
}

function render() {
  if (!state || !paired) return;
  for (const [key, p] of pendingCmds) {
    if (Date.now() - p.since > PENDING_TIMEOUT) {
      pendingCmds.delete(key);
      toast("Keine Rückmeldung vom Laptop. Bitte dort prüfen, ob der Befehl angekommen ist, bevor du ihn wiederholst.");
    }
  }
  if (connLost) {
    status("Verbindung unterbrochen – versuche es erneut …", true);
  } else if (Date.now() - lastSeen > 60000) {
    status("Seit über einer Minute keine Nachricht vom Laptop – läuft FAS noch?", true);
  } else if (pendingCmds.size > 0) {
    status("Befehl gesendet – warte auf Bestätigung vom Laptop …");
  } else {
    status("Verbunden. Befehle werden direkt an FAS geschickt.");
  }
  const mode = $("mode");
  mode.hidden = false;
  mode.textContent = state.live ? "LIVE" : "TESTLAUF";
  mode.className = "mode " + (state.live ? "live" : "test");

  $("clock").textContent = fmt(state.paused ? state.clock : laptopNow() - state.base);
  $("sent").textContent = `${state.sent} / ${state.total}`;
  $("flow").textContent = state.paused ? "Pausiert" : state.mode === "auto" ? "Automatisch" : "Von Hand";
  pendingButton($("pause"), "pause", state.paused ? "Fortsetzen" : "Pause");
  pendingButton($("random"), "random", "Zufallsalarm");
  $("random").hidden = !state.random || !can("random");
  $("pause").hidden = !can("pause");

  const upcoming = [], done = [];
  for (const r of state.rows || []) {
    (["pending", "next", "timed", "sending"].includes(r.s) ? upcoming : done).push(r);
  }
  fill($("upcoming"), upcoming, "Keine weiteren Alarme.");
  fill($("done"), done, "Noch nichts gesendet.");
}

function fill(list, rows, emptyText) {
  list.replaceChildren();
  if (rows.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = emptyText;
    list.append(li);
    return;
  }
  for (const r of rows) list.append(rowItem(r));
}

function rowItem(r) {
  const li = document.createElement("li");
  const head = el("div", "head");
  head.append(el("span", "kw", `${r.l} · ${r.k || "(ohne Stichwort)"}`), el("span", "meta", meta(r)));
  li.append(head, el("div", "addr", r.a || ""));

  const btns = el("div", "btns");
  // Only commands the laptop accepts (older FAS versions may know fewer).
  if (["pending", "next", "timed"].includes(r.s) && can("send")) {
    btns.append(button("Senden", "send", r, true));
  }
  if (["sent", "failed"].includes(r.s)) {
    if (r.s === "failed" && can("send")) btns.append(button("Erneut senden", "send", r));
    if (r.upd === "open" && can("update")) btns.append(button("Lage-Update", "update", r));
    if (can("close")) btns.append(button("Schließen", "close", r));
  }
  if (btns.childElementCount) li.append(btns);
  return li;
}

function meta(r) {
  switch (r.s) {
    case "next":
    case "timed":
      if (!r.due || state.paused) return r.s === "timed" ? "Drehbuch" : "als Nächstes";
      return "in " + fmt(r.due - laptopNow());
    case "sending":
      return "wird gesendet …";
    case "sent":
      return r.upd === "sent" ? "Update gesendet" : "gesendet";
    case "failed":
      return r.i || "Fehler";
    case "closed":
      return "geschlossen";
  }
  return "";
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// pendingButton shows a static button (pause, random) as waiting or normal.
function pendingButton(b, key, text) {
  const waiting = pendingCmds.has(key);
  b.disabled = waiting;
  b.classList.toggle("pending", waiting);
  b.textContent = waiting ? "Wird übertragen …" : text;
}

// button: in LIVE mode the first tap arms the button, the second sends.
// After sending, the button waits until the laptop reports the alarm's new
// state, so a slow update cannot lead to a double send.
function button(text, cmd, r, primary = false) {
  const b = document.createElement("button");
  const key = cmd + ":" + r.u;
  b.type = "button";
  b.textContent = text;
  if (primary) b.className = "primary";
  if (pendingCmds.has(key)) {
    b.disabled = true;
    b.className = "pending";
    b.textContent = "Wird übertragen …";
    return b;
  }
  if (key === armedKey && Date.now() < armedUntil) arm(b);
  b.onclick = () => {
    if (state.live && !(key === armedKey && Date.now() < armedUntil)) {
      armedKey = key;
      armedUntil = Date.now() + 4000;
      render();
      return;
    }
    armedKey = null;
    const before = r.s + "|" + (r.upd || "");
    send(cmd, r.u);
    expect(key, (st) => {
      const now = (st.rows || []).find((x) => x.u === r.u);
      return !now || now.s + "|" + (now.upd || "") !== before;
    });
  };
  return b;
}

function arm(b) {
  b.classList.add("armed");
  b.classList.remove("primary");
  b.textContent = "Wirklich?";
}

$("pause").onclick = () => {
  if (!paired || !state || pendingCmds.has("pause")) return;
  const wasPaused = state.paused;
  send("pause");
  expect("pause", (st) => st.paused !== wasPaused);
};
$("random").onclick = () => {
  if (!paired || !state || pendingCmds.has("random")) return;
  const total = state.total;
  send("random");
  expect("random", (st) => st.total > total);
};

main().catch((e) => status("Fehler: " + e.message, true));
