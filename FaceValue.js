/* =========================================================
   Face Value core – shared by index.html (scan) and vault.html
   Everything here uses synthetic / sandbox data only.
   ========================================================= */
window.FaceValue = (function () {
  "use strict";

  /* ---------- reference data ---------- */
  const FED = {A:"Boston",B:"New York",C:"Philadelphia",D:"Cleveland",E:"Richmond",F:"Atlanta",
               G:"Chicago",H:"St. Louis",I:"Minneapolis",J:"Kansas City",K:"Dallas",L:"San Francisco"};
  const DENOMS = [1, 2, 5, 10, 20, 50, 100];
  // Share of the collector premium that survives on higher denominations (synthetic model)
  const DAMPEN = {1:1, 2:.9, 5:.5, 10:.3, 20:.2, 50:.12, 100:.08};
  const CONDITIONS = [
    {v:1,   label:"Circulated (folded, worn)"},
    {v:1.6, label:"Crisp uncirculated"},
    {v:2.5, label:"Gem uncirculated (graded 65+)"}
  ];
  const TIERS = ["Common", "Uncommon", "Rare", "Very rare", "Legendary"];

  /* ---------- helpers ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = n => "$" + (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(2).replace(/\.00$/, ""));
  const fmtDate = t => new Date(t).toLocaleDateString(undefined, {month:"short", day:"numeric", year:"numeric"});
  const tierClass = t => t.toLowerCase().replace(/\s+/g, "-");
  const tierRank = t => TIERS.indexOf(t);
  const condLabel = v => (CONDITIONS.find(c => c.v === +v) || CONDITIONS[0]).label;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- serial parsing ---------- */
  function parseSerial(raw) {
    const s = String(raw).toUpperCase().replace(/[\s\-]/g, "");
    const m = s.match(/^([A-Z]{1,2})(\d{8})([A-Z*])$/);
    if (!m) return {ok:false, cleaned:s};
    return {ok:true, cleaned:s, prefix:m[1], digits:m[2], suffix:m[3]};
  }

  function validDate(mm, dd, yyyy) {
    if (mm < 1 || mm > 12 || dd < 1) return false;
    const leap = yyyy % 4 === 0 && (yyyy % 100 !== 0 || yyyy % 400 === 0);
    const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return dd <= dim[mm - 1];
  }

  /* ---------- pattern analysis ---------- */
  function analyze(p) {
    const d = p.digits, n = parseInt(d, 10), out = [];
    const add = (id, label, mult, desc) => out.push({id, label, mult, desc});
    const counts = {}; for (const c of d) counts[c] = (counts[c] || 0) + 1;
    const maxSame = Math.max(...Object.values(counts));
    const solid = maxSame === 8;

    if (solid) add("solid", "Solid", 400, "All eight digits are identical.");
    else if (maxSame === 7) add("near", "Near-solid", 30, "Seven of the eight digits are the same.");

    const step = [...d].every((c, i) => i === 0 || +c - +d[i-1] === 1) ? "up" :
                 [...d].every((c, i) => i === 0 || +c - +d[i-1] === -1) ? "down" : null;
    if (step) add("ladder", step === "up" ? "True ladder" : "Descending ladder", 60,
                  "Digits count " + (step === "up" ? "up" : "down") + " in order.");

    if (!solid && /^[01]{8}$/.test(d)) add("binary", "Binary", 40, "Only 0s and 1s.");
    if (!solid && d === [...d].reverse().join("")) add("radar", "Radar", 6, "Reads the same forwards and backwards.");

    if (!solid) {
      if (/^(\d\d)\1{3}$/.test(d)) add("repeater2", "Quad repeater", 8, "A two-digit pair repeats four times.");
      else if (d.slice(0, 4) === d.slice(4)) add("repeater", "Repeater", 5, "The first four digits repeat.");
    }

    const rot = {0:0, 1:1, 6:9, 8:8, 9:6};
    if (!solid && [...d].every(c => c in rot) && [...d].reverse().map(c => rot[c]).join("") === d)
      add("rotator", "Rotator", 8, "Reads the same upside down.");

    if (n >= 1 && n <= 100) add("low", "Ultra-low serial", 100, "Among the first 100 printed for its series.");
    else if (n <= 1000)     add("low", "Low serial", 12, "Under 1,000.");
    else if (n <= 10000)    add("low", "Low-ish serial", 2.5, "Under 10,000.");
    if (n >= 99999000)      add("high", "High serial", 3, "Within the last thousand of the run.");

    const mm = +d.slice(0, 2), dd = +d.slice(2, 4), yy = +d.slice(4);
    if (((yy >= 1900 && yy <= 2026) || yy === 1776) && validDate(mm, dd, yy))
      add("date", "Date serial", 3, "Reads as a date: " + mm + "/" + dd + "/" + yy + ".");

    if (p.suffix === "*") add("star", "Star note", 4, "A replacement note, printed to replace a damaged sheet.");
    return out.sort((a, b) => b.mult - a.mult);
  }

  function combinedMultiplier(f) {
    if (!f.length) return 1;
    return f[0].mult + 0.3 * f.slice(1).reduce((s, x) => s + (x.mult - 1), 0);
  }

  function valueBill(f, denom, cond) {
    const m = combinedMultiplier(f);
    const premium = (m - 1) * denom * DAMPEN[denom] * cond;
    const est = denom + premium;
    const low = f.length ? Math.max(denom, est * 0.7) : denom;
    const high = f.length ? est * 1.6 : denom;
    const score = Math.min(100, Math.round(100 * Math.log(m) / Math.log(500)));
    const tier = m <= 1 ? "Common" : m < 4 ? "Uncommon" : m < 15 ? "Rare" : m < 80 ? "Very rare" : "Legendary";
    return {m, est, low, high, score, tier, premium: est - denom};
  }

  /* A saved record only stores raw inputs; everything else is derived so edits stay consistent */
  function evaluate(rec) {
    const p = parseSerial(rec.serial);
    const feats = analyze(p);
    const val = valueBill(feats, rec.denom, rec.cond);
    return {rec, p, feats, val};
  }

  function runChecks(p, feats, val, meta) {
    const c = [], push = (lvl, t, d) => c.push({lvl, t, d});
    push("ok", "Serial format is valid", "Prefix letters, eight digits, then a letter or star.");
    if (+p.digits === 0) push("bad", "Serial 00000000 can't exist", "Serials start at 00000001. This is a misread or a fake.");
    const f = p.prefix[0];
    if (FED[f]) push("ok", "Prefix points to the " + FED[f] + " Federal Reserve Bank", "Letter " + f + " is a valid district. Check it matches the seal on the front.");
    else push("warn", "Prefix letter " + f + " isn't a Federal Reserve district", "Districts run A to L. Newer or older series may differ, so double-check the photo.");
    if (meta && meta.corrected) push("warn", "Some characters were corrected from the photo", "Confirm each digit against the bill before trusting the result.");
    if (meta && meta.dup) push("warn", "Already in your vault", "The same serial and series is saved already. A genuine note exists only once per series and bank.");
    if (val.m >= 15) push("warn", "Fancy serials are the ones people fake", "Altered digits and printed copies are common. Check the paper feel, security thread and watermark, or get it authenticated before paying a premium.");
    if (!feats.length) push("ok", "No special pattern", "This bill is most likely worth face value.");
    return c;
  }

  /* ---------- shared HTML snippets ---------- */
  function digitsHTML(p, feats) {
    const hot = feats.some(f => ["solid","near","ladder","binary","radar","repeater","repeater2","rotator"].includes(f.id));
    const lead = feats.some(f => f.id === "low") ? p.digits.match(/^0*/)[0].length : 0;
    return [...p.digits].map((c, i) => `<i class="${i < lead ? "dim" : hot ? "hot" : ""}">${c}</i>`).join("");
  }
  function noteHTML(p, feats, left, right) {
    const fed = FED[p.prefix[0]] ? "Federal Reserve Bank of " + FED[p.prefix[0]] : "Unknown district";
    return `<div class="note">
      <div class="top"><span>${left || ""}</span><span>${right || ""}</span></div>
      <div class="serialrow">
        <span class="pre">${esc(p.prefix)}</span>
        <span class="digits">${digitsHTML(p, feats)}</span>
        <span class="suf ${p.suffix === "*" ? "star" : ""}">${esc(p.suffix)}</span>
      </div>
      <div class="fed">${esc(fed)}</div>
    </div>`;
  }
  function featsHTML(feats) {
    return feats.length
      ? feats.map(f => `<li class="feat"><div><b>${esc(f.label)}</b><span>${esc(f.desc)}</span></div><div class="x">×${f.mult}</div></li>`).join("")
      : `<li class="feat"><div><b>Nothing special</b><span>A random-looking serial with no collectible pattern.</span></div><div class="x">×1</div></li>`;
  }
  function checksHTML(checks) {
    return checks.map(c => `<div class="check ${c.lvl}"><span class="ic" aria-hidden="true">${c.lvl === "ok" ? "✓" : c.lvl === "warn" ? "!" : "✕"}</span><div>${esc(c.t)}${c.d ? `<em>${esc(c.d)}</em>` : ""}</div></div>`).join("");
  }

  /* ---------- storage: IndexedDB (photos are too big for localStorage) ---------- */
  let dbp = null;
  function openDB() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("This browser doesn't support local storage for photos"));
      const r = indexedDB.open("FaceValue", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("bills", {keyPath:"id"});
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(mode, fn) {
    return openDB().then(db => new Promise((res, rej) => {
      const t = db.transaction("bills", mode), req = fn(t.objectStore("bills"));
      t.oncomplete = () => res(req && req.result);
      t.onerror = t.onabort = () => rej(t.error);
    }));
  }
  const db = {
    all:   () => tx("readonly",  s => s.getAll()),
    put:   rec => tx("readwrite", s => s.put(rec)),
    del:   id  => tx("readwrite", s => s.delete(id)),
    clear: ()  => tx("readwrite", s => s.clear())
  };

  /* Shrink a photo so hundreds of bills fit comfortably in the browser's storage */
  function compressImage(img, max, q) {
    max = max || 900; q = q || 0.72;
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", q);
  }

  /* ---------- account stats ---------- */
  function accountStats(recs) {
    const items = recs.map(evaluate);
    let total = 0, face = 0;
    const tierCounts = {}; TIERS.forEach(t => tierCounts[t] = 0);
    items.forEach(i => { total += i.val.est; face += i.rec.denom; tierCounts[i.val.tier]++; });
    const byMult = [...items].sort((a, b) => b.val.m - a.val.m || b.val.est - a.val.est);
    const byValue = [...items].sort((a, b) => b.val.est - a.val.est);
    let run = 0;
    const timeline = [...items].sort((a, b) => a.rec.createdAt - b.rec.createdAt)
      .map(i => ({t:i.rec.createdAt, serial:i.rec.serial, total:(run += i.val.est)}));
    return {items, total, face, premium: total - face, count: items.length,
            rarest: byMult[0] || null, top: byValue[0] || null, tierCounts, timeline};
  }

  /* ---------- profile + leaderboard ---------- */
  const PROFILE_KEY = "FaceValue.profile";
  function getName() { try { return (JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}).name || "You"; } catch (e) { return "You"; } }
  function setName(n) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify({name:n})); } catch (e) {} }

  /* Demo players so the board isn't empty. Synthetic data only.
     To make this a real multiplayer board, replace list() with a fetch to your backend
     (Firebase, Supabase, etc.) and post {name, value, bills, rarest} whenever the vault changes. */
  const SEED = [
    {name:"Maya R.",  value:1284.50, bills:23, rarest:"Legendary"},
    {name:"Dev P.",   value:842.10,  bills:17, rarest:"Very rare"},
    {name:"Jordan K.",value:517.75,  bills:31, rarest:"Very rare"},
    {name:"Sam T.",   value:233.40,  bills:12, rarest:"Rare"},
    {name:"Priya N.", value:164.00,  bills:9,  rarest:"Rare"},
    {name:"Leo M.",   value:96.25,   bills:14, rarest:"Uncommon"},
    {name:"Ana C.",   value:41.00,   bills:6,  rarest:"Uncommon"}
  ];
  const Leaderboard = {
    async list(me) {
      const rows = SEED.map(x => Object.assign({me:false}, x));
      if (me && me.bills > 0) rows.push(Object.assign({me:true}, me));
      rows.sort((a, b) => b.value - a.value);
      return rows.map((r, i) => Object.assign(r, {rank:i + 1}));
    }
  };

  /* ---------- small header summary ---------- */
  async function navSummary() {
    const el = document.getElementById("navSummary");
    if (!el) return;
    try {
      const s = accountStats(await db.all());
      el.textContent = s.count ? s.count + " · " + money(s.total) : "";
    } catch (e) { el.textContent = ""; }
  }

  return {FED, DENOMS, CONDITIONS, TIERS, esc, money, fmtDate, tierClass, tierRank, condLabel, newId,
          parseSerial, analyze, combinedMultiplier, valueBill, evaluate, runChecks,
          noteHTML, featsHTML, checksHTML, db, compressImage, accountStats,
          getName, setName, Leaderboard, navSummary};
})();
