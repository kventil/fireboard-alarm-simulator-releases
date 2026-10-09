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
let lastDownSeq = 0; // highest laptop message number seen; older or equal ones are replays
let ended = false; // laptop said "bye"
let es = null; // the EventSource
let disconnected = false; // user tapped "Trennen"
let restored = false; // session came from storage, not from a fresh QR scan
let restoredNotice = false; // show "Wieder verbunden" until the first message
let startedAt = Date.now();
let lastWrite = 0; // when lastContact was last stored
let discArmedUntil = 0;
const SESSION_TTL = 60 * 60 * 1000; // 1 hour, counted from the last contact (sliding)
const WRITE_EVERY = 30 * 1000;
const NO_CONTACT = 60 * 1000;
const RESTART_HINT = " Wurde FAS am Laptop neu gestartet? Dann QR-Code neu scannen.";
let lastSeq = 0; // commands need increasing numbers, also across reloads
let armedKey = null, armedUntil = 0; // LIVE: first tap arms, second sends
const expanded = new Set(); // uniqueIds of cards opened to show their details

// Commands waiting for the laptop to confirm them through a state change.
// key -> { since, done(state) }. Their buttons show "Wird übertragen …" and
// stay locked, so nobody taps twice because the answer takes a moment.
const pendingCmds = new Map();
const PENDING_TIMEOUT = 30000;

// Notices for alarms that went out while nobody looked at the phone.
let prevRows = null; // rows of the previous state of this connection; null = none yet
let vibrationOn = true;
try {
  vibrationOn = localStorage.getItem("fas-vibrate") !== "off";
} catch {
  /* default on */
}

// --- start ---------------------------------------------------------------

async function main() {
  if (top !== self) {
    document.body.replaceChildren(el("p", "", "Diese Seite kann nicht eingebettet werden."));
    return;
  }
  $("versions").textContent = `Steuerseite v${PAGE_VERSION}`;
  $("disconnect").onclick = onDisconnect;
  const session = readSession();
  if (!session) {
    if (expiredMsg) status(expiredMsg, true);
    else status("Bitte den QR-Code in FAS am Laptop scannen (Taste h in der Übungsansicht).", true);
    return;
  }
  if (restored) {
    restoredNotice = true;
    status("Wieder verbunden mit der Übung");
  }
  $("disconnect").hidden = false;
  relay = session.relay;
  currentSession = session;
  if (!fc.TRANSPORTS.includes(session.v)) {
    status("Diese FAS-Version ist neuer als diese Steuerseite. Bitte die Seite neu laden (ggf. den QR-Code erneut scannen).", true);
    return;
  }
  keys = await fc.deriveKeys(fc.unb64url(session.k));
  lastDownSeq = 0; // new key = new laptop session = new numbering
  ended = false;
  dev = await loadDevice();
  subscribe();
  setInterval(render, 1000);
}

// readSession takes the secret from the link and removes it from the address
// bar, so it does not end up in bookmarks, screenshots or the history. The
// session is kept in localStorage for SESSION_TTL after the last contact, so
// the page can be reopened without scanning the QR code again.
let expiredMsg = "";
function readSession() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get("k")) {
    // A fresh scan always wins over a stored session.
    const s = { k: params.get("k"), v: Number(params.get("v") || 1), relay: params.get("r") || DEFAULT_RELAY };
    saveSession(s, Date.now());
    history.replaceState(null, "", location.pathname);
    return s;
  }
  let stored = null;
  try {
    stored = localStorage.getItem("fas-session");
    const old = sessionStorage.getItem("fas-session"); // migrate from older page versions
    if (old) {
      sessionStorage.removeItem("fas-session");
      if (!stored) {
        stored = JSON.stringify({ ...JSON.parse(old), lastContact: Date.now() });
        localStorage.setItem("fas-session", stored);
      }
    }
  } catch {
    /* storage unavailable (private mode) */
  }
  if (!stored) return null;
  let s;
  try {
    s = JSON.parse(stored);
    if (typeof s.k !== "string") throw new Error("bad");
  } catch {
    clearSession();
    return null;
  }
  if (!(Date.now() - s.lastContact < SESSION_TTL)) {
    clearSession();
    expiredMsg = "Die Verbindung ist abgelaufen (über 1 Stunde ohne Kontakt). QR-Code am Laptop neu scannen – Taste h.";
    return null;
  }
  restored = true;
  return { v: 1, relay: DEFAULT_RELAY, ...s };
}

function saveSession(s, lastContact) {
  lastWrite = Date.now();
  try {
    localStorage.setItem("fas-session", JSON.stringify({ k: s.k, v: s.v, relay: s.relay, lastContact }));
  } catch {
    /* not persisted */
  }
}

function clearSession() {
  try {
    localStorage.removeItem("fas-session");
    sessionStorage.removeItem("fas-session");
  } catch {
    /* ignore */
  }
}

// Updates lastContact, at most once per WRITE_EVERY.
let currentSession = null;
function touchSession() {
  if (!currentSession || Date.now() - lastWrite < WRITE_EVERY) return;
  saveSession(currentSession, Date.now());
}

// onDisconnect: first tap asks, second tap disconnects. The device key
// (fas-device) is kept on purpose: the laptop still knows this phone, so a
// later scan needs no new approval.
function onDisconnect() {
  const b = $("disconnect");
  if (Date.now() < discArmedUntil) {
    discArmedUntil = 0;
    disconnected = true;
    clearSession();
    currentSession = null;
    if (es) es.close();
    pendingCmds.clear();
    paired = false;
    state = null;
    while (layers.length) closeTopLayer();
    $("pairing").hidden = true;
    $("control").hidden = true;
    b.hidden = true;
    status("Getrennt. Zum erneuten Verbinden den QR-Code scannen.", true);
    return;
  }
  discArmedUntil = Date.now() + 4000;
  b.classList.add("armed");
  b.textContent = "Verbindung zum Laptop trennen? Nochmal tippen";
  setTimeout(() => {
    if (Date.now() >= discArmedUntil && !disconnected) {
      discArmedUntil = 0;
      b.classList.remove("armed");
      b.textContent = "Trennen";
    }
  }, 4100);
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
  es = new EventSource(`${relay}/${keys.topicDown}/sse`);
  es.onopen = () => {
    connLost = false;
    prevRows = null; // after (re)connecting the first state is only a baseline
    if (!paired && !restoredNotice) status("Verbunden mit dem Relay, frage beim Laptop an …");
    post(fc.hello(keys, dev, deviceName(), PAGE_VERSION));
    if (!paired) showPairing();
  };
  es.onerror = () => {
    if (disconnected) return;
    connLost = true;
    status("Verbindung unterbrochen – versuche es erneut …", true);
  };
  es.onmessage = async (ev) => {
    if (disconnected) return;
    let m;
    try {
      m = await fc.readDown(keys, JSON.parse(ev.data).message);
    } catch {
      return; // not for us
    }
    if (typeof m.seq !== "number" || m.seq <= lastDownSeq) return; // replay or reordered
    lastDownSeq = m.seq;
    lastSeen = Date.now();
    restoredNotice = false;
    touchSession();
    handle(m);
  };
}

// post publishes a message; it resolves to false (after a toast) when the
// relay did not take it.
async function post(msgPromise) {
  try {
    const res = await fetch(`${relay}/${keys.topicUp}`, {
      method: "POST",
      body: await msgPromise,
      headers: { "X-Firebase": "no" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (e) {
    toast("Senden an das Relay fehlgeschlagen: " + e.message);
    return false;
  }
}

// send sends command c for alarm u; x is the text of a note.
function send(c, u, x) {
  lastSeq = Math.max(Date.now(), lastSeq + 1);
  return post(fc.command(keys, dev, lastSeq, c, u, x));
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
      announce(m);
      for (const [key, p] of pendingCmds) if (p.done(state)) pendingCmds.delete(key);
      render();
      break;
    case "err":
      if (m.id === dev.id) {
        pendingCmds.clear(); // the refused command is no longer waiting
        if (noteWait) noteFailed(String(m.msg || "Vom Laptop abgelehnt."));
        else toast(m.msg);
        render();
      }
      break;
    case "ok": // a command without visible effect in the state, e.g. a note
      if (m.id === dev.id && noteWait) noteSaved(String(m.msg || "Gespeichert"));
      break;
    case "detail":
      if (m.id === dev.id && sheet.uid && m.u === sheet.uid && m.d && typeof m.d === "object") {
        sheet.data = m.d;
        sheet.loading = false;
        renderSheet();
      }
      break;
    case "bye":
      // before cancelling; today it sends nothing and the phone only notices
      // after 60 s without messages.
      ended = true;
      clearSession();
      currentSession = null;
      pendingCmds.clear();
      render();
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

// Notes and the detail sheet need API level 2 on the laptop; older FAS
// versions neither list nor accept these commands.
function canNotes() {
  return laptop.api >= 2 && can("note");
}
function canDetail() {
  return laptop.api >= 2 && can("detail");
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
function toast(text, ok = false) {
  const el = $("toast");
  el.textContent = text;
  el.classList.toggle("ok", ok);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 6000);
}

// announce compares the rows with the previous state and tells about alarms
// that newly were sent or failed (not those caused by this phone's command).
function announce(st) {
  const old = prevRows;
  prevRows = new Map((st.rows || []).map((r) => [r.u, r]));
  if (!old) return;
  const own = (u) => [...pendingCmds.keys()].some((k) => k.endsWith(":" + u));
  const ok = [], bad = [], upd = [];
  for (const r of st.rows || []) {
    const o = old.get(r.u);
    if (!o || own(r.u)) continue;
    if (r.s === "sent" && o.s !== "sent") ok.push(r);
    else if (r.s === "failed" && o.s !== "failed") bad.push(r);
    else if (r.upd === "sent" && o.upd !== "sent") upd.push(r);
  }
  const n = ok.length + bad.length + upd.length;
  if (n === 0) return;
  let text;
  if (n > 1) {
    text = bad.length ? `${n} Meldungen, davon ${bad.length} Fehler` : `${n} Alarme gesendet`;
  } else if (bad.length) {
    text = `${bad[0].l} Fehler: ${bad[0].k || "(ohne Stichwort)"}${bad[0].i ? " (" + bad[0].i + ")" : ""}`;
  } else if (ok.length) {
    text = `${ok[0].l} gesendet: ${ok[0].k || "(ohne Stichwort)"}`;
  } else {
    text = `${upd[0].l} Lage-Update gesendet`;
  }
  notice(text, bad.length > 0);
}

let noticeTimer;
function notice(text, failed) {
  const e = $("notice");
  e.textContent = text;
  e.classList.toggle("failed", failed);
  e.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (e.hidden = true), 6000);
  if (vibrationOn && typeof navigator.vibrate === "function") {
    navigator.vibrate(failed ? [100, 80, 100, 80, 300] : 200);
  }
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
  if (disconnected) return;
  if (restored && !lastSeen && !ended && Date.now() - startedAt > NO_CONTACT) {
    status("Seit über einer Minute keine Nachricht vom Laptop." + RESTART_HINT, true);
    return;
  }
  if (!state || !paired) return;
  for (const [key, p] of pendingCmds) {
    if (Date.now() - p.since > PENDING_TIMEOUT) {
      pendingCmds.delete(key);
      toast("Keine Rückmeldung vom Laptop. Bitte dort prüfen, ob der Befehl angekommen ist, bevor du ihn wiederholst.");
    }
  }
  if (ended) {
    status("Übung am Laptop beendet.", true);
  } else if (connLost) {
    status("Verbindung unterbrochen – versuche es erneut …", true);
  } else if (Date.now() - lastSeen > NO_CONTACT) {
    status("Seit über einer Minute keine Nachricht vom Laptop – läuft FAS noch?" + (restored ? RESTART_HINT : ""), true);
  } else if (pendingCmds.size > 0) {
    status("Befehl gesendet – warte auf Bestätigung vom Laptop …");
  } else {
    status("Verbunden. Befehle werden direkt an FAS geschickt.");
  }
  const mode = $("mode");
  mode.hidden = false;
  mode.textContent = state.live ? "LIVE" : "TESTLAUF";
  mode.className = "mode " + (state.live ? "live" : "test");

  $("clock").textContent = fmt(state.paused ? state.clock || 0 : laptopNow() - state.base);
  $("sent").textContent = `${state.sent} / ${state.total}`;
  $("flow").textContent = state.waiting ? "Noch nicht gestartet" : state.paused ? "Pausiert" : state.mode === "auto" ? "Automatisch" : "Von Hand";
  pendingButton($("pause"), "pause", state.waiting ? "Übung starten" : state.paused ? "Fortsetzen" : "Pause");
  pendingButton($("random"), "random", "Zufallsalarm");
  $("random").hidden = !state.random || !can("random");
  $("pause").hidden = !can("pause");
  $("note").hidden = !canNotes();

  const upcoming = [], done = [];
  for (const r of state.rows || []) {
    (["pending", "next", "timed", "sending"].includes(r.s) ? upcoming : done).push(r);
  }
  // The laptop caps both lists; the totals tell how many are not shown.
  // "Done" is sent + failed (closed rows are not counted, so this can be
  // slightly high); upcoming is everything not yet sent or failed.
  const moreUp = state.total - state.sent - state.failed - upcoming.length;
  const moreDone = state.sent + state.failed - done.length;
  fill($("upcoming"), upcoming, "Keine weiteren Alarme.", moreUp);
  fill($("done"), done, "Noch nichts gesendet.", moreDone);
  renderSheet();
  for (const b of document.querySelectorAll("#control button, #sheet-body button, #note-save")) if (ended) b.disabled = true;
}

function fill(list, rows, emptyText, more = 0) {
  list.replaceChildren();
  if (rows.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = emptyText;
    list.append(li);
    return;
  }
  for (const r of rows) list.append(rowItem(r));
  if (more > 0) list.append(el("li", "empty", `… und ${more} weitere`));
}

// Hints for common failure infos (r.i, e.g. "HTTP 401").
const HINTS = [
  [/\b40[13]\b/, "AuthKey prüfen"],
  [/^(HTTP )?0$|keine Verbindung/i, "Laptop hat keine Verbindung zu Fireboard"],
];
function hint(info) {
  const h = HINTS.find(([re]) => re.test(info || ""));
  return h ? h[1] : "";
}

function rowItem(r) {
  const li = document.createElement("li");
  const head = el("div", "head");
  head.append(el("span", "kw", `${r.l} · ${r.k || "(ohne Stichwort)"}`), el("span", "meta", meta(r)));
  li.append(head, el("div", "addr", r.a || ""));
  if (r.s === "failed" && hint(r.i)) li.append(el("div", "hint", hint(r.i)));
  if (canDetail()) {
    li.classList.add("expandable");
    head.querySelector(".kw").prepend(el("span", "chevron", "› "));
    li.onclick = (ev) => {
      if (!ev.target.closest("button")) openSheet(r);
    };
  } else {
    details(li, head, r); // older FAS: what the state has, in the card
  }
  const btns = actionButtons(r);
  if (btns.childElementCount) li.append(btns);
  return li;
}

// actionButtons are the commands that apply to alarm r, as on its card.
function actionButtons(r) {
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
  return btns;
}

// details makes a card with Meldebild, Melder or Regie tappable: a tap
// outside the buttons opens or closes them. The laptop may leave the details
// out when its message would get too big.
function details(li, head, r) {
  const lines = [["Meldebild", r.sit], ["Melder", r.rep], ["Regie", r.note]].filter(([, v]) => v);
  if (lines.length === 0) return;
  const open = expanded.has(r.u);
  li.classList.add("expandable");
  li.setAttribute("aria-expanded", String(open));
  head.querySelector(".kw").prepend(el("span", "chevron", open ? "▾ " : "▸ "));
  if (open) {
    const box = el("div", "details");
    for (const [label, text] of lines) {
      const line = el("div", label === "Regie" ? "detail regie" : "detail");
      line.append(el("span", "label", label), el("span", "text", text));
      box.append(line);
    }
    li.append(box);
  }
  li.onclick = (ev) => {
    if (ev.target.closest("button")) return;
    if (expanded.has(r.u)) expanded.delete(r.u);
    else expanded.add(r.u);
    render();
  };
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
    if (ended) return;
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

$("vibrate").checked = vibrationOn;
$("vibrate").onchange = () => {
  vibrationOn = $("vibrate").checked;
  try {
    localStorage.setItem("fas-vibrate", vibrationOn ? "on" : "off");
  } catch {
    /* not persisted */
  }
};

// --- in-page views: detail sheet and note composer -------------------------
//
// Each open view adds an entry to the browser history (same address, no
// hash: the hash carries the session key), so the back gesture closes it.
// Esc and the buttons go back the same way.

const layers = []; // open views, last on top: { name, hide() }

function openLayer(name, show, hide) {
  if (layers.some((l) => l.name === name)) return;
  layers.push({ name, hide });
  try {
    history.pushState({ fasLayer: layers.length }, "");
  } catch {
    /* no history: buttons and Esc still close it */
  }
  show();
  document.body.classList.add("layer-open");
}

function closeTopLayer() {
  const l = layers.pop();
  if (l) l.hide();
  if (layers.length === 0) document.body.classList.remove("layer-open");
}

// requestClose closes the top view through the history, so the entry it
// added is used up; popstate does the closing.
function requestClose() {
  if (layers.length === 0) return;
  if (history.state && history.state.fasLayer === layers.length) history.back();
  else closeTopLayer();
}

window.addEventListener("popstate", (ev) => {
  const keep = (ev.state && ev.state.fasLayer) || 0;
  while (layers.length > keep) closeTopLayer();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && layers.length) {
    ev.preventDefault();
    requestClose();
  }
});

// Detail sheet: shows at once what the state has, asks the laptop for the
// rest (command detail) and fills it in when the answer comes.
const sheet = { uid: "", row: null, data: null, loading: false, since: 0 };
const DETAIL_TIMEOUT = 20000;

function openSheet(r) {
  sheet.uid = r.u;
  sheet.row = r;
  sheet.data = null;
  sheet.loading = true;
  sheet.since = Date.now();
  openLayer(
    "sheet",
    () => {
      $("sheet").hidden = false;
      $("sheet").scrollTop = 0;
      $("sheet-close").focus();
    },
    () => {
      $("sheet").hidden = true;
      sheet.uid = "";
      sheet.data = null;
    },
  );
  renderSheet();
  send("detail", r.u).then((ok) => {
    if (!ok && sheet.uid === r.u) {
      sheet.loading = false;
      renderSheet();
    }
  });
}

function renderSheet() {
  if (!sheet.uid || $("sheet").hidden) return;
  const live = state && (state.rows || []).find((x) => x.u === sheet.uid);
  if (live) sheet.row = live;
  const r = sheet.row || {};
  const d = sheet.data || {};
  if (sheet.loading && Date.now() - sheet.since > DETAIL_TIMEOUT) sheet.loading = false;
  $("sheet-title").textContent = `${d.l || r.l || ""} · ${d.k || r.k || "(ohne Stichwort)"}`;

  const body = $("sheet-body");
  const box = document.createDocumentFragment();
  const field = (label, text, cls = "") => {
    if (!text) return null;
    const line = el("div", "detail" + (cls ? " " + cls : ""));
    line.append(el("span", "label", label), el("span", "text", text));
    box.append(line);
    return line;
  };
  if (sheet.loading) box.append(el("div", "loading", "Lade alle Angaben vom Laptop …"));
  else if (!sheet.data) box.append(el("div", "loading", "Keine Antwort vom Laptop – hier steht nur, was die Liste kennt."));
  else if (d.cut) box.append(el("div", "loading", "Einige lange Angaben sind gekürzt; vollständig am Laptop (Taste i)."));

  const status = live ? meta(live) : "";
  field("Status", [d.st, status && status !== d.st ? status : ""].filter(Boolean).join(" · ") || status);
  field("Regie", d.note || r.note, "regie");
  field("Stichwort", d.k || r.k);
  field("Alarmtext", d.txt);
  field("Meldebild", d.sit || r.sit);
  field("Ort", d.loc || r.a);
  field("Objekt", d.obj);
  field("Ort-Info", d.li);
  field("Melder", d.rep || r.rep);
  if (d.at) field("Drehbuch", `+${fmt(d.at)} Übungszeit`);
  const stages = Array.isArray(d.stg) ? d.stg : [];
  stages.forEach((st, k) => {
    const label = stages.length > 1 ? `Lage-Update ${k + 1}/${stages.length}` : "Lage-Update";
    const line = field(label, st.x || "(ohne Text)");
    const [text, cls] = timerText(st, "stage");
    line.append(el("span", "when " + cls, text));
  });
  if (d.cls) field("Schließen", timerText(d.cls, "close")[0]);
  if (d.res) field("Letztes Ergebnis", d.res + (d.hint ? "\n↳ " + d.hint : ""), "err");
  else if (r.s === "failed" && (r.i || hint(r.i))) field("Letztes Ergebnis", [r.i, hint(r.i)].filter(Boolean).join(" – "), "err");
  field("Einsatznummer", d.en);
  field("uniqueId", d.u || r.u);

  // Actions: from the live row if the list still has it, else from the detail.
  const act = live || (sheet.data ? { u: sheet.uid, l: d.l, s: d.s, upd: d.upd } : r);
  const btns = act.s ? actionButtons(act) : el("div", "btns");
  if (canNotes()) {
    const nb = document.createElement("button");
    nb.type = "button";
    nb.textContent = `Notiz zu ${act.l || r.l || "diesem Alarm"}`;
    nb.onclick = () => openComposer(sheet.uid, act.l || r.l || "");
    btns.append(nb);
  }
  if (btns.childElementCount) box.append(btns);
  body.replaceChildren(box);
}

// timerText words a stage or the scheduled close: [text, css class].
function timerText(t, what) {
  const auto = (ms) => (state && state.paused ? "automatisch, Übung pausiert" : "automatisch in " + fmt(ms));
  switch (t.s) {
    case "sent":
      return [what === "close" ? "geschlossen" : "gesendet", "ok"];
    case "due":
      if (t.due) return [auto(t.due - laptopNow()), ""];
      return [`automatisch in ${fmt(t.in || 0)} (Übung steht)`, ""];
    case "after":
      return [`automatisch ${fmt(t.in || 0)} nach dem Alarm`, ""];
    case "wait":
      return ["automatisch nach dem vorigen Lage-Update", ""];
    case "hand":
      return ["von Hand", ""];
    case "failed":
      return ["fehlgeschlagen – erneut von Hand", "err"];
    case "off":
      return [what === "close" ? "nicht mehr automatisch (von Hand geschlossen)" : "nicht gesendet, Alarm geschlossen", ""];
  }
  return ["", ""];
}

$("sheet-close").onclick = requestClose;

// Note composer: a general note (toolbar) or one for an alarm (sheet). The
// laptop confirms with "ok"; until then the text stays, also on errors.
const NOTE_MAX = 500;
const NOTE_TIMEOUT = 20000;
let noteTarget = { u: "", l: "" };
let noteWait = null; // { timer } while waiting for the laptop

function openComposer(u, l) {
  if (noteWait) return;
  if (noteTarget.u !== u) $("note-text").value = ""; // a draft belongs to its alarm
  noteTarget = { u, l };
  $("composer-title").textContent = l ? `Notiz zu ${l}` : "Notiz zur Übung";
  $("note-err").textContent = "";
  noteCount();
  openLayer(
    "composer",
    () => {
      $("composer").hidden = false;
      $("note-text").focus();
    },
    () => {
      $("composer").hidden = true;
    },
  );
}

function noteCount() {
  const n = [...$("note-text").value].length;
  $("note-count").textContent = `${n} / ${NOTE_MAX}`;
}

function noteBusy(busy) {
  const b = $("note-save");
  b.disabled = busy || ended;
  b.classList.toggle("pending", busy);
  b.classList.toggle("primary", !busy);
  b.textContent = busy ? "Wird gespeichert …" : "Speichern";
  $("note-text").readOnly = busy;
}

async function saveNote() {
  if (noteWait || ended || !paired) return;
  const text = $("note-text").value.trim();
  if (!text) {
    $("note-err").textContent = "Bitte einen Text eingeben.";
    return;
  }
  if ([...text].length > NOTE_MAX) {
    $("note-err").textContent = `Höchstens ${NOTE_MAX} Zeichen.`;
    return;
  }
  $("note-err").textContent = "";
  noteWait = {
    timer: setTimeout(
      () => noteFailed("Keine Bestätigung vom Laptop. Bitte dort im Verlauf prüfen, ob die Notiz angekommen ist, bevor du sie erneut speicherst."),
      NOTE_TIMEOUT,
    ),
  };
  noteBusy(true);
  if (!(await send("note", noteTarget.u, text))) noteFailed("Die Notiz konnte nicht an das Relay geschickt werden. Text bleibt erhalten.");
}

function noteSaved(msg) {
  clearTimeout(noteWait.timer);
  noteWait = null;
  noteBusy(false);
  $("note-text").value = "";
  noteCount();
  if (!$("composer").hidden) requestClose();
  toast(msg, true);
}

function noteFailed(msg) {
  if (!noteWait) return;
  clearTimeout(noteWait.timer);
  noteWait = null;
  noteBusy(false);
  $("note-err").textContent = msg;
  if ($("composer").hidden) toast(msg);
}

$("note-text").oninput = noteCount;
$("note-save").onclick = saveNote;
$("note-cancel").onclick = () => {
  if (noteWait) return; // the answer is on its way
  $("note-text").value = "";
  requestClose();
};
$("note").onclick = () => {
  if (paired && state && !ended) openComposer("", "");
};

$("pause").onclick = () => {
  if (!paired || !state || ended || pendingCmds.has("pause")) return;
  const wasPaused = state.paused;
  send("pause");
  expect("pause", (st) => st.paused !== wasPaused);
};
$("random").onclick = () => {
  if (!paired || !state || ended || pendingCmds.has("random")) return;
  const total = state.total;
  send("random");
  expect("random", (st) => st.total > total);
};

main().catch((e) => status("Fehler: " + e.message, true));
