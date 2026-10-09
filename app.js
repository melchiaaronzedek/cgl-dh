/* ══════════════════════════════════════════════════════════════════
   CGL Compass: SSC CGL 2026 Tier 1 study system.
   Vanilla SPA, no build step. Data in /data, progress synced per account.
   Engine forked from the IOCL study site: auth, sync, springs, rings,
   quiz, deck. Everything SSC-specific lives in the domain and views.
   ══════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

/* the candidate's own shift: set at first sign-in (ST.profile.exam), 10 October until then */
var EXAM = new Date(2026, 9, 10, 9, 0, 0);
function syncExam() {
  var e = ST && ST.profile && ST.profile.exam;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e || "");
  EXAM = m ? new Date(+m[1], +m[2] - 1, +m[3], 9, 0, 0) : new Date(2026, 9, 10, 9, 0, 0);
}
function examLabel(o) { return EXAM.toLocaleDateString("en-IN", o || { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
/* business details shown on the legal pages and the checkout; fill before launch */
var SITE = { brand: "CGL Compass", owner: "CGL Compass", email: "support@cglcompass.in", city: "Visakhapatnam, Andhra Pradesh" };
var FIGV = "1790419676";
var DATAV = "2610091952";                                // bump when data/ changes
/* last year's Tier 1 cut-off, for the score chart. Filled from research. */
var CUTOFF = { ur: 136.40, label: "CGL 2025, all other posts, normalised" };

/* ── account ──
   A display name and a numeric PIN. This is a study tracker, not a bank:
   the PIN exists so two people on one link do not overwrite each other. */
var AU = null;
try { AU = JSON.parse(localStorage.getItem("cgl-account") || "null"); } catch (e) {}
var syncState = "";

function api(path, opts) {
  return fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts))
    .catch(function () { throw new Error("Could not reach the server. Check your connection and try again."); })
    .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) {
      if (!r.ok || !j) throw new Error((j && j.error) || ("The server did not answer properly (" + r.status + "). Try again in a minute."));
      return j;
    }); });
}
function signOut() {
  AU = null;
  // the next person to sign in on this device must not inherit this progress
  ST = fresh();
  syncState = "";
  try { localStorage.removeItem("cgl-account"); localStorage.removeItem("cgl-study-v1"); } catch (e) {}
  // premium data may be in memory: start clean
  location.hash = "#/"; location.reload();
}
function pull() {
  if (!AU) return Promise.resolve();
  return api("/api/progress?token=" + encodeURIComponent(AU.token))
    .then(function (j) {
      // authoritative, not additive: a fresh account starts empty rather than
      // adopting whatever the previous user left in this browser
      var d = j.data || {};
      SKEYS.forEach(function (k) {
        ST[k] = (d[k] && typeof d[k] === "object") ? d[k] : {};
      });
      syncExam();
      saveLocal();
      syncState = "synced";
    })
    .catch(function (e) {
      if (/sign in/i.test(e.message)) signOut();
      else { syncState = "offline"; paintWho(); }
    });
}
var pushT = null;
function push() {
  if (!AU) return;
  if (pushT) clearTimeout(pushT);
  syncState = "saving";
  paintWho();
  pushT = setTimeout(function () {
    api("/api/progress", { method: "POST", body: JSON.stringify({ token: AU.token, data: ST }) })
      .then(function () { syncState = "synced"; paintWho(); })
      .catch(function () { syncState = "offline"; paintWho(); });
  }, 1200);
}

/* ── state ── */
/* learn: topics marked as studied. ca: current-affairs months read. */
var SKEYS = ["att", "prac", "err", "cards", "plan", "learn", "ca", "profile", "t2"];
function fresh() { var o = {}; SKEYS.forEach(function (k) { o[k] = {}; }); return o; }
var ST = fresh();
try {
  var raw = JSON.parse(localStorage.getItem("cgl-study-v1") || "null");
  if (raw && typeof raw === "object") ST = Object.assign(ST, raw);
} catch (e) {}
var saveT = null;
function saveLocal() {
  try { localStorage.setItem("cgl-study-v1", JSON.stringify(ST)); } catch (e) {}
}
function save() {
  if (saveT) clearTimeout(saveT);
  saveT = setTimeout(saveLocal, 300);
  push();
}

var D = { papers: [], syllabus: { sections: [] }, cards: [], sources: [], videos: [] };
function load() {
  return Promise.all(["papers", "syllabus", "cards", "sources", "videos", "library", "ca", "topicvideos", "analysis", "lastday", "meta"].map(function (k) {
    if (k === "meta" && D.meta) return null;   // the front door fetched it already
    return fetch("data/" + k + ".json?v=" + DATAV).then(function (r) {
      // the last three are optional: a page without them still works
      if (!r.ok) { if (/library|ca|topicvideos|analysis|lastday|meta/.test(k)) return null; throw new Error(k + ".json returned " + r.status); }
      return r.json();
    }).then(function (j) { if (j != null) D[k] = j; });
  })).then(buildDecks);
}
function buildDecks() {
  {
    // current affairs become flashcard decks, one per month
    if (D.ca && D.ca.months) {
      var seen = {};
      (D.ca.cards || []).forEach(function (c) { seen[c[0]] = 1; });
      if ((D.ca.cards || []).length) D.cards = D.cards.concat([{ n: 900, t: "Current affairs, " + D.ca.months[0].label + " to " + D.ca.months[D.ca.months.length - 1].label, sec: "G", c: D.ca.cards }]);
      (D.ca.topics || []).forEach(function (t, i) {
        if ((t.cards || []).length) D.cards = D.cards.concat([{ n: 910 + i, t: "CA by topic: " + t.cat, sec: "G", c: t.cards }]);
      });
    }
  }
}
/* the signed-in account's plan, fresh from the server */
function refreshMe() {
  if (!AU) return Promise.resolve();
  return api("/api/me?token=" + encodeURIComponent(AU.token)).then(function (j) {
    var was = isPremium();
    AU.ent = j.ent; AU.plan = j.plan; AU.payments = j.payments; AU.name = j.name; AU.methods = j.methods;
    AU.ref = j.ref || null; AU.refCount = j.refCount || 0; AU.trialCfg = j.trial || null; AU.plans = j.plans || null; AU.t2ok = !!j.t2ok;
    // premium data from the trial may still be in memory: a fresh page drops it once access ends
    if (was && !isPremium() && premiumLoaded) setTimeout(function () { location.reload(); }, 50);
    try { localStorage.setItem("cgl-account", JSON.stringify(AU)); } catch (e) {}
  }).catch(function (e) { if (/sign in/i.test(e.message)) signOut(); });
}
function isPremium() {
  if (!(AU && AU.ent && AU.ent.premium)) return false;
  // a trial ends on this device at its end time, without waiting for the next server check
  return !(AU.ent.trial && AU.ent.trialUntil && AU.ent.trialUntil <= Date.now());
}
/* the 5-day full-access trial */
function onTrial() { return isPremium() && !!(AU.ent && AU.ent.trial); }
function trialLeft() { return AU && AU.ent && AU.ent.trialUntil ? Math.max(0, Math.ceil((AU.ent.trialUntil - Date.now()) / 864e5)) : 0; }
function trialOver() { return !!(AU && AU.ent && !isPremium() && AU.ent.trialUntil && AU.ent.trialUntil <= Date.now()); }
function trialDays() { return AU && AU.trialCfg ? AU.trialCfg.days : 5; }
function refBonus() { return AU && AU.trialCfg ? AU.trialCfg.refBonus : 2; }
/* invite links: ?r=CODE on any URL is kept until this device signs up */
(function () {
  try {
    var m = /[?&]r=([a-z0-9]{6})\b/i.exec(location.search);
    if (m) { if (!localStorage.getItem("cgl-account")) localStorage.setItem("cgl-ref", m[1].toLowerCase());
      history.replaceState(null, "", location.pathname + location.hash); }
  } catch (e) {}
})();
function inviteURL() { return "https://cglcompass.in/" + (AU && AU.ref ? "?r=" + AU.ref : ""); }
function inviteText() { return "I am preparing for SSC CGL 2026 on CGL Compass: complete notes, every past question with solutions, and real mocks. Join with my link and we both get " + refBonus() + " extra days free: "; }
function shareOut(text, url) {
  if (navigator.share) return navigator.share({ title: "CGL Compass", text: text, url: url }).catch(function () {});
  window.open("https://wa.me/?text=" + encodeURIComponent(text + url), "_blank", "noopener");
}
function inviteHTML() {
  if (!AU || !AU.ref) return "";
  var u = inviteURL(), t = inviteText(), n = AU.refCount || 0;
  return '<div class="inv" id="invite"><div class="inv-t"><span class="ac-k">Invite a friend</span><b>' + refBonus() + ' more days free, for both of you</b>' +
    '<p>When a friend joins with Google or a phone number through your link, you each get ' + refBonus() + ' extra days of full access.' +
    (n ? ' <strong>' + n + ' friend' + (n === 1 ? '' : 's') + ' joined, +' + n * refBonus() + ' days so far.</strong>' : '') + '</p></div>' +
    '<div class="inv-l"><input readonly value="' + h(u) + '" aria-label="Your invite link"><button class="btn quiet sm" data-inv="copy">Copy</button></div>' +
    '<div class="inv-b"><a class="btn key sm" data-inv="share" href="https://wa.me/?text=' + encodeURIComponent(t + u) + '" target="_blank" rel="noopener">Share on WhatsApp</a>' +
    '<a class="btn quiet sm" href="https://t.me/share/url?url=' + encodeURIComponent(u) + '&text=' + encodeURIComponent(t) + '" target="_blank" rel="noopener">Telegram</a></div></div>';
}
function wireInvite(root) {
  els("[data-inv]", root).forEach(function (b) { b.addEventListener("click", function (e) {
    if (b.dataset.inv === "copy") {
      var i = el(".inv-l input", root); try { navigator.clipboard.writeText(i.value); } catch (x) { i.select(); document.execCommand("copy"); }
      b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1600);
    } else if (b.dataset.inv === "share" && navigator.share) { e.preventDefault(); shareOut(inviteText(), inviteURL()); }
  }); });
}
/* the slim bar during the trial */
function trialBarHTML(key) {
  if (!onTrial() || { landing: 1, premium: 1, welcome: 1, admin: 1, mockrun: 1 }[key]) return "";
  try { if (sessionStorage.getItem("cgl-tbar") === "x") return ""; } catch (e) {}
  var n = trialLeft(), last = n <= 1;
  return '<div class="tbar' + (last ? ' last' : '') + '" role="status"><span class="tb-dot" aria-hidden="true"></span>' +
    '<p><b>' + (last ? 'Last day of full access' : 'Full access: ' + n + ' days left') + '</b><span> · everything is open during your free ' + trialDays() + ' days</span></p>' +
    (AU.ref ? '<button class="tb-inv" data-tbinv>Invite a friend, +' + refBonus() + ' days</button>' : '') +
    '<a class="btn key sm tb-go" href="#/premium"><span class="tb-l">Get the </span>' + passName() + ', ₹' + passRupees() + '</a>' +
    '<button class="tb-x" data-tbx aria-label="Hide for now">&#215;</button></div>';
}

function isAdmin() { return !!(AU && AU.ent && AU.ent.admin); }
function canPdf() { return !!(AU && AU.ent && AU.ent.pdf); }
function pdfHref(file, pg) { return "#/pdf/" + String(file).replace(/^pdfs\//, "") + (pg ? "/" + pg : ""); }
/* premium data comes through /api/data with the account token */
var premiumLoaded = false;
function loadPremium() {
  if (!isPremium() || premiumLoaded) return Promise.resolve();
  var get = function (f) {
    return fetch("/api/data?f=" + f + "&v=" + DATAV, { headers: { Authorization: "Bearer " + AU.token } })
      .then(function (r) { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); });
  };
  return get("manifest").then(function (man) {
    var parts = []; for (var i = 1; i <= man.papers; i++) parts.push(get("papers-" + i));
    // notes come in chunks once they outgrow one response
    var notes = man.notes ? Promise.all(Array.apply(null, { length: man.notes }).map(function (_, i) { return get("notes-" + (i + 1)); }))
      .then(function (cs) { return Object.assign.apply(null, [{}].concat(cs)); }) : get("notes");
    return Promise.all([Promise.all(parts), notes, get("cards"), get("ca"), get("library"),
      isAdmin() ? get("ca-topics").catch(function () { return null; }) : Promise.resolve(null)]);
  }).then(function (r) {
    var papers = []; r[0].forEach(function (c) { papers = papers.concat(c); });
    D.papers = papers; D.notes = r[1]; D.cards = r[2]; D.ca = r[3]; D.library = r[4];
    if (r[5]) { D.ca.topics = r[5].topics; D.ca.topicSrc = r[5].topicSrc; }
    QIDX = null; PIDX = null; buildDecks(); premiumLoaded = true;
  }).catch(function (e) { console.error("premium data:", e); });
}
/* notes are the heaviest file and only topic pages read them: fetch on
   first need, then repaint whatever page asked */
var notesP = null;
function needNotes() {
  if (D.notes) return true;
  if (!notesP) notesP = fetch("data/notes.json?v=" + DATAV).then(function (r) { return r.json(); })
    .then(function (j) { D.notes = j; route(); }).catch(function () { D.notes = {}; route(); });
  return false;
}

/* ── helpers ── */
var main = document.getElementById("main");
var asideEl = document.getElementById("aside");
var shell = document.getElementById("shell");
function h(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function el(s, r) { return (r || document).querySelector(s); }
function els(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
function pc(a, b) { return b ? Math.round(a / b * 100) : 0; }
function days() { var d = Math.ceil((EXAM - new Date()) / 864e5); return d > 0 ? d : 0; }
/* ── free trial ── */
function FREE() { return (D.meta && D.meta.free) || { topics: [], papers: [], months: [], decks: [] }; }
function topicOpen(sk, t) { return isPremium() || FREE().topics.indexOf(sk + "|" + t) >= 0; }
function openPaper(id) { return ((D.meta && D.meta.papers) || D.papers).some(function (p) { return p.id === id && p.open; }); }
function paperOpen(id) { return isPremium() || openPaper(id) || FREE().papers.indexOf(id) >= 0; }
function monthOpen(m) { return isPremium() || FREE().months.indexOf(m) >= 0; }
function tCount(sk, t) { var e = D.meta && D.meta.topics && D.meta.topics[sk + "|" + t]; return e ? e.n : topicQs(sk, t).length; }
var LOCK = '<svg class="lk" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8.5 10.5V7.6a3.5 3.5 0 0 1 7 0v2.9"/></svg>';
/* what a locked place shows instead of its content */
function upsell(title, what) {
  return '<div class="upsell reveal"><span class="us-ic">' + LOCK + '</span>' +
    '<h2>' + h(title) + '</h2><p>' + h(what) + '</p>' +
    '<div class="us-b"><a class="btn key" href="#/premium">Get the ' + passName() + ', ₹' + passRupees() + arr() + '</a>' +
    '<a class="btn quiet" href="#/learn">See the free topics</a></div></div>';
}
function planRupees() { return AU && AU.plan ? Math.round(AU.plan.price / 100) : 50; }
function planDays() { return AU && AU.plan ? AU.plan.days : 30; }
/* which pass to offer: after the Tier 1 shift, the Tier 2 Pass (same price, lasts to Tier 2) */
function t2Offer() { return !!(AU && AU.t2ok && AU.plans && AU.plans.t2); }
function passKey() { return t2Offer() ? "t2" : "pass"; }
function passName() { return t2Offer() ? "Tier 2 Pass" : "Exam Pass"; }
function passRupees() { return t2Offer() ? Math.round(AU.plans.t2.price / 100) : planRupees(); }
function passDays() { return t2Offer() ? AU.plans.t2.days : planDays(); }
function t2PassHTML() {
  if (!t2Offer() || isAdmin()) return "";
  var paid = AU.ent && AU.ent.paid && AU.ent.until ? Math.ceil((AU.ent.until - Date.now()) / 864e5) : 0;
  if (paid >= 60) return "";
  return '<a class="t2pass reveal" href="#/premium"><span class="t2p-k">Tier 1 done. Now Tier 2.</span>' +
    '<b>The Tier 2 Pass: everything, all the way to Tier 2, for ₹' + passRupees() + '.</b>' +
    '<span class="t2p-s">' + passDays() + ' days of every Tier 2 paper, Statistics and Paper III, Computer Knowledge notes, and every Tier 1 topic for the GA and maths in Paper I. One payment, never renews.</span>' +
    '<span class="btn key">Get the Tier 2 Pass, ₹' + passRupees() + arr() + '</span></a>';
}
function arr() { return '<i>&#8250;</i>'; }

function reduceMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
/* Entrance is a CSS cascade now (see .reveal), so there is nothing to drive
   here. Reduced motion is handled in the stylesheet too. */
function reveal(){}


/* ══════════ springs ══════════
   Apple's two parameters rather than the physics triplet: a damping ratio
   (1 = no overshoot) and a response in seconds (how quickly it arrives).
   Integrated per frame so it can be re-targeted mid-flight from wherever the
   value currently is, carrying its velocity through. That is what makes a
   moving thing grabbable. */
function Spring(value, opts) {
  this.x = value; this.v = 0; this.to = value;
  this.zeta = opts && opts.damping != null ? opts.damping : 1;
  this.resp = opts && opts.response || 0.4;
  this.raf = null; this.onFrame = null; this.onRest = null; this.last = 0;
}
Spring.prototype.set = function (x, v) { this.x = x; if (v != null) this.v = v; };
Spring.prototype.target = function (to, v) {
  this.to = to; if (v != null) this.v = v;
  if (!this.raf) { this.last = 0; this.tick = this.tick.bind(this); this.raf = requestAnimationFrame(this.tick); }
};
Spring.prototype.stop = function () { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; };
Spring.prototype.tick = function (t) {
  if (!this.last) this.last = t;
  var dt = Math.min((t - this.last) / 1000, 1 / 30);   // a stalled tab must not explode the integrator
  this.last = t;
  var wn = 2 * Math.PI / this.resp, k = wn * wn, c = 2 * this.zeta * wn;
  var steps = 4, h = dt / steps;                        // substeps keep a stiff spring stable
  for (var i = 0; i < steps; i++) {
    var a = -k * (this.x - this.to) - c * this.v;
    this.v += a * h; this.x += this.v * h;
  }
  if (this.onFrame) this.onFrame(this.x, this.v);
  if (Math.abs(this.x - this.to) < 0.08 && Math.abs(this.v) < 0.6) {
    this.x = this.to; this.v = 0; this.raf = null;
    if (this.onFrame) this.onFrame(this.x, 0);
    if (this.onRest) this.onRest();
    return;
  }
  this.raf = requestAnimationFrame(this.tick);
};

/* Where a flick would come to rest if you let it decelerate. Apple's
   exponential-decay projection, not the textbook v squared over 2a. */
function project(v, rate) { rate = rate || 0.998; return (v / 1000) * rate / (1 - rate); }

/* Real things slow before they stop. The further past the edge, the less of
   the drag the element actually takes. */
function rubberband(over, dim, c) {
  c = c || 0.55;
  return (over * dim * c) / (dim + c * Math.abs(over));
}

/* ══════════ SSC CGL 2026 Tier 1 — domain ══════════ */

/* the four sections, in the order SSC seats them in Tier 1 */
var SECS = [
  { k: "R", name: "General Intelligence & Reasoning", short: "Reasoning" },
  { k: "G", name: "General Awareness", short: "GA" },
  { k: "Q", name: "Quantitative Aptitude", short: "Quant" },
  { k: "E", name: "English Comprehension", short: "English" }
];
var SECMIN = 15;              // 2026 rule: each section is its own 15 minutes
var PLUS = 2, MINUS = 0.5;    // per question
function secOf(k) { return SECS.filter(function (s) { return s.k === k; })[0] || { k: k, name: k, short: k }; }

/* a question part is plain text, or a crop of the printed page when it
   carried maths or a figure. Crops are the page itself, so they are shown
   instead of the text rather than beside it. */
/* 2025 crops come from ~96 dpi scans rendered at 2x; they are shown at
   their printed size and scroll sideways on a phone rather than shrink
   into unreadable type (see fitCrops) */
function k25(src) { return /\/2025-/.test(src) ? ' data-k="1.2"' : /\/t2-2025-/.test(src) ? ' data-k="1"' : ''; }
function optHTML(o) {
  if (o && typeof o === "object") return '<img class="oimg" src="' + h(o.i) + '?v=' + FIGV + '"' + k25(o.i) + ' alt="' + h(o.t || "Option as printed") + '" loading="lazy">';
  return h(o);
}
function fitCrops(scope) {
  els("img[data-k]", scope).forEach(function (im) {
    function f() {
      if (!im.naturalWidth) return;
      im.style.width = Math.round(im.naturalWidth / +im.dataset.k) + "px";
      // a printed line wider than the screen scrolls; say so under it
      var fig = im.closest(".qfig");
      if (fig && fig.scrollWidth > fig.clientWidth + 4 && !(fig.nextElementSibling && fig.nextElementSibling.classList.contains("swipe"))) {
        var p = document.createElement("p"); p.className = "swipe"; p.textContent = "Swipe the printed line to read all of it";
        fig.parentNode.insertBefore(p, fig.nextSibling);
      }
    }
    if (im.complete) f(); else im.addEventListener("load", f);
  });
}
function optText(o) { return o && typeof o === "object" ? (o.t || "(figure)") : String(o); }
/* question text, with the word or segment the question is about underlined as it was printed */
function qText(q) {
  var t = h(q.q || ""), u = q.u ? h(q.u) : "";
  if (!u) return t;
  var i = t.indexOf(u);
  return i < 0 ? t : t.slice(0, i) + '<u class="qu">' + u + '</u>' + t.slice(i + u.length);
}
function stemHTML(q) {
  var out = "";
  if (q.p) out += '<div class="brief passage"><span class="t">Passage</span><p>' + h(q.p) + '</p></div>';
  if (q.qi && q.qt) {
    // read cleanly by OCR: set as text, with the printed line a tap away
    out += '<p class="qtext">' + qText(q) + '</p>' +
      '<details class="asprint"><summary>As printed</summary><figure class="qfig"><img src="' + h(q.qi) + '?v=' + FIGV + '"' + k25(q.qi) + ' alt="" loading="lazy"></figure></details>';
  } else if (q.qi) {
    out += '<figure class="qfig"><img src="' + h(q.qi) + '?v=' + FIGV + '"' + k25(q.qi) + ' alt="' + h(q.q || "Question as printed") + '"></figure>';
    (q.qx || []).forEach(function (x) { out += '<figure class="qfig"><img src="' + h(x) + '?v=' + FIGV + '" alt="Continued"></figure>'; });
  } else out += '<p class="qtext">' + qText(q) + '</p>';
  return out;
}

/* ── derived ── */
function mockPapers() { return D.papers.filter(function (p) { return !p.bank; }); }
function paper(id) { return D.papers.filter(function (p) { return p.id === id; })[0]; }
function allQs() {
  var o = [];
  D.papers.forEach(function (p) { p.qs.forEach(function (q) { o.push(q); }); });
  return o;
}
var QIDX = null;
function qById(id) {
  if (!QIDX) { QIDX = {}; allQs().forEach(function (q) { QIDX[q.id] = q; }); }
  return QIDX[id];
}
function att(pid) { return ST.att[pid] || null; }
function score(qs, ans) {
  var r = 0, w = 0, n = 0;
  qs.forEach(function (q) {
    var v = ans[q.id];
    if (v == null) return;
    n++; if (v === q.a) r++; else w++;
  });
  return { right: r, wrong: w, done: n, total: qs.length, marks: r * PLUS - w * MINUS };
}
function paperScore(pid) {
  var p = paper(pid), a = att(pid);
  if (!p || !a || !a.ans) return null;
  var s = score(p.qs, a.ans);
  s.bySec = {};
  SECS.forEach(function (sec) {
    s.bySec[sec.k] = score(p.qs.filter(function (q) { return q.s === sec.k; }), a.ans);
  });
  return s;
}

/* every answer anywhere, mock or practice, feeds one accuracy picture */
function everyAnswer() {
  var o = {};
  Object.keys(ST.att).forEach(function (pid) {
    var a = ST.att[pid];
    if (a && a.ans && a.done) Object.keys(a.ans).forEach(function (id) { o[id] = a.ans[id]; });
  });
  Object.keys(ST.prac).forEach(function (id) { o[id] = ST.prac[id]; });
  return o;
}
function totals() {
  var ans = everyAnswer(), done = 0, right = 0;
  Object.keys(ans).forEach(function (id) {
    var q = qById(id); if (!q) return;
    done++; if (ans[id] === q.a) right++;
  });
  var total = allQs().length;
  return { done: done, right: right, total: total, acc: done ? Math.round(right / done * 100) : 0 };
}
function topicStats() {
  var ans = everyAnswer(), m = {};
  allQs().forEach(function (q) {
    if (isGuess(q)) return;
    var key = q.s + "|" + (q.t || "Other");
    if (!m[key]) m[key] = { s: q.s, t: q.t || "Other", n: 0, done: 0, right: 0 };
    m[key].n++;
    if (ans[q.id] != null) { m[key].done++; if (ans[q.id] === q.a) m[key].right++; }
  });
  return Object.keys(m).map(function (k) {
    var x = m[k]; x.acc = x.done ? Math.round(x.right / x.done * 100) : null; return x;
  });
}
/* weakest first: low accuracy with enough attempts to mean something, then
   untouched topics that carry marks */
function weakest(n) {
  return topicStats().filter(function (x) { return x.n >= 3; }).sort(function (a, b) {
    var av = a.done >= 3 ? a.acc : 101, bv = b.done >= 3 ? b.acc : 101;
    if (av !== bv) return av - bv;
    return b.n - a.n;
  }).slice(0, n || 5);
}

/* ── error log ──
   A miss is logged; a later right answer counts toward clearing it; two in a
   row and it leaves the log. A fresh miss resets the streak. */
function logAnswer(q, v) {
  if (v == null) return;
  var e = ST.err[q.id];
  if (v !== q.a) { ST.err[q.id] = { n: (e ? e.n : 0) + 1, ok: 0, t: Date.now() }; return; }
  if (e) { e.ok++; if (e.ok >= 2) delete ST.err[q.id]; }
}
/* the same question recalled in more than one 2026 set: SSC repeats itself, so it earns a chip */
function repChip(q) {
  if (!q || !q.rep || !q.rep.length) return "";
  var mine = String(q.id || "").slice(0, 10), days = {};
  q.rep.forEach(function (id) { var d = id.slice(0, 10); if (d !== mine) days[d] = 1; });
  var n = Object.keys(days).length;
  var who = q.rep.map(function (id) { var p = paperOf(qById(id) || {}); return p && p.label ? p.label : id.slice(0, 10); });
  return ' <span class="pyq rep" title="' + h("Also asked: " + who.join("; ")) + '">' + (n ? "Repeated on " + n + " other day" + (n === 1 ? "" : "s") : "Recalled twice") + '</span>';
}
/* every repeated question once, newest first */
function repList() {
  var seen = {}, out = [];
  allQs().filter(function (q) { return q.rep && q.rep.length && !isGuess(q); })
    .sort(function (a, b) { return String((paperOf(b) || {}).date || "").localeCompare(String((paperOf(a) || {}).date || "")); })
    .forEach(function (q) { if (seen[q.id]) return; out.push(q); seen[q.id] = 1; q.rep.forEach(function (id) { seen[id] = 1; }); });
  return out;
}
function repRun() {
  var qs = repList();
  if (!qs.length) { location.hash = "#/mocks"; return blank(); }
  var host = quiz({
    qs: qs, back: "#/mocks", backLabel: "Mocks",
    head: '<p class="muted" style="margin:0 0 8px">Recalled in more than one 2026 shift or set, newest first. Each shows where else it was asked.</p>',
    get: function (k) { var v = ST.prac[qs[k].id]; return v == null ? null : v; },
    set: function (k, v) { ST.prac[qs[k].id] = v; logAnswer(qs[k], v); save(); },
    startAt: function () { for (var k = 0; k < qs.length; k++) if (ST.prac[qs[k].id] == null) return k; return 0; },
    done: function () { location.hash = "#/mocks"; }
  });
  setAside(host.__pads());
  return host;
}
function errList() {
  return Object.keys(ST.err).map(function (id) {
    var q = qById(id); return q ? { q: q, e: ST.err[id] } : null;
  }).filter(Boolean).sort(function (a, b) { return b.e.n - a.e.n || b.e.t - a.e.t; });
}

/* ══════════ flashcards: Anki's scheduler (SM-2 as Anki ships it) ══════════
   A card's state is [type, due, ivl, ease, step, reps, lapses]:
   type 1 learning / 3 relearning (due = epoch ms), 2 review (due = day number, ivl in days).
   A card with no state is new. Defaults are Anki's: learning steps 1m 10m, graduating 1d,
   easy 4d, starting ease 250%, hard ×1.2, easy bonus ×1.3, relearn 10m, ease floor 130%.
   The day rolls over at 4 am, as in Anki. */
var SRS = { steps: [1, 10], relearn: [10], grad: 1, easy: 4, ease0: 2500, hard: 1.2, bonus: 1.3, minEase: 1300, maxIvl: 36500, newPerDay: 20, learnAhead: 20 };
function srsDay(t) { var d = new Date((t || Date.now()) - 4 * 36e5); return Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5); }
function cardKey(p) { return p && p[3] ? p[3] : null; }
function cardList() {
  var o = [];
  D.cards.forEach(function (t) { t.c.forEach(function (p, i) {
    o.push({ id: p[3] || ("d" + t.n + "c" + i), old: "d" + t.n + "c" + (p[4] != null ? p[4] : i), topic: t.n, tname: t.t, sec: t.sec, q: p[0], a: p[1], x: p[2] || "" }); }); });
  return o;
}
/* old progress (a level 0 to 3 under the positional id) becomes a real schedule once */
function srsMigrate(all) {
  if (!ST.cards) return;
  var today = srsDay(), now = Date.now(), moved = 0;
  all.forEach(function (c) {
    var v = ST.cards[c.old];
    if (typeof v !== "number") return;
    delete ST.cards[c.old]; moved++;
    if (cs(c.id)) return;
    if (v >= 3) ST.cards[c.id] = [2, today + 3, 7, SRS.ease0, 0, 3, 0];
    else if (v === 2) ST.cards[c.id] = [2, today, 3, SRS.ease0, 0, 2, 0];
    else if (v === 1) ST.cards[c.id] = [1, now, 0, SRS.ease0, 0, 1, 0];
  });
  // levels for decks not loaded yet (locked for now) wait until those decks arrive
  if (moved) save();
}
function cs(id) { var s = ST.cards[id]; return Array.isArray(s) ? s : null; }
function srsNext(s, g) {        // g: 1 again, 2 hard, 3 good, 4 easy -> new state
  var now = Date.now(), today = srsDay(), m = 6e4;
  if (!s) s = [0, 0, 0, SRS.ease0, 0, 0, 0];
  var t = s[0], ivl = s[2], ease = s[3], step = s[4], reps = s[5] + 1, lapses = s[6];
  var grad = function (days) { days = Math.min(SRS.maxIvl, Math.max(1, Math.round(days))); return [2, today + days, days, ease, 0, reps, lapses]; };
  if (t === 0 || t === 1 || t === 3) {
    var steps = t === 3 ? SRS.relearn : SRS.steps;
    if (t === 0) step = 0;
    if (g === 1) return [t === 3 ? 3 : 1, now + steps[0] * m, ivl, ease, 0, reps, lapses];
    if (g === 2) { var d = step === 0 && steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[Math.min(step, steps.length - 1)] * (step === 0 ? 1.5 : 1); return [t === 3 ? 3 : 1, now + d * m, ivl, ease, step, reps, lapses]; }
    if (g === 3) { if (step + 1 < steps.length) return [t === 3 ? 3 : 1, now + steps[step + 1] * m, ivl, ease, step + 1, reps, lapses]; return grad(t === 3 ? Math.max(1, ivl) : SRS.grad); }
    return grad(t === 3 ? Math.max(1, ivl) + 1 : SRS.easy);
  }
  var late = Math.max(0, today - s[1]);
  if (g === 1) { ease = Math.max(SRS.minEase, ease - 200); return [3, now + SRS.relearn[0] * m, 1, ease, 0, reps, lapses + 1]; }
  var hard = Math.max(ivl + 1, ivl * SRS.hard);
  if (g === 2) { ease = Math.max(SRS.minEase, ease - 150); return grad(hard); }
  var good = Math.max(hard + 1, (ivl + late / 2) * ease / 1000);
  if (g === 3) return grad(good);
  ease += 150; return grad(Math.max(good + 1, (ivl + late) * (ease - 150) / 1000 * SRS.bonus));
}
function srsLabel(s, g) {
  var n = srsNext(s, g);
  if (n[0] === 2) { var d = n[2]; return d >= 365 ? (d / 365).toFixed(1) + "y" : d >= 30 ? Math.round(d / 30) + "mo" : d + "d"; }
  var mins = Math.round((n[1] - Date.now()) / 6e4); return mins < 1 ? "<1m" : mins < 60 ? mins + "m" : Math.round(mins / 60) + "h";
}
function srsToday() { var d = ST.cards.__d; if (!d || d.day !== srsDay()) d = ST.cards.__d = { day: srsDay(), n: 0, r: 0 }; return d; }
function srsCounts(list) {
  var now = Date.now(), today = srsDay(), c = { n: 0, l: 0, r: 0 };
  list.forEach(function (x) { var s = cs(x.id); if (!s) c.n++; else if (s[0] === 2) { if (s[1] <= today) c.r++; } else if (s[1] <= now + SRS.learnAhead * 6e4) c.l++; });
  c.nShow = Math.min(c.n, Math.max(0, SRS.newPerDay - srsToday().n));
  return c;
}
/* how well the whole collection is held: a review card counts in full once its interval reaches 21 days */
function cardPct() { var a = cardList(); if (!a.length) return 0; var s = 0; a.forEach(function (c) { var x = cs(c.id); if (x) s += x[0] === 2 ? Math.min(1, x[2] / 21) : 0.08; }); return Math.round(s / a.length * 100); }
function mastered() { var n = 0; cardList().forEach(function (c) { var x = cs(c.id); if (x && x[0] === 2 && x[2] >= 21) n++; }); return n; }
function deckName(n) { var t = D.cards.filter(function (x) { return x.n === n; })[0]; return t ? t.t : "Deck " + n; }

function mockHistory() {
  return Object.keys(ST.att).map(function (pid) {
    var a = ST.att[pid], s = paperScore(pid);
    return a && a.done && a.mode === "mock" && s ? { pid: pid, ts: a.ts || 0, s: s } : null;
  }).filter(Boolean).sort(function (a, b) { return a.ts - b.ts; });
}

/* ══════════ activity rings ══════════
   Three concentric arcs, drawn from twelve o'clock with a round cap, each
   holding one headline number. The dasharray is the full circumference and
   the offset is what is left to do, so @starting-style can sweep them in
   from empty on arrival without a line of script.
   Blue, teal and indigo: cool, cohesive, and clear of the green and red
   that answer state owns. */
function rings(items, size) {
  var R = [86, 63.5, 41], W = 17;
  var body = items.slice(0, 3).map(function (it, i) {
    var r = R[i], c = (2 * Math.PI * r).toFixed(2);
    var p = Math.max(0, Math.min(1, it.p));
    return '<circle class="trk r' + (i + 1) + '" cx="100" cy="100" r="' + r + '"/>' +
      '<circle class="arc r' + (i + 1) + '" cx="100" cy="100" r="' + r +
      '" style="--c:' + c + ';--p:' + p.toFixed(4) + '"/>';
  }).join("");
  return '<svg class="rings" viewBox="0 0 200 200" width="' + (size || 200) + '" height="' + (size || 200) +
    '" role="img" aria-label="' + h(items.map(function (i) { return i.k + " " + i.v; }).join(", ")) + '">' +
    '<g transform="rotate(-90 100 100)" stroke-width="' + W + '" fill="none" stroke-linecap="round">' +
    body + '</g></svg>';
}
function ringLegend(items) {
  return '<ul class="legend">' + items.slice(0, 3).map(function (it, i) {
    return '<li class="r' + (i + 1) + '"><i></i><span class="k">' + h(it.k) + '</span>' +
      '<b data-count="' + it.n + '"' + (it.suffix ? ' data-suffix="' + h(it.suffix) + '"' : '') + '>' +
      h(it.v) + '</b></li>';
  }).join("") + '</ul>';
}

/* ── quiz engine ── */
function quiz(cfg) {
  var i = cfg.startAt ? cfg.startAt() : 0, deadline = null, timer = null;
  var host = document.createElement("div");
  host.className = "quiz";

  function draw(refocus) {
    var q = cfg.qs[i], picked = cfg.get(i), shown = (picked != null || cfg.locked) && !cfg.hide;
    var brief = "";
    if (q.dir) {
      brief = '<div class="brief"><span class="t">Directions</span><p>' + h(q.dir) + '</p>' +
        (q.fig ? '<img src="' + q.fig + '?v=' + FIGV + '" alt="Figure for this question set" loading="lazy">' : '') + '</div>';
    }
    var sm = { r: 0, w: 0, d: 0 };
    if (!cfg.hide) cfg.qs.forEach(function (x, k) { var v = cfg.get(k); if (v != null) { sm.d++; if (v === x.a) sm.r++; else sm.w++; } });
    host.classList.toggle("pq", !cfg.hide);
    host.innerHTML =
      '<a class="kicker" href="' + cfg.back + '">&#8592; ' + h(cfg.backLabel) + '</a>' + (cfg.head || '') +
      (!cfg.hide ? '<div class="pq-prog" aria-hidden="true"><i class="r" style="--w:' + (sm.r / cfg.qs.length) + '"></i><i class="w" style="--w:' + (sm.w / cfg.qs.length) + '"></i></div>' +
        '<div class="pq-sum"><span><b>' + sm.d + '</b> of ' + cfg.qs.length + ' done</span><span class="ok"><b>' + sm.r + '</b> right</span><span class="no"><b>' + sm.w + '</b> wrong</span>' +
        (sm.d ? '<span><b>' + Math.round(sm.r / sm.d * 100) + '%</b> accuracy</span>' : '') + '<span class="pq-keys"><kbd>1</kbd>–<kbd>4</kbd> answer · <kbd>→</kbd> next · <kbd>N</kbd> next unanswered</span></div>' : '') +
      '<div class="qbar" style="margin-top:16px"><span class="c">Question ' + (i + 1) + ' of ' + cfg.qs.length +
        // practice says where a question came from; a mock stays as bare as the hall
        (!cfg.hide && q.t ? ' · ' + h(q.t) : '') + (!cfg.hide && q.src ? ' · ' + h(q.src) : '') + (!cfg.hide ? repChip(q) : '') + '</span>' +
        (cfg.secs ? '<span class="clock" id="clk">00:00</span>' : '') + '</div>' +
      brief +
      '<div class="qstem">' + stemHTML(q) + '</div>' +
      '<div class="opts">' + q.o.map(function (o, k) {
        var c = "opt";
        if (shown) { if (k === q.a) c += " ok"; else if (k === picked) c += " no"; }
        else if (picked === k) c += " picked";   // chosen, not judged
        return '<button class="' + c + '" data-p="' + k + '"' + (shown || cfg.locked ? " disabled" : "") + '>' +
          '<em>' + (cfg.hide ? "ABCDE"[k] : k + 1) + '</em><span>' + optHTML(o) + '</span>' + (shown && k === q.a ? '<b class="mk ok" aria-label="Correct">✓</b>' : shown && k === picked ? '<b class="mk no" aria-label="Your answer">✕</b>' : '') + '</button>';
      }).join("") + '</div>' +
      (shown && q.e ? '<div class="why ' + (picked === q.a ? "ok" : "no") + '"><span class="t">' +
        (picked === q.a ? "Correct" : (picked == null ? "Not attempted. Answer is " : "Answer is ") + "ABCDE"[q.a]) + '</span><p>' + h(q.e).replace(/\n/g, "<br>") + '</p></div>' : '') +
      (shown && !q.e ? '<div class="why ' + (picked === q.a ? "ok" : "no") + '"><span class="t">' +
        (picked === q.a ? "Correct" : (picked == null ? "Not attempted. Answer is " : "Answer is ") + "ABCDE"[q.a]) + '</span><p>' + optHTML(q.o[q.a]) + '</p></div>' : '') +
      '<div class="qnav">' +
        '<button class="btn quiet sm" data-n="-1"' + (i === 0 ? " disabled" : "") + '>&#8592; Prev</button>' +
        '<button class="btn sm" data-n="1"' + (i === cfg.qs.length - 1 ? " disabled" : "") + '>Next' + arr() + '</button>' +
        '<span style="flex:1"></span>' +
        '<button class="btn quiet sm" data-fin="1">' + (cfg.finLabel || 'Finish') + arr() + '</button></div>';

    els("[data-p]", host).forEach(function (b) {
      b.addEventListener("click", function () { cfg.set(i, +b.dataset.p); draw(b.dataset.p); });
    });
    els("[data-n]", host).forEach(function (b) {
      b.addEventListener("click", function () { go(i + +b.dataset.n); });
    });
    el("[data-fin]", host).addEventListener("click", function () { cfg.done(false); });
    if (cfg.secs) tick();
    fitCrops(host);
    drawPads();
    // the repaint destroys the focused node. The answered option is now
    // disabled and cannot take focus, so hand it to the natural next action.
    if (refocus != null) {
      var onward = el('[data-n="1"]:not([disabled])', host) || el('[data-fin]', host);
      if (onward) onward.focus({ preventScroll: true });
    }
    reveal(host);
  }
  function go(k) {
    if (k < 0 || k >= cfg.qs.length) return;
    i = k;
    if (cfg.onMove) cfg.onMove(k);
    draw();
    window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
  }
  function drawPads() {
    var a = el("#pads");
    if (!a) return;
    a.innerHTML = cfg.qs.map(function (q, k) {
      var v = cfg.get(k), c = "pad";
      if (v != null) c += cfg.hide ? " picked" : (v === q.a ? " ok" : " no");
      if (k === i) c += " here";
      return '<button class="' + c + '" data-j="' + k + '">' + (k + 1) + '</button>';
    }).join("");
    els("[data-j]", a).forEach(function (b) { b.addEventListener("click", function () { go(+b.dataset.j); }); });
    els("[data-jump]").forEach(function (b) { if (b.__w) return; b.__w = 1; b.addEventListener("click", function () {
      if (b.dataset.jump === "open") { var j = nextOpen(); if (j >= 0) go(j); return; }
      for (var k = 1; k <= cfg.qs.length; k++) { var x = (i + k) % cfg.qs.length, v = cfg.get(x); if (v != null && v !== cfg.qs[x].a) return go(x); }
    }); });
  }
  function tick() {
    var c = el("#clk", host);
    if (!c || !deadline) return;
    var s = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    c.textContent = (Math.floor(s / 60) < 10 ? "0" : "") + Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    c.classList.toggle("low", s < 300);
    if (s === 0) { clearInterval(timer); cfg.done(true); }
  }
  if (cfg.secs) {
    deadline = cfg.resumeDeadline ? cfg.resumeDeadline() : Date.now() + cfg.secs * 1000;
    timer = setInterval(function () {
      if (!document.body.contains(host)) { clearInterval(timer); return; }
      tick();
    }, 1000);
  }
  function nextOpen() { for (var k = 1; k <= cfg.qs.length; k++) { var j = (i + k) % cfg.qs.length; if (cfg.get(j) == null) return j; } return -1; }
  if (!cfg.hide) document.addEventListener("keydown", function qk(e) {
    if (!document.body.contains(host)) return document.removeEventListener("keydown", qk);
    if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(e.target.tagName || "")) return;
    var q = cfg.qs[i], k = e.key, pick = /^[1-5]$/.test(k) ? +k - 1 : -1;
    if (pick >= 0 && pick < q.o.length && cfg.get(i) == null && !cfg.locked) { cfg.set(i, pick); draw(pick); e.preventDefault(); }
    else if (k === "ArrowRight" || (k === "Enter" && cfg.get(i) != null && e.target.tagName !== "BUTTON")) { e.preventDefault(); go(i + 1); }
    else if (k === "ArrowLeft") { e.preventDefault(); go(i - 1); }
    else if (k === "n" || k === "N") { var j = nextOpen(); if (j >= 0) go(j); }
  });
  host.__pads = function () {
    if (cfg.hide) return '<h4>Questions</h4><div class="pads" id="pads"></div>';
    var side = '<div class="pq-side"><button class="btn quiet sm" data-jump="open">Next unanswered</button><button class="btn quiet sm" data-jump="wrong">Review a wrong one</button></div>' +
      '<p class="pq-legend"><i class="ok"></i>Right <i class="no"></i>Wrong <i></i>Not tried</p>';
    // on a phone the palette sits under the question: the jumps come first and the grid stays folded
    if (innerWidth <= 900) return side + '<details class="pads-fold"><summary><h4>All ' + cfg.qs.length + ' questions</h4></summary><div class="pads" id="pads"></div></details>';
    return '<h4>Questions</h4><div class="pads" id="pads"></div>' + side;
  };
  host.__drawPads = drawPads;
  draw();
  return host;
}

/* ══════════ the exam hall ══════════
   A timed mock that looks and behaves like the SSC computer-based test: full
   screen, section tabs that lock behind you, a question palette with the five
   exam states, and answers that only count once you press Save & Next (as in
   the hall; picking an option alone saves nothing). Keyboard: 1-4 or A-D pick,
   Enter saves, M marks, C clears, arrows move, F full screen, ? help. */
var EXFS = +(localStorage.getItem("cgl-exfs") || 1);
function examHall(cfg) {
  var qs = cfg.qs, n = qs.length, i = Math.min(cfg.startAt ? cfg.startAt() : 0, n - 1), pend = null, timer = null, shownAt = Date.now();
  var host = document.createElement("div");
  host.className = "exam";
  document.body.classList.add("examining");
  var ST_ = { a: "Answered", na: "Not answered", nv: "Not visited", m: "Marked for review", am: "Answered and marked (will be evaluated)" };
  function state(k) {
    var v = cfg.get(k), m = cfg.getMark(k), vis = cfg.visited(k) || k === i;
    if (v != null && m) return "am"; if (v != null) return "a"; if (m) return "m"; return vis ? "na" : "nv";
  }
  function counts() { var c = { a: 0, na: 0, nv: 0, m: 0, am: 0 }; for (var k = 0; k < n; k++) c[state(k)]++; return c; }
  function fmt(s) { s = Math.max(0, s); var m = Math.floor(s / 60), x = s % 60; return (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x; }
  function spent() { return Math.round(((cfg.timeOn(i) || 0) + (Date.now() - shownAt)) / 1000); }
  function keep() { cfg.addTime(i, Date.now() - shownAt); shownAt = Date.now(); }

  function paint() {
    var q = qs[i], c = counts(), saved = cfg.get(i);
    if (pend === undefined) pend = saved;
    var dirty = pend !== saved;
    host.style.setProperty("--exfs", EXFS);
    host.innerHTML =
      '<div class="ex-top">' +
        '<div class="ex-id"><b>' + h(cfg.title) + '</b><span>' + h(cfg.sub) + '</span></div>' +
        '<div class="ex-secs" role="tablist" aria-label="Sections">' + cfg.secs.map(function (s) {
          return '<span class="' + s.st + '">' + (s.st === "gone" ? LOCK : '') + h(s.short) + '</span>'; }).join("") + '</div>' +
        '<div class="ex-tools">' +
          '<div class="ex-clock" id="exclk" role="timer" aria-live="off"><small>Time left</small><b>--:--</b></div>' +
          '<button class="ex-ib" data-x="fs-" title="Smaller text (-)" aria-label="Smaller text">A−</button>' +
          '<button class="ex-ib" data-x="fs+" title="Larger text (+)" aria-label="Larger text">A+</button>' +
          '<button class="ex-ib" data-x="full" title="Full screen (F)" aria-label="Full screen">' + (document.fullscreenElement ? '⤡' : '⤢') + '</button>' +
          '<button class="ex-ib" data-x="help" title="Instructions and shortcuts (?)" aria-label="Instructions">?</button>' +
          '<button class="ex-ib ex-pal-b" data-x="pal" aria-label="Question palette">' + (c.a + c.am) + '/' + n + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ex-body">' +
        '<div class="ex-main">' +
          '<div class="ex-qh"><b>Question ' + (i + 1) + '</b><span class="ex-mk">Marks <em class="p">+' + cfg.plus + '</em> <em class="m">−' + cfg.minus + '</em></span>' +
            '<span class="ex-tq">Time on this question <b id="extq">' + fmt(spent()) + '</b></span></div>' +
          '<div class="ex-q">' +
            (q.dir ? '<div class="brief"><span class="t">Directions</span><p>' + h(q.dir) + '</p>' + (q.fig ? '<img src="' + q.fig + '?v=' + FIGV + '" alt="Figure for this question set" loading="lazy">' : '') + '</div>' : '') +
            '<div class="qstem">' + stemHTML(q) + '</div>' +
            '<div class="ex-opts" role="radiogroup" aria-label="Options">' + q.o.map(function (o, k) {
              return '<label class="ex-opt' + (pend === k ? ' on' : '') + '"><input type="radio" name="exo" value="' + k + '"' + (pend === k ? ' checked' : '') + '>' +
                '<i>' + (k + 1) + '</i><span>' + optHTML(o) + '</span></label>'; }).join("") + '</div>' +
            (dirty ? '<p class="ex-warn">' + (pend == null ? 'Response cleared but not saved.' : 'Not saved yet.') + ' Press <b>Save &amp; Next</b> to keep it.</p>' : '') +
          '</div>' +
          '<div class="ex-act">' +
            '<button class="ex-b mark" data-x="mark">Mark for Review &amp; Next</button>' +
            '<button class="ex-b" data-x="clear">Clear Response</button>' +
            '<span class="ex-sp"></span>' +
            '<button class="ex-b" data-x="prev"' + (i ? '' : ' disabled') + '>Previous</button>' +
            '<button class="ex-b save" data-x="save">Save &amp; Next</button>' +
          '</div>' +
        '</div>' +
        '<div class="ex-side" id="exside">' +
          '<div class="ex-who"><span>' + h(((AU && AU.name) || "C").charAt(0).toUpperCase()) + '</span><div><b>' + h((AU && AU.name) || "Candidate") + '</b><small>' + h(cfg.secName) + '</small></div></div>' +
          '<ul class="ex-leg">' + ["a", "na", "nv", "m", "am"].map(function (s) { return '<li><i class="st ' + s + '">' + c[s] + '</i>' + ST_[s] + '</li>'; }).join("") + '</ul>' +
          '<div class="ex-grid">' + qs.map(function (x, k) { return '<button class="st ' + state(k) + (k === i ? ' here' : '') + '" data-j="' + k + '" aria-label="Question ' + (k + 1) + ', ' + ST_[state(k)] + '">' + (k + 1) + '</button>'; }).join("") + '</div>' +
          '<button class="ex-b save ex-sub" data-x="submit">' + h(cfg.finLabel) + '</button>' +
          '<a class="ex-exit" href="' + cfg.exit + '">Leave for now · the clock keeps running</a>' +
        '</div>' +
      '</div>';
    fitCrops(host);
    tick();
  }
  function go(k, save) {
    if (k < 0 || k >= n) return;
    keep();
    if (save) cfg.set(i, pend);
    cfg.markVisited(i);
    i = k; pend = undefined; cfg.onMove(i); cfg.markVisited(i);
    paint();
    var m = el(".ex-main", host); if (m) m.scrollTop = 0;
  }
  function saveNext() { cfg.set(i, pend); keep(); if (i < n - 1) go(i + 1); else { pend = undefined; paint(); summary(); } }
  function markNext() { cfg.set(i, pend); cfg.setMark(i, true); keep(); if (i < n - 1) go(i + 1); else { pend = undefined; paint(); } }
  function modal(html, wire) {
    var m = document.createElement("div"); m.className = "ex-modal"; m.innerHTML = '<div class="ex-mb" role="dialog" aria-modal="true">' + html + '</div>';
    host.appendChild(m); wire(m, function () { m.remove(); });
    var f = el("button", m); if (f) f.focus();
  }
  function summary(timedOut) {
    var c = counts();
    var rows = [["Total questions", n], ["Answered", c.a], ["Not answered", c.na], ["Marked for review", c.m], ["Answered and marked", c.am], ["Not visited", c.nv]];
    if (timedOut) { finish(true); return; }
    modal('<h3>' + h(cfg.finLabel) + '?</h3><p>' + h(cfg.lockNote) + '</p><table class="ex-sum"><tbody>' +
      rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join("") + '</tbody></table>' +
      '<div class="ex-mact"><button class="ex-b" data-m="no">No, go back</button><button class="ex-b save" data-m="yes">Yes, submit</button></div>', function (m, close) {
      el('[data-m="no"]', m).addEventListener("click", close);
      el('[data-m="yes"]', m).addEventListener("click", function () { close(); finish(false); });
    });
  }
  function finish(timedOut) {
    keep(); clearInterval(timer); document.removeEventListener("keydown", onKey);
    cfg.submit(timedOut);
  }
  function help() {
    modal('<h3>Instructions</h3><ul class="ex-help">' +
      '<li>Pick an option, then press <b>Save &amp; Next</b>. An option you pick but do not save is not counted, as in the exam.</li>' +
      '<li><b>Mark for Review &amp; Next</b> saves your pick and flags the question. Answered and marked questions are evaluated.</li>' +
      '<li>Each section has its own clock and locks when you submit it or its time runs out.</li>' +
      '<li>Right answer +' + cfg.plus + ', wrong answer −' + cfg.minus + ', blank 0.</li></ul>' +
      '<h4>Keyboard</h4><table class="ex-keys"><tbody>' + [["1 – 4 or A – D", "Pick an option"], ["Enter", "Save & Next"], ["M", "Mark for Review & Next"], ["C", "Clear Response"], ["← →", "Previous / next question"], ["F", "Full screen"], ["+ / −", "Text size"]].map(function (r) {
        return '<tr><th><kbd>' + h(r[0]) + '</kbd></th><td>' + h(r[1]) + '</td></tr>'; }).join("") + '</tbody></table>' +
      '<div class="ex-mact"><button class="ex-b save" data-m="ok">Back to the paper</button></div>', function (m, close) { el('[data-m="ok"]', m).addEventListener("click", close); });
  }
  function full() {
    if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  }
  function size(d) { EXFS = Math.max(0.85, Math.min(1.4, +(EXFS + d).toFixed(2))); try { localStorage.setItem("cgl-exfs", EXFS); } catch (e) {} host.style.setProperty("--exfs", EXFS); }
  host.addEventListener("click", function (e) {
    var t = e.target.closest("[data-x],[data-j],input[name=exo]");
    if (!t) return;
    if (t.name === "exo") { pend = +t.value; paint(); return; }
    if (t.dataset.j != null) { go(+t.dataset.j, false); host.classList.remove("pal-open"); return; }
    var x = t.dataset.x;
    if (x === "save") saveNext(); else if (x === "mark") markNext();
    else if (x === "clear") { pend = null; cfg.set(i, null); cfg.setMark(i, false); paint(); }
    else if (x === "prev") go(i - 1, false);
    else if (x === "submit") summary(false);
    else if (x === "full") full(); else if (x === "help") help();
    else if (x === "fs+") size(.05); else if (x === "fs-") size(-.05);
    else if (x === "pal") host.classList.toggle("pal-open");
  });
  function onKey(e) {
    if (!document.body.contains(host)) { document.removeEventListener("keydown", onKey); return; }
    if (el(".ex-modal", host)) { if (e.key === "Escape") { var mm = el(".ex-modal", host); if (mm) mm.remove(); } return; }
    if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test((e.target.tagName || "")) && e.target.name !== "exo") return;
    var k = e.key, q = qs[i];
    var pick = /^[1-5]$/.test(k) ? +k - 1 : /^[a-eA-E]$/.test(k) ? "abcde".indexOf(k.toLowerCase()) : -1;
    if (pick >= 0 && pick < q.o.length) { pend = pick; paint(); e.preventDefault(); return; }
    if (k === "Enter") { e.preventDefault(); saveNext(); }
    else if (k === "m" || k === "M") markNext();
    else if (k === "c" || k === "C") { pend = null; cfg.set(i, null); cfg.setMark(i, false); paint(); }
    else if (k === "ArrowRight") { e.preventDefault(); go(i + 1, false); }
    else if (k === "ArrowLeft") { e.preventDefault(); go(i - 1, false); }
    else if (k === "f" || k === "F") full();
    else if (k === "?") help();
    else if (k === "+" || k === "=") size(.05); else if (k === "-") size(-.05);
  }
  document.addEventListener("keydown", onKey);
  document.addEventListener("fullscreenchange", function fsc() { if (!document.body.contains(host)) return document.removeEventListener("fullscreenchange", fsc); var b = el('[data-x="full"]', host); if (b) b.textContent = document.fullscreenElement ? "⤡" : "⤢"; });
  function tick() {
    var c = el("#exclk", host), s = Math.round((cfg.deadline() - Date.now()) / 1000);
    if (c) { el("b", c).textContent = fmt(s); c.classList.toggle("low", s < 300); c.classList.toggle("crit", s < 60); }
    var tq = el("#extq", host); if (tq) tq.textContent = fmt(spent());
    if (s <= 0) finish(true);
  }
  timer = setInterval(function () { if (!document.body.contains(host)) { clearInterval(timer); document.removeEventListener("keydown", onKey); return; } tick(); }, 500);
  cfg.markVisited(i);
  pend = undefined; paint();
  return host;
}


/* ══════════ the plan, built for the days you have ══════════
   From the day the plan was made to the day before the exam. The last day is
   rest, the one before it a dress rehearsal, a revision block before that,
   and the rest learn topics heaviest first, notes before questions. Hours a
   day decide how many topics fit; what does not fit is named, not hidden. */
function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function parseYmd(x) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function dayOnly(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
var PLANC = null, PLANK = "";
function buildPlan() {
  var P = ST.profile || {};
  var exam = parseYmd(P.exam); if (!exam) return null;
  var start = parseYmd(P.start) || dayOnly(new Date());
  var key = P.exam + P.start + P.hours; if (PLANC && PLANK === key) return PLANC;
  var N = Math.round((exam - start) / 864e5);              // study days before the exam day
  var out = { days: [], skipped: [], N: N, start: start, exam: exam };
  if (N <= 0) { PLANC = out; PLANK = key; return out; }
  var hours = +P.hours || 6;
  var L = function (sk, t) { return "<a href='#/learn/" + sk + "/" + encodeURIComponent(t) + "'>" + h(t) + "</a>"; };
  var CA = ((D.meta && D.meta.months) || []).map(function (m) { return m; });
  var rest = N >= 2 ? 1 : 0, dress = N >= 4 ? 1 : 0;
  var R = N >= 12 ? Math.max(2, Math.round(N * 0.15)) : N >= 7 ? 1 : 0;
  var Ld = Math.max(0, N - rest - dress - R);
  // topics, heaviest first, as {s,t,w,cost}
  var tops = [];
  (D.syllabus.sections || []).forEach(function (x) {
    x.topics.forEach(function (t) { var w = parseFloat(t.w) || (t.w ? 0.5 : 0.2); tops.push({ s: x.k, t: t.n, w: w, cost: w >= 2 ? 1 : w >= 1 ? 0.75 : 0.5 }); });
  });
  tops.sort(function (a, b) { return b.w - a.w; });
  var perDay = Math.max(1.5, (hours - (N <= 45 ? 2.5 : 1.5) - 1) / 1.4);   // topic blocks after mock + review and CA
  var cap = Ld * perDay, used = 0, chosen = [];
  tops.forEach(function (t) { if (used + t.cost <= cap + 0.01) { chosen.push(t); used += t.cost; } else out.skipped.push(t); });
  // deal topics into days, mixing sections: take from each section in turn
  var bySec = {}; chosen.forEach(function (t) { (bySec[t.s] = bySec[t.s] || []).push(t); });
  var order = ["Q", "R", "E", "G"], dayTopics = [], i;
  for (i = 0; i < Ld; i++) dayTopics.push([]);
  var d = 0, left = chosen.length, load = new Array(Ld).fill(0);
  while (left > 0 && Ld > 0) {
    order.forEach(function (sk) {
      var q = bySec[sk]; if (!q || !q.length) return;
      var t = q.shift(); left--;
      // next day with room, starting where we are
      for (var k = 0; k < Ld; k++) { var j = (d + k) % Ld; if (load[j] + t.cost <= perDay + 0.3 || k === Ld - 1) { dayTopics[j].push(t); load[j] += t.cost; d = (j + (load[j] >= perDay ? 1 : 0)) % Ld; break; } }
    });
  }
  var caPer = Ld ? Math.max(1, Math.ceil(CA.length / Ld)) : 0, ci = 0;
  var mockDaily = N <= 30;
  var EVE = "Evening: <a href='#/cards'>flashcards</a> 30 minutes, then clear what you can of the <a href='#/errors'>error log</a>";
  var MOCK = "Morning: one <a href='#/mocks'>2025 paper</a> as a full mock, 60 minutes in four locked sections, then review every miss";
  for (i = 0; i < Ld; i++) {
    var tasks = [], tp = dayTopics[i];
    if (i === 0) {
      tasks.push("Watch the 25-minute <a href='https://www.youtube.com/watch?v=qCEiQjnrboU' target='_blank' rel='noopener'>Assertion & Reason video</a>: a question type new for 2026");
      tasks.push("Sit one <a href='#/mocks'>2025 paper</a> as a full mock to see where you stand, then review every miss");
      tasks.push("Skim <a href='#/analysis'>Analysis</a>: what 2025 asked, and the count per topic to expect");
    } else if (mockDaily || (N - i) <= 21 || i % 2 === 1) tasks.push(MOCK);
    if (tp.length) tasks.push("For each topic: read its notes, watch the lesson, tick <i>learned</i>, then do its past questions");
    order.forEach(function (sk) {
      var ts = tp.filter(function (t) { return t.s === sk; });
      if (ts.length) tasks.push(secOf(sk).short + ": " + ts.map(function (t) { return L(t.s, t.t); }).join(", "));
    });
    var cm = CA.slice(ci, ci + caPer); ci += caPer;
    if (cm.length) tasks.push("Current affairs: " + cm.map(function (m) { return "<a href='#/ca/" + m.m + "'>" + h(m.label) + "</a>"; }).join(", ") + ", then its test");
    tasks.push(EVE);
    var title = tp.slice(0, 3).map(function (t) { return t.t; }).join(" · ") || (i === 0 ? "Diagnostic" : "Practice and review");
    out.days.push({ t: i === 0 && !tp.length ? "Diagnostic" : title, goal: i === 0 ? "Measure first, then learn the heaviest topics." : tp.length ? tp.length + " topic" + (tp.length === 1 ? "" : "s") + ", notes first, then every past question." : "Mixed practice on what the error log says.", tasks: tasks });
  }
  for (i = 0; i < R; i++) {
    var rt = [MOCK];
    if (i === 0) rt.push("Work the whole <a href='#/errors'>error log</a>. Anything wrong a second time: reopen that topic in <a href='#/learn'>Learn</a>");
    rt.push("In <a href='#/learn'>Learn</a>, read only the last box on each topic page, <i>Before the exam, read only this</i>, heaviest topics first");
    rt.push(i === R - 1 ? "<a href='#/mock/guess-B'>Guess paper B</a> in the afternoon, full review" : "Current affairs: reread the last three months, then their tests");
    rt.push(EVE);
    out.days.push({ t: "Revision " + (i + 1), goal: "Nothing new now. Everything learned from here costs something you already know.", tasks: rt });
  }
  if (dress) out.days.push({ t: "Dress rehearsal", goal: "Sit it the way you will on the day, at the time of your shift.", tasks: [
    "<a href='#/mock/guess-A'>Guess paper A</a> at your actual shift time", "Review it, then clear the <a href='#/errors'>error log</a>", "Light <a href='#/cards'>flashcards</a> only. Stop by 9 pm"] });
  if (rest) out.days.push({ t: "Day before", goal: "Rest wins more marks tomorrow than one more mock today.", tasks: [
    "No mock. 60 minutes of <a href='#/cards'>flashcards</a> and the <a href='#/errors'>error log</a>, nothing new",
    "Admit card printed, photo ID and the photographs the notice asks for, reporting time checked",
    "Route to the centre checked. Sleep early"] });
  if (!out.days.length) out.days.push({ t: "Exam eve", goal: "One calm hour.", tasks: ["Formula and idiom <a href='#/cards'>flashcards</a>, then the <a href='#/errors'>error log</a>. Sleep early"] });
  PLANC = out; PLANK = key; return out;
}

/* ══════════ views ══════════ */
var V = {};

V[""] = function () {
  if (stage() === "t2") return t2Wait(t2Home);
  var t = totals(), d = days(), hist = mockHistory(), last = hist[hist.length - 1];
  var weak = weakest(3), nErr = errList().length;
  var ring = [
    { k: "Questions", p: t.total ? t.done / t.total : 0, n: t.done, v: String(t.done), suffix: " of " + t.total },
    { k: "Accuracy", p: t.acc / 100, n: t.acc, v: t.acc + "%", suffix: "%" },
    { k: "Cards", p: cardPct() / 100, n: cardPct(), v: cardPct() + "%", suffix: "%" }
  ];
  var next = [], nRep = repList().length;
  if (nRep) next.push(["#/practice/repeats", nRep + " questions SSC asked more than once this year", "Recalled in two or more 2026 shifts or sets. The likeliest to come back; do them first."]);
  if (!hist.length) next.push(["#/mocks", "Sit your first full mock", "One past paper under the 2026 rules: four sections, 15 minutes each, minus half a mark per miss. It tells you where the next fifteen days go."]);
  if (nErr) next.push(["#/errors", nErr + " question" + (nErr === 1 ? "" : "s") + " in your error log", "Each one leaves the log after you get it right twice in a row."]);
  weak.forEach(function (w) {
    if (next.length >= 4) return;
    // an unlearned topic opens on its notes; a learned one goes to its questions
    if (!learned(w.s, w.t)) next.push([learnHref(w.s, w.t), "Learn " + w.t,
      (w.done >= 3 ? w.acc + "% right so far. " : "") + "Notes, formulas and a lesson on the page, then its " + w.n + " past questions."]);
    else next.push([pracHref(w.s, w.t), secOf(w.s).short + ": " + w.t,
      w.done >= 3 ? w.acc + "% accurate across " + w.done + " attempts. Your weakest topic that carries marks." : w.n + " past questions, not yet started."]);
  });
  if (next.length < 3) next.push(["#/cards", "Flashcards", "Vocab, idioms and static GK. Ten minutes whenever you are between blocks."]);
  var nextHTML = '<section class="band next-up"><h2 class="sec-h reveal">Do this next</h2>' +
      '<div class="list" style="margin-top:22px">' + next.slice(0, 4).map(function (x, i) {
        return '<a class="item reveal" href="' + x[0] + '"><span class="num">' + (i + 1) + '</span>' +
          '<span><span class="t">' + h(x[1]) + '</span><span class="d">' + h(x[2]) + '</span></span></a>';
      }).join("") + '</div></section>';

  return modeSwitch() + '<section class="head hero">' +
    '<div class="hero-t">' +
      '<span class="kicker reveal">Tier 1 · your shift · ' + h(examLabel({ day: "numeric", month: "long", year: "numeric" })) + '</span>' +
      '<h1 class="page-h reveal">' + (d ? d + ' day' + (d === 1 ? '' : 's') + ' left.' : 'Exam day.') + '</h1>' +
      '<p class="lede reveal">SSC CGL 2026. Four sections, 25 questions each, 15 minutes each, two marks right and half a mark lost wrong.</p>' +
    '</div>' +
    '<figure class="hero-g reveal">' + rings(ring) + ringLegend(ring) + '</figure>' +
    '</section>' +

    (D.lastday && d <= 3 ? '<a class="ld-band reveal" href="#/lastday"><span class="ld-k">' + (d === 0 ? 'Exam day' : d === 1 ? 'Exam tomorrow' : d + ' days to go') + '</span><b>The last-day sheet</b><span class="d">Only what the 2026 shifts asked, with the fastest way to do each. Read it tonight and once more in the morning.</span></a>' : '') +
    nextHTML +
    '<div class="stats reveal">' +
      '<div class="stat"><div class="k">Last mock</div><div class="v">' + (last ? last.s.marks.toFixed(1) + '<small> / 200</small>' : '—') + '</div>' +
        '<div class="s">' + (last ? hist.length + ' mock' + (hist.length === 1 ? '' : 's') + ' taken' : 'none yet') + '</div></div>' +
      '<div class="stat"><div class="k">Accuracy</div><div class="v">' + t.acc + '%</div>' +
        '<div class="s">' + (t.done ? t.right + ' right of ' + t.done : 'nothing answered yet') + '</div></div>' +
      '<div class="stat"><div class="k">Error log</div><div class="v">' + nErr + '</div>' +
        '<div class="s">questions still to clear</div></div>' +
      '<div class="stat"><div class="k">Cards locked in</div><div class="v">' + mastered() + '<small> / ' + cardList().length + '</small></div>' +
        '<div class="s">three right in a row</div></div>' +
    '</div>' +

    t2Band("home") + foot();
};

/* ── plan ── */
function planDay(i) { var P = buildPlan(); var d = new Date(P.start.getTime() + i * 864e5); return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); }
function planDate(i) { var P = buildPlan(); return ymd(new Date(P.start.getTime() + i * 864e5)); }
function todayIndex() {
  var P = buildPlan(); if (!P || !P.days.length) return 0;
  return Math.max(0, Math.min(P.days.length - 1, Math.round((dayOnly(new Date()) - P.start) / 864e5)));
}
function planTotal() { var P = buildPlan(); return P ? P.days.reduce(function (a, s) { return a + s.tasks.length; }, 0) : 0; }
V["plan"] = function () {
  var P = buildPlan();
  if (!P) { location.hash = "#/welcome"; return ""; }
  if (P.N <= 0) return '<section class="head"><span class="kicker">Your exam</span><h1 class="page-h">It is here.</h1><p class="lede">Your exam date, ' + h(examLabel()) + ', is today or past. Change it if your shift moved, or move on to Tier 2.</p><div style="margin-top:22px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn key" href="#/tier2/plan">Plan Tier 2' + arr() + '</a><a class="btn quiet" href="#/welcome">Change exam date' + arr() + '</a></div></section>' + foot();
  var ids = []; P.days.forEach(function (s, i) { s.tasks.forEach(function (t, k) { ids.push(planDate(i) + "t" + k); }); });
  var done = ids.filter(function (k) { return ST.plan[k]; }).length, total = ids.length;
  var today = todayIndex();
  return '<section class="head">' +
      '<span class="kicker reveal">Day ' + (today + 1) + ' of ' + P.N + ' · ' + done + ' of ' + total + ' done</span>' +
      '<h1 class="page-h reveal">' + days() + ' day' + (days() === 1 ? '' : 's') + ' to ' + h(examLabel({ day: "numeric", month: "long" })) + '.</h1>' +
      '<p class="lede reveal">Built for ' + ((ST.profile || {}).hours || 6) + ' hours a day. Topics come heaviest first, notes and a lesson before their past questions; the last days are revision, a dress rehearsal and rest.</p>' +
      '<div class="track reveal" style="max-width:320px;margin-top:22px"><i style="--p:' + (pc(done, total) / 100) + '"></i></div>' +
      '<div class="reveal" style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn quiet sm" href="#/welcome">Change date or hours' + arr() + '</a><a class="btn quiet sm" href="#/tier2/plan">Tier 2 plan' + arr() + '</a></div>' +
      (P.skipped.length ? '<details class="offic reveal" style="margin-top:16px"><summary>' + P.skipped.length + ' lighter topic' + (P.skipped.length === 1 ? '' : 's') + ' did not fit</summary><p>' +
        h(P.skipped.map(function (t) { return t.t; }).join(", ")) + '. They carry the fewest marks; do them if a day runs short.</p></details>' : '') +
    '</section>' +
    '<div class="plan">' + P.days.map(function (s, i) {
      return '<details class="sess reveal"' + (i === today ? " open" : "") + '>' +
        '<summary><span class="sd">' + (i === today ? "Today" : planDay(i)) + '</span><span class="st">' + h(s.t) + '</span><span class="tag' + (i === today ? " key" : "") + '">Day ' + (i + 1) + '</span></summary>' +
        '<div class="body"><p class="goal">' + h(s.goal) + '</p><div class="blk">' +
        s.tasks.map(function (t, k) {
          var id = planDate(i) + "t" + k;
          return '<label class="task"><input type="checkbox" data-plan="' + id + '"' + (ST.plan[id] ? " checked" : "") + '><span>' + t + '</span></label>';
        }).join("") + '</div></div></details>';
    }).join("") + '</div>' + foot();
};

/* ── mocks ── */
V["mocks"] = function () {
  var byYear = {}, full = ((D.meta && D.meta.papers) || mockPapers()).filter(function (p) { return !p.bank; });
  full.forEach(function (p) { (byYear[p.year] = byYear[p.year] || []).push(p); });
  var years = Object.keys(byYear).sort().reverse().sort(function (a, b) { return (a === "Practice sets") - (b === "Practice sets"); });
  return '<section class="head">' +
      '<span class="kicker reveal">' + full.length + ' full papers · ' + ((D.meta && D.meta.questions) || 0).toLocaleString("en-IN") + ' past questions in practice</span>' +
      '<h1 class="page-h reveal">Mocks.</h1>' +
      '<p class="lede reveal">Real Tier 1 shifts. Mock mode runs them the way your shift will: Reasoning, GA, Quant, English, fifteen minutes each, no going back to a finished section.</p>' +
    '</section>' + t2Band("mocks") +
    years.map(function (y) {
      // recalled 2026 papers: one block per exam day, shift by shift
      var memo = byYear[y].filter(function (p) { return p.memo; });
      if (memo.length) {
        var days = {}, order = [];
        memo.forEach(function (p) { var d = p.id.slice(0, 10); if (!days[d]) { days[d] = []; order.push(d); } days[d].push(p); });
        order.sort().reverse();
        var rest = byYear[y].filter(function (p) { return !p.memo; });
        var nRep = repList().length;
        return '<section class="band"><h2 class="sec-h reveal">' + y + ' <small class="muted">memory-based, day by day</small></h2>' +
          (nRep ? '<div class="list reveal" style="margin:0 0 22px"><a class="item" href="#/practice/repeats"><span class="num">' + nRep + '</span><span><span class="t">Asked more than once this year <span class="pyq rep">Repeated</span></span>' +
            '<span class="d">The same question recalled in two or more 2026 shifts or sets. The likeliest to come back; practise these first.</span></span></a></div>' : '') +
          order.map(function (d) {
            var ps = days[d].sort(function (a, b) { return a.id < b.id ? -1 : 1; });
            var dl = (ps[0].label.split(",")[0] || d);
            var have = {}; ps.forEach(function (p) { var m = /-s([123])$/.exec(p.id); if (m) have[m[1]] = 1; });
            return '<div class="mday reveal"><div class="mday-h"><h3>' + h(dl) + '</h3><span class="mday-s">' + ["1", "2", "3"].map(function (n) { return '<i class="' + (have[n] ? 'on' : '') + '" title="Shift ' + n + (have[n] ? '' : ': not published yet') + '">S' + n + '</i>'; }).join("") + '</span></div>' +
              '<div class="list">' + ps.map(function (p) {
                var a = att(p.id), sc = a && a.done ? paperScore(p.id) : null, m = /-s([123])$/.exec(p.id), xs = /-x(\d*)$/.exec(p.id);
                var nm = m ? "Shift " + m[1] : "All shifts, set " + (xs && xs[1] ? xs[1] : "1");
                return '<div class="item mrow' + (sc ? " done" : "") + '"><a class="mr-main" href="#/mock/' + encodeURIComponent(p.id) + '"><span class="num">' + (m ? m[1] : "·") + '</span>' +
                  '<span><span class="t">' + h(nm) + '</span><span class="d">' + (m ? '' : 'shift of each question not known · ') + (p.n || (p.qs || []).length) + ' questions · free' + (a && !a.done ? ' · in progress' : '') + '</span></span>' +
                  '<span class="end">' + (sc ? '<b>' + sc.marks.toFixed(1) + '</b>of 200' : '') + '</span></a>' +
                  '<a class="mr-key" href="#/mock/' + encodeURIComponent(p.id) + '/paper">With answers' + arr() + '</a></div>';
              }).join("") + '</div></div>';
          }).join("") +
          (rest.length ? '<div class="list" style="margin-top:18px">' + rest.map(function (p) { return '<a class="item" href="#/mock/' + encodeURIComponent(p.id) + '"><span class="num">·</span><span><span class="t">' + h(p.label) + '</span></span></a>'; }).join("") + '</div>' : '') +
          '</section>';
      }
      return '<section class="band"><h2 class="sec-h reveal">' + y + '</h2><div class="list" style="margin-top:18px">' +
        byYear[y].map(function (p) {
          var a = att(p.id), s = a && a.done ? paperScore(p.id) : null, open = paperOpen(p.id);
          var sh = (/-s(\d)$/.exec(p.id) || [])[1] || (p.guess ? p.id.slice(-1) : "·");
          return '<a class="item reveal' + (s ? " done" : "") + (open ? "" : " locked") + '" href="#/mock/' + encodeURIComponent(p.id) + '">' +
            '<span class="num">' + sh + '</span>' +
            '<span><span class="t">' + h(p.label) + '</span><span class="d">' + (p.n || (p.qs || []).length) + ' questions' + (a && !a.done ? ' · in progress' : '') + (open && !isPremium() ? ' · free' : '') + '</span></span>' +
            '<span class="end">' + (!open ? '<span class="tag lock">' + LOCK + 'Premium</span>' : s ? '<b>' + s.marks.toFixed(1) + '</b>of 200' : '') + '</span></a>';
        }).join("") + '</div></section>';
    }).join("") + caTestsBand() + foot();
};
function caTestsBand() {
  var M = ((D.ca || {}).months || []).filter(function (x) { return x.test && x.test.length; });
  if (!M.length) return '';
  return '<section class="band"><div class="band-h"><h2 class="sec-h reveal">Current affairs tests</h2><span class="muted reveal">20 questions a month, ' + caSpan().from + ' to ' + caSpan().to + '</span></div>' +
    '<div class="tgrid">' + M.slice().reverse().map(function (x) {
      var sc = caScore(x.m);
      return '<a class="tcard t-g reveal" href="#/ca/test/' + x.m + '"><span class="tc-top"><span class="tc-w"><b>' + x.test.length + '</b> questions</span>' +
        (sc && sc.n ? '<span class="tag ' + (sc.right / sc.total >= 0.75 ? 'ok' : sc.right / sc.total >= 0.5 ? '' : 'no') + '">' + sc.right + ' / ' + sc.total + '</span>' : '') + '</span>' +
        '<span class="tc-t">' + h(x.label) + '</span><span class="tc-d">' + (sc && sc.n ? 'Retake' : 'Not taken yet') + '</span></a>';
    }).join("") + '</div></section>';
}

V["mock"] = function (pid) {
  if (!paperOpen(pid)) {
    var mp = ((D.meta && D.meta.papers) || []).filter(function (x) { return x.id === pid; })[0] || { label: pid };
    return '<section class="head"><a class="kicker" href="#/mocks">&#8592; All mocks</a><h1 class="page-h reveal">' + h(mp.label) + '</h1></section>' +
      upsell("This mock is in the Exam Pass", "Your free plan has " + FREE().papers.length + " complete mocks. The Exam Pass opens every 2024 and 2025 shift and both guess papers.") + foot();
  }
  var p = paper(pid); if (!p) return blank();
  var a = att(pid), s = a && a.done ? paperScore(pid) : null;
  return '<section class="head">' +
    '<a class="kicker" href="#/mocks">&#8592; All mocks</a>' +
    '<h1 class="page-h reveal">' + h(p.label) + '</h1>' +
    '<p class="lede reveal">' + p.qs.length + ' questions. ' + (p.src ? 'Source: ' + h(p.src) + '.' : '') + '</p>' +
    (p.memo ? '<p class="memo-note reveal">Memory-based: candidates recalled these questions after the exam, so wording can differ slightly from the real paper. Every answer and solution is worked out by us.</p>' : '') +
    (p.practice ? '<p class="memo-note reveal">A practice set from a coaching institute\'s test in the CGL 2026 pattern. It is not a real SSC paper, so it is kept apart from the 2026 papers and the notes do not mark these questions as asked.</p>' : '') +
    (!AU ? '<a class="freebar reveal" href="#/account"><span>Free for everyone, no sign-in needed. Your answers stay in this browser. Create a free account to keep them and get 5 days of every paper, note and mock.</span><b>Sign up' + arr() + '</b></a>' : '') +
    (s ? '<p class="muted reveal" style="margin-top:14px">Last attempt: ' + s.marks.toFixed(2) + ' of 200, ' + s.right + ' right, ' + s.wrong + ' wrong.</p>' : '') +
    '<div class="reveal" style="display:flex;gap:10px;margin-top:26px;flex-wrap:wrap">' +
      '<a class="btn key" href="#/mock/' + encodeURIComponent(pid) + '/run">' + (a && !a.done && a.mode === "mock" ? "Resume mock" : "Start mock, 60 min") + arr() + '</a>' +
      (s ? '<a class="btn quiet" href="#/mock/' + encodeURIComponent(pid) + '/review">Review answers' + arr() + '</a>' : '') +
      '<a class="btn quiet" href="#/mock/' + encodeURIComponent(pid) + '/practice">Practice, untimed' + arr() + '</a>' +
      '<a class="btn quiet" href="#/mock/' + encodeURIComponent(pid) + '/paper">Question paper with answers' + arr() + '</a></div>' +
    '<p class="muted reveal" style="margin-top:18px;font-size:14px">Mock mode hides every answer until the paper ends. Practice shows the answer the moment you pick.</p>' +
    (a ? '<button class="btn quiet sm reveal" style="margin-top:22px" data-clear-paper="' + h(pid) + '">Clear this paper</button>' : '') +
    '</section>' + foot();
};

/* the whole paper as a key: every question with the right option marked and its solution open */
document.addEventListener("click", function (e) {
  var a = e.target.closest && e.target.closest("[data-kp]"); if (!a) return;
  e.preventDefault(); var t = document.getElementById("kp-" + a.dataset.kp); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
});
V["mockpaper"] = function (pid) {
  if (!paperOpen(pid)) { location.hash = "#/mock/" + encodeURIComponent(pid); return ""; }
  var p = paper(pid); if (!p) return blank();
  var by = {}, n = 0;
  p.qs.forEach(function (q) { (by[q.s] = by[q.s] || []).push(q); });
  var secs = SECS.filter(function (x) { return by[x.k]; });
  return '<section class="head"><a class="kicker" href="#/mock/' + encodeURIComponent(pid) + '">&#8592; ' + h(p.label) + '</a>' +
      '<h1 class="page-h reveal">Question paper with answers.</h1>' +
      '<p class="lede reveal">' + p.qs.length + ' questions, the right option marked and the full solution under each. ' + (p.memo ? 'Memory-based: recalled by candidates after the shift, solved by us.' : '') + '</p>' +
      '<div class="kp-act reveal"><a class="btn key" href="#/mock/' + encodeURIComponent(pid) + '/run">Take it as a mock' + arr() + '</a><a class="btn quiet" href="#/mock/' + encodeURIComponent(pid) + '/practice">Practise, answers hidden' + arr() + '</a></div>' +
      '<nav class="kp-nav reveal" aria-label="Sections">' + secs.map(function (x) { return '<a href="#kp-' + x.k + '" data-kp="' + x.k + '">' + h(x.short) + ' <small>' + by[x.k].length + '</small></a>'; }).join("") + '</nav>' +
    '</section>' +
    secs.map(function (x) {
      return '<section class="band kp-sec" id="kp-' + x.k + '"><h2 class="sec-h">' + h(x.name) + '</h2>' + by[x.k].map(function (q) {
        n++;
        return '<article class="kp-q"><div class="qbar"><span class="c">Q' + n + (q.t ? ' · ' + h(q.t) : '') + repChip(q) + '</span></div>' +
          '<div class="qstem">' + stemHTML(q) + '</div>' +
          '<div class="opts kp-o">' + q.o.map(function (o, k) {
            return '<div class="opt' + (k === q.a ? ' ok' : '') + '"><em>' + "ABCDE"[k] + '</em><span>' + optHTML(o) + '</span>' + (k === q.a ? '<b class="mk ok" aria-label="Correct answer">✓</b>' : '') + '</div>';
          }).join("") + '</div>' +
          '<div class="why ok"><span class="t">Answer ' + "ABCDE"[q.a] + '</span><p>' + (q.e ? h(q.e).replace(/\n/g, "<br>") : optHTML(q.o[q.a])) + '</p></div></article>';
      }).join("") + '</section>';
    }).join("") + foot();
};

/* The 2026 rule, enforced: one section on screen, its own fifteen-minute clock,
   and once it is submitted or runs out there is no way back into it. */
V["mockrun"] = function (pid) {
  if (!paperOpen(pid)) { location.hash = "#/mock/" + encodeURIComponent(pid); return ""; }
  var p = paper(pid); if (!p) return blank();
  var a = ST.att[pid];
  if (!a || a.done || a.mode !== "mock") {
    a = ST.att[pid] = { mode: "mock", ans: {}, sec: 0, secEnd: 0, done: false, ts: Date.now() };
    save();
  }
  /* Settle the clock before drawing anything. Time keeps running while the
     page is closed, as it would in the hall: every section whose fifteen
     minutes have passed is closed now, and the next one inherits the clock
     from where the last one ended. Advancing from inside the render instead
     would let the outer route() paint the stale section back over the new one.
     A mock left for over two hours is treated as abandoned, not as sat. */
  if (a.secEnd && Date.now() - a.secEnd > 2 * 36e5) a.secEnd = 0;
  while (a.secEnd && a.secEnd <= Date.now() && a.sec < SECS.length) {
    var ended = a.secEnd;
    a.sec++; a.i = 0;
    a.secEnd = a.sec < SECS.length ? ended + SECMIN * 60000 : 0;
  }
  if (a.sec >= SECS.length) {
    a.sec = SECS.length - 1; a.done = true; a.ts = Date.now();
    p.qs.forEach(function (q) { logAnswer(q, a.ans[q.id]); });
    save(); setTimeout(function () { location.hash = "#/mock/" + encodeURIComponent(pid) + "/result"; }, 0);
    return '<div class="blank"><b>Time is up</b><p>Scoring your paper.</p></div>';
  }
  var sec = SECS[a.sec];
  var qs = p.qs.filter(function (q) { return q.s === sec.k; });
  if (!a.secEnd) { a.secEnd = Date.now() + SECMIN * 60000; }
  save();

  function finishSection() {
    if (a.sec >= SECS.length - 1) {
      a.done = true; a.ts = Date.now();
      p.qs.forEach(function (q) { logAnswer(q, a.ans[q.id]); });
      save(); location.hash = "#/mock/" + encodeURIComponent(pid) + "/result"; return;
    }
    a.sec++; a.secEnd = 0; a.i = 0; save();
    // never re-render from inside a render: let this call stack unwind first
    setTimeout(route, 0);
  }
  a.mk = a.mk || {}; a.vis = a.vis || {}; a.tq = a.tq || {};
  setAside("");
  return examHall({
    qs: qs, title: p.label, sub: "SSC CGL 2026 · Tier 1 · Section " + (a.sec + 1) + " of " + SECS.length,
    secName: sec.name, plus: PLUS, minus: MINUS, exit: "#/mock/" + encodeURIComponent(pid),
    secs: SECS.map(function (x, k) { return { short: x.short, st: k < a.sec ? "gone" : k === a.sec ? "on" : "next" }; }),
    finLabel: a.sec < SECS.length - 1 ? "Submit " + sec.short : "Submit paper",
    lockNote: a.sec < SECS.length - 1 ? "Once submitted you cannot come back to " + sec.short + ". The next section starts its own 15 minutes." : "This ends the paper and scores it.",
    get: function (k) { var v = a.ans[qs[k].id]; return v == null ? null : v; },
    set: function (k, v) { if (v == null) delete a.ans[qs[k].id]; else a.ans[qs[k].id] = v; save(); },
    getMark: function (k) { return !!a.mk[qs[k].id]; }, setMark: function (k, b) { if (b) a.mk[qs[k].id] = 1; else delete a.mk[qs[k].id]; save(); },
    visited: function (k) { return !!a.vis[qs[k].id]; }, markVisited: function (k) { if (!a.vis[qs[k].id]) { a.vis[qs[k].id] = 1; save(); } },
    timeOn: function (k) { return a.tq[qs[k].id] || 0; }, addTime: function (k, ms) { a.tq[qs[k].id] = (a.tq[qs[k].id] || 0) + ms; },
    startAt: function () { return a.i || 0; }, onMove: function (k) { a.i = k; save(); },
    deadline: function () { return a.secEnd; },
    submit: function () { finishSection(); }
  });
};

V["mockresult"] = function (pid) {
  var p = paper(pid), s = paperScore(pid); if (!p || !s) return blank();
  var hist = mockHistory();
  return '<section class="head">' +
    '<a class="kicker" href="#/mocks">&#8592; All mocks</a>' +
    '<h1 class="page-h reveal">' + s.marks.toFixed(1) + ' of 200</h1>' +
    '<p class="lede reveal">' + s.right + ' right, ' + s.wrong + ' wrong, ' + (s.total - s.done) + ' left blank. ' +
      (CUTOFF ? (s.marks >= CUTOFF.ur ? 'Above' : 'Below') + ' last year\'s UR Tier 1 cut-off of ' + CUTOFF.ur + ' (' + h(CUTOFF.label) + ').' : '') + '</p></section>' +
    '<div class="stats reveal">' + SECS.map(function (x) {
      var b = s.bySec[x.k];
      return '<div class="stat"><div class="k">' + x.short + '</div><div class="v">' + b.marks.toFixed(1) + '<small> / 50</small></div>' +
        '<div class="s">' + b.right + ' right · ' + b.wrong + ' wrong · ' + (b.total - b.done) + ' blank</div></div>';
    }).join("") + '</div>' +
    '<div class="reveal" style="display:flex;gap:10px;margin-top:28px;flex-wrap:wrap">' +
      '<a class="btn key" href="#/mock/' + encodeURIComponent(pid) + '/review">Review every answer' + arr() + '</a>' +
      '<a class="btn quiet" href="#/errors">Error log' + arr() + '</a>' +
      '<a class="btn quiet" href="#/progress">Score trend' + arr() + '</a></div>' +
    '<p class="muted reveal" style="margin-top:22px">Mock ' + hist.length + '. Every wrong answer from this paper is now in your error log.</p>' + foot();
};

V["mockreview"] = function (pid, practice) {
  if (!paperOpen(pid)) { location.hash = "#/mock/" + encodeURIComponent(pid); return ""; }
  var p = paper(pid); if (!p) return blank();
  if (practice) {
    var host = quiz({
      qs: p.qs, back: "#/mock/" + encodeURIComponent(pid), backLabel: p.label,
      get: function (k) { var v = ST.prac[p.qs[k].id]; return v == null ? null : v; },
      set: function (k, v) { ST.prac[p.qs[k].id] = v; logAnswer(p.qs[k], v); save(); },
      done: function () { location.hash = "#/mock/" + encodeURIComponent(pid); }
    });
    setAside(host.__pads());
    return host;
  }
  var a = att(pid) || { ans: {} };
  var host2 = quiz({
    qs: p.qs, back: "#/mock/" + encodeURIComponent(pid) + "/result", backLabel: "Result",
    get: function (k) { var v = a.ans[p.qs[k].id]; return v == null ? null : v; },
    set: function () {}, locked: true,
    done: function () { location.hash = "#/mock/" + encodeURIComponent(pid) + "/result"; }
  });
  setAside(host2.__pads());
  return host2;
};

/* ── topic practice ── */
V["practice"] = function (sk, topic) {
  if (sk === "repeats") return repRun();
  if (sk && topic) {
    var t = decodeURIComponent(topic);
    if (!topicOpen(sk, t)) return '<section class="head"><a class="kicker" href="#/practice">&#8592; All topics</a><h1 class="page-h reveal">' + h(t) + '</h1></section>' +
      upsell(tCount(sk, t).toLocaleString("en-IN") + " past questions on " + t, "The Exam Pass opens every topic's past questions, newest first.") + foot();
    // newest first: the 2025 papers are the nearest thing to yours
    var qs = allQs().filter(function (q) { return q.s === sk && (q.t || "Other") === t && !isGuess(q); })
      .map(function (q, i) { return [q, i]; })
      .sort(function (a, b) { return ((paperOf(b[0]) || {}).year || 0) - ((paperOf(a[0]) || {}).year || 0) || a[1] - b[1]; })
      .map(function (x) { return x[0]; });
    if (!qs.length) return blank();
    var host = quiz({
      qs: qs, back: "#/practice", backLabel: secOf(sk).short + " topics",
      head: '<a class="notes-link" href="' + learnHref(sk, t) + '">' + (learned(sk, t) ? "Notes for " : "Learn ") + h(t) + ' first' + arr() + '</a>',
      get: function (k) { var v = ST.prac[qs[k].id]; return v == null ? null : v; },
      set: function (k, v) { ST.prac[qs[k].id] = v; logAnswer(qs[k], v); save(); },
      startAt: function () { for (var k = 0; k < qs.length; k++) if (ST.prac[qs[k].id] == null) return k; return 0; },
      done: function () { location.hash = "#/practice"; }
    });
    setAside(host.__pads());
    return host;
  }
  var stats = {}; topicStats().forEach(function (x) { stats[tkey(x.s, x.t)] = x; });
  return '<section class="head">' +
      '<span class="kicker reveal">Every past question, sorted by topic</span>' +
      '<h1 class="page-h reveal">Practice.</h1>' +
      '<p class="lede reveal">Untimed, with the answer shown as soon as you pick. Accuracy per topic is what reorders your plan and your "Do this next".</p>' +
    '</section>' +
    (D.syllabus.sections || []).map(function (x) {
      var W = (D.syllabus.weight || {})[x.k] || {};
      var ts = x.topics.map(function (t) { return { t: t.n, n: tCount(x.k, t.n), st: stats[tkey(x.k, t.n)] || { done: 0 } }; }).filter(function (o) { return o.n; }).sort(function (a, b) { return b.n - a.n; });
      return '<section class="band"><h2 class="sec-h reveal">' + x.name + '</h2><div class="list" style="margin-top:18px">' +
        ts.map(function (o) {
          var open = topicOpen(x.k, o.t);
          return '<a class="item reveal' + (open ? '' : ' locked') + '" href="#/practice/' + x.k + '/' + encodeURIComponent(o.t) + '">' +
            '<span class="num">' + o.n + '</span>' +
            '<span><span class="t">' + h(o.t) + '</span><span class="d">' +
              (W[o.t] ? h(perPaper(W[o.t])) + ' · ' : '') + (open ? (o.st.done || 0) + ' of ' + o.n + ' attempted' : 'Premium') + '</span></span>' +
            '<span class="end">' + (!open ? '<span class="tag lock">' + LOCK + '</span>' : o.st.acc != null ? '<b>' + o.st.acc + '%</b>' : '') + '</span></a>';
        }).join("") + '</div></section>';
    }).join("") + foot();
};

/* ── error log ── */
V["errors"] = function (run) {
  var list = errList();
  if (run) {
    if (!list.length) { location.hash = "#/errors"; return blank(); }
    var qs = list.map(function (x) { return x.q; });
    var local = {};
    var host = quiz({
      qs: qs, back: "#/errors", backLabel: "Error log",
      get: function (k) { var v = local[qs[k].id]; return v == null ? null : v; },
      set: function (k, v) { local[qs[k].id] = v; ST.prac[qs[k].id] = v; logAnswer(qs[k], v); save(); },
      done: function () { location.hash = "#/errors"; }
    });
    setAside(host.__pads());
    return host;
  }
  var bySec = {};
  list.forEach(function (x) { (bySec[x.q.s] = bySec[x.q.s] || []).push(x); });
  return '<section class="head">' +
      '<span class="kicker reveal">Clears after two right in a row</span>' +
      '<h1 class="page-h reveal">Error log.</h1>' +
      '<p class="lede reveal">' + (list.length ? list.length + ' question' + (list.length === 1 ? '' : 's') + ' you have got wrong and not yet got right twice.' : 'Empty. Every miss from a mock or practice lands here automatically.') + '</p>' +
      (list.length ? '<div class="reveal" style="margin-top:24px"><a class="btn key" href="#/errors/run">Work through all ' + list.length + arr() + '</a></div>' : '') +
    '</section>' +
    SECS.filter(function (x) { return bySec[x.k]; }).map(function (x) {
      return '<section class="band"><h2 class="sec-h reveal">' + x.short + ' · ' + bySec[x.k].length + '</h2><div class="list" style="margin-top:18px">' +
        bySec[x.k].slice(0, 40).map(function (e) {
          return '<div class="item reveal" style="grid-template-columns:38px minmax(0,1fr) auto"><span class="num">' + e.e.n + '×</span>' +
            '<span><span class="t">' + h((e.q.q || "Figure question").length > 140 ? e.q.q.slice(0, 140) + '…' : (e.q.q || "Figure question")) + '</span><span class="d">' + h(e.q.t || "") + ' · ' + h(e.q.src || "") + ' · answer ' + "ABCD"[e.q.a] + (typeof e.q.o[e.q.a] === "string" ? ': ' + h(e.q.o[e.q.a]) : '') + '</span></span>' +
            '<span class="end">' + (e.e.ok ? e.e.ok + ' of 2' : '') + '</span></div>';
        }).join("") + '</div></section>';
    }).join("") + foot();
};

/* ══════════ learn ══════════
   The order a topic is meant to be met in: read the notes, see the formulas
   and the traps, watch one lesson, then its past questions. Practice is the
   last step on the page, not the first thing a syllabus click lands on. */
function topicsOf(sk) {
  var sec = (D.syllabus.sections || []).filter(function (x) { return x.k === sk; })[0];
  return sec ? sec.topics : [];
}
function isGuess(q) { return /^guess-/.test(q.id); }
function topicQs(sk, t) { return allQs().filter(function (q) { return q.s === sk && (q.t || "Other") === t && !isGuess(q); }); }
function tkey(sk, t) { return sk + "|" + t; }
function learned(sk, t) { return !!ST.learn[tkey(sk, t)]; }
function nLearned() { return Object.keys(ST.learn).filter(function (k) { return ST.learn[k]; }).length; }
function nTopics() { return (D.syllabus.sections || []).reduce(function (a, x) { return a + x.topics.length; }, 0); }
/* weights read "3.9" or "under 1": phrase both as a rate per paper */
function perPaper(w) { return /^\d/.test(w) ? "About " + w + " a paper" : String(w).charAt(0).toUpperCase() + String(w).slice(1) + " a paper"; }
function learnHref(sk, t) { return "#/learn/" + sk + "/" + encodeURIComponent(t); }
function pracHref(sk, t) { return "#/practice/" + sk + "/" + encodeURIComponent(t); }

/* where a topic stands, in one word and a tone the list can colour */
function topicState(sk, t, st) {
  if (st && st.done >= 5) return { w: st.acc + "%", c: st.acc >= 75 ? "ok" : st.acc >= 50 ? "" : "no", d: st.done + " of " + st.n + " practised" };
  if (learned(sk, t)) return { w: "Learned", c: "key", d: "Notes read. Past questions next." };
  return { w: "", c: "", d: "" };
}

/* ── YouTube, played in the page ──
   A thumbnail until pressed: no Google request until the reader asks for
   one, and nothing autoplays on arrival. youtube-nocookie keeps the embed
   from setting tracking cookies before play. */
function ytParse(url) {
  var m, o = {};
  if ((m = /[?&]list=([\w-]+)/.exec(url))) o.list = m[1];
  if ((m = /[?&]v=([\w-]{11})/.exec(url)) || (m = /youtu\.be\/([\w-]{11})/.exec(url)) || (m = /embed\/([\w-]{11})/.exec(url))) o.id = m[1];
  return o;
}
/* ══════════ dropdown ══════════
   A native <select> popup is drawn by the OS and lands in odd places over
   sticky, blurred headers. This one opens right under its button, filters
   as you type, and works from the keyboard. */
function ddHTML(id, groups, value, o) {
  o = o || {};
  var cur = "";
  groups.forEach(function (g) { g.items.forEach(function (it) { if (it.v === value) cur = it.t; }); });
  return '<div class="dd' + (o.cls ? ' ' + o.cls : '') + '" data-dd="' + id + '">' +
    '<button class="dd-btn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="' + h(o.aria || "Choose") + '">' +
      '<span class="dd-v">' + h(cur || o.placeholder || "Choose") + '</span>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>' +
    '<div class="dd-pop" role="listbox" tabindex="-1">' +
      (o.search ? '<div class="dd-s"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg><input class="dd-q" type="text" placeholder="' + h(o.search) + '" autocomplete="off" aria-label="' + h(o.search) + '"></div>' : '') +
      '<div class="dd-list">' + groups.map(function (g) {
        return (g.label ? '<div class="dd-g">' + h(g.label) + '</div>' : '') + g.items.map(function (it) {
          return '<button type="button" role="option" class="dd-o' + (it.v === value ? ' on' : '') + '" data-v="' + h(it.v) + '" data-q="' + h((it.t + ' ' + (it.q || '')).toLowerCase()) + '" aria-selected="' + (it.v === value) + '">' +
            '<span class="dd-t">' + h(it.t) + '</span>' + (it.sub ? '<span class="dd-sub">' + h(it.sub) + '</span>' : '') +
            '<svg class="dd-ck" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg></button>';
        }).join("");
      }).join("") + '</div><p class="dd-none" hidden>Nothing matches.</p></div></div>';
}
function wireDD(root, onPick) {
  if (!root || root.__dd) return; root.__dd = true;
  var btn = el(".dd-btn", root), pop = el(".dd-pop", root), q = el(".dd-q", root);
  function opts() { return els(".dd-o", root).filter(function (o) { return !o.hidden; }); }
  function open() {
    els(".dd.open").forEach(function (d) { if (d !== root) close.call(d); });
    root.classList.add("show"); void pop.offsetWidth;          // in the layout only while shown
    // flip upward when there is no room below; slide left to stay on screen
    var r = btn.getBoundingClientRect();
    root.classList.toggle("up", innerHeight - r.bottom < 320 && r.top > innerHeight - r.bottom);
    // measure unscaled: the entrance transform shrinks getBoundingClientRect
    var base = root.getBoundingClientRect().left, over = base + pop.offsetWidth - (innerWidth - 12);
    pop.style.left = (over > 0 ? -Math.min(over, Math.max(0, base - 12)) : 0) + "px";
    root.classList.add("open"); btn.setAttribute("aria-expanded", "true");
    var on = el(".dd-o.on", root);
    if (q) { q.value = ""; filter(); setTimeout(function () { q.focus(); }, 0); } else if (on) on.focus(); else if (opts()[0]) opts()[0].focus();
    if (on) on.scrollIntoView({ block: "center" });
  }
  var hideT = null;
  function close() {
    root.classList.remove("open"); btn.setAttribute("aria-expanded", "false");
    clearTimeout(hideT); hideT = setTimeout(function () { if (!root.classList.contains("open")) root.classList.remove("show"); }, 240);
  }
  function filter() {
    var t = (q.value || "").trim().toLowerCase(), any = false;
    els(".dd-o", root).forEach(function (o) { var ok = !t || t.split(/\s+/).every(function (w) { return o.dataset.q.indexOf(w) >= 0; }); o.hidden = !ok; if (ok) any = true; });
    els(".dd-g", root).forEach(function (g) {
      var n = g.nextElementSibling, vis = false;
      while (n && !n.classList.contains("dd-g")) { if (!n.hidden) vis = true; n = n.nextElementSibling; }
      g.hidden = !vis;
    });
    el(".dd-none", root).hidden = any;
  }
  btn.addEventListener("click", function () { root.classList.contains("open") ? close() : open(); });
  if (q) q.addEventListener("input", filter);
  root.addEventListener("keydown", function (e) {
    var list = opts(), i = list.indexOf(document.activeElement);
    if (e.key === "Escape") { close(); btn.focus(); e.preventDefault(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (!root.classList.contains("open")) open(); else (list[i + 1] || list[0]).focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); (list[i - 1] || (q && i <= 0 ? q : list[list.length - 1])).focus(); }
    else if (e.key === "Enter" && document.activeElement === q && list[0]) { e.preventDefault(); list[0].click(); }
  });
  els(".dd-o", root).forEach(function (o) {
    o.addEventListener("click", function () {
      els(".dd-o", root).forEach(function (x) { x.classList.toggle("on", x === o); x.setAttribute("aria-selected", String(x === o)); });
      el(".dd-v", root).textContent = el(".dd-t", o).textContent;
      close(); btn.focus(); onPick(o.dataset.v);
    });
  });
  document.addEventListener("pointerdown", function (e) { if (root.classList.contains("open") && !root.contains(e.target)) close(); });
}

function vidHTML(v, big) {
  var y = v.id || v.list ? { id: v.id, list: v.list } : ytParse(v.url || "");
  if (!y.id && !y.list) return "";
  var meta = [v.who, v.lang, v.len].filter(Boolean).join(" · ");
  return '<figure class="vid' + (big ? " big" : "") + '">' +
    '<button class="vid-f" data-yt="' + h(y.id || "") + '" data-list="' + h(y.list || "") + '" aria-label="Play ' + h(v.title) + '">' +
      (y.id ? '<img src="https://i.ytimg.com/vi/' + h(y.id) + '/hqdefault.jpg" alt="" loading="lazy">'
            : '<span class="vid-pl"><b>Playlist</b><span>' + h(v.len || "Plays in order") + '</span></span>') +
      '<span class="vid-go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></span>' +
    '</button>' +
    '<figcaption><b>' + h(v.title) + '</b>' + (meta ? '<span>' + h(meta) + '</span>' : '') +
      (v.why ? '<span class="vid-why">' + h(v.why) + '</span>' : '') + '</figcaption></figure>';
}
function wireVideos(scope) {
  els(".vid-f", scope).forEach(function (b) {
    b.addEventListener("click", function () {
      var id = b.dataset.yt, list = b.dataset.list;
      var src = "https://www.youtube-nocookie.com/embed/" + (id ? id + "?" + (list ? "list=" + list + "&" : "") : "videoseries?list=" + list + "&") +
        "autoplay=1&rel=0&modestbranding=1&playsinline=1";
      var f = document.createElement("iframe");
      f.className = "vid-if";
      f.src = src;
      f.title = b.getAttribute("aria-label").replace(/^Play /, "");
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      f.allowFullscreen = true;
      f.referrerPolicy = "strict-origin-when-cross-origin";
      b.replaceWith(f);
    });
  });
}

function libFor(sk, t) {
  return (D.library || []).map(function (x, i) { return { x: x, i: i }; }).filter(function (o) {
    return (o.x.topics || []).indexOf(t) >= 0 && (o.x.sec === sk || o.x.sec === "All") && (!o.x.private || canPdf());
  });
}
function libRow(o) {
  var x = o.x;
  var here = x.file && canPdf();
  var href = here ? pdfHref(x.file) : x.url;
  return '<a class="item reveal" href="' + h(href) + '"' + (here ? '' : ' target="_blank" rel="noopener noreferrer"') + ' style="grid-template-columns:38px minmax(0,1fr) auto">' +
    '<span class="num pdf">PDF</span>' +
    '<span><span class="t">' + h(x.title) + '</span><span class="d">' + h(x.what || "") + '</span>' +
    '<span class="meta">' + (x.pages ? '<span>' + x.pages + ' pages</span>' : '') + (x.mb ? '<span>' + (+x.mb).toFixed(1) + ' MB</span>' : '') +
      (here ? '<span class="tag key">Reads here</span>' : '<span class="tag">Opens the source</span>') + '</span></span>' +
    '<span class="end">' + (here ? arr() : '&#8599;') + '</span></a>';
}

/* words people type for a topic that are not in its name */
var TALIAS = {
  "Trigonometry": "trig sin cos tan", "Height & Distance": "elevation depression trig", "Simple & Compound Interest": "si ci interest",
  "Time Speed & Distance": "tsd train boat speed", "Profit & Loss": "pl discount cp sp", "Data Interpretation": "di table chart graph",
  "Idioms & Phrases": "idiom phrase", "One Word Substitution": "ows one word", "Active & Passive Voice": "voice", "Direct & Indirect Speech": "narration speech",
  "Reading Comprehension": "rc passage", "Cloze Test": "passage blanks", "Spot the Error": "error detection grammar", "Sentence Improvement": "grammar",
  "Mathematical Operations": "signs symbols", "Coding-Decoding": "code", "Mirror & Water Image": "mirror water non verbal", "Paper Folding & Cutting": "punch non verbal",
  "Embedded Figures": "hidden non verbal", "Pattern & Figure Completion": "figure non verbal", "Figure Counting": "triangles non verbal", "Dice & Cube": "dice cube",
  "Computer & Technology": "computer it", "Art & Culture": "dance music festival", "Static GK": "static first largest", "Polity": "constitution article",
  "Economy": "budget bank rbi", "Biology": "science", "Chemistry": "science", "Physics": "science", "Number System": "hcf lcm divisibility remainder"
};
var learnSec = "", learnTodo = false, learn26 = false;
/* lines and solved questions from this year's exam in a topic's notes (counted at build time) */
function y26(sk, t) { var n = D.meta && D.meta.notes && D.meta.notes[sk + "|" + t]; return (n && n.y26) || 0; }
function lastTopic() { try { return JSON.parse(localStorage.getItem("cgl-last") || "null"); } catch (e) { return null; } }
function nextTopic() {
  // the heaviest topic not yet learned, weighing Quant and Reasoning a little higher since they need more time
  var best = null;
  (D.syllabus.sections || []).forEach(function (x) {
    x.topics.forEach(function (t) {
      if (learned(x.k, t.n)) return;
      var w = parseFloat(t.w) || 0.5;
      if (!best || w > best.w) best = { s: x.k, t: t.n, w: w };
    });
  });
  return best;
}
function continueCard() {
  var L = lastTopic(), N = nextTopic(), out = [];
  if (L && L.s && L.t && topicsOf(L.s).some(function (x) { return x.n === L.t; }))
    out.push('<a class="cont" href="' + learnHref(L.s, L.t) + '"><span class="k">Continue reading</span><b>' + h(L.t) + '</b><span>' + h(secOf(L.s).short) + (learned(L.s, L.t) ? ' · learned' : '') + '</span></a>');
  if (N && !(L && L.t === N.t && L.s === N.s))
    out.push('<a class="cont next" href="' + learnHref(N.s, N.t) + '"><span class="k">Next heaviest to learn</span><b>' + h(N.t) + '</b><span>' + h(secOf(N.s).short) + ' · ' + h(perPaper(String(N.w))) + '</span></a>');
  return out.length ? '<div class="conts reveal">' + out.join("") + '</div>' : '';
}
function applyFinder() {
  var q = ((el("#tq") || {}).value || "").trim().toLowerCase(), any = false;
  els(".band[id^='sec-']").forEach(function (b) {
    var vis = 0;
    els("[data-tn]", b).forEach(function (it) {
      var ok = (!learnSec || it.dataset.ts === learnSec) && (!learnTodo || !it.dataset.tl) && (!learn26 || +it.dataset.y26 > 0) &&
        (!q || q.split(/\s+/).every(function (w) { return it.dataset.tn.indexOf(w) >= 0; }));
      it.hidden = !ok; if (ok) vis++;
    });
    b.hidden = !vis; if (vis) any = true;
  });
  var e = el("#fempty"); if (e) e.hidden = any;
}
/* section identity: one colour per paper section, used for tiles, bars and heroes */
var SEC_TONE = { R: "r", G: "g", Q: "q", E: "e" };
function miniRing(p, size, cls) {
  var r = 42, c = (2 * Math.PI * r).toFixed(1);
  return '<svg class="mring ' + (cls || '') + '" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="' + r + '" class="mr-t"/><circle cx="50" cy="50" r="' + r + '" class="mr-a" style="stroke-dasharray:' + c + ';stroke-dashoffset:' + (c * (1 - Math.max(0, Math.min(1, p)))).toFixed(1) + '"/></svg>';
}
V["learn"] = function (sk, topic) {
  if (sk && topic) return topicPage(sk, decodeURIComponent(topic));
  var S = D.syllabus, stats = {};
  topicStats().forEach(function (x) { stats[tkey(x.s, x.t)] = x; });
  var nl = nLearned(), nt = nTopics();
  var maxW = 0;
  S.sections.forEach(function (x) { x.topics.forEach(function (t) { maxW = Math.max(maxW, parseFloat(t.w) || 0); }); });
  return '<section class="lhero reveal">' +
      '<div class="lh-t"><span class="kicker">' + nl + ' of ' + nt + ' topics learned</span>' +
        '<h1 class="page-h">Learn.</h1>' +
        '<p class="lede">Every topic in the syllabus, heaviest first. Open one to read its notes, formulas and traps, watch a lesson on the page, then do its past questions.</p></div>' +
      '<div class="lh-ring">' + miniRing(nt ? nl / nt : 0, 168, "big") + '<div class="lh-n"><b>' + pc(nl, nt) + '%</b><span>learned</span></div></div>' +
    '</section>' + t2Band("learn") +
    '<div class="stiles">' + S.sections.map(function (x) {
      var done = x.topics.filter(function (t) { return learned(x.k, t.n); }).length;
      var nq = x.topics.reduce(function (a, t) { return a + tCount(x.k, t.n); }, 0);
      return '<button class="stile t-' + SEC_TONE[x.k] + (learnSec === x.k ? ' on' : '') + ' reveal" data-fsec="' + x.k + '">' +
        '<span class="st-k">' + h(secOf(x.k).short) + '</span>' +
        '<b>' + done + '<small> / ' + x.topics.length + '</small></b>' +
        '<span class="st-d">topics learned · ' + nq.toLocaleString("en-IN") + ' past questions</span>' +
        '<span class="st-bar"><i style="--p:' + (x.topics.length ? done / x.topics.length : 0) + '"></i></span></button>';
    }).join("") + '</div>' +
    continueCard() +
    '<div class="finder reveal" id="finder">' +
      '<label class="fsearch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>' +
        '<input id="tq" type="search" placeholder="Find a topic: trig, idioms, polity…" autocomplete="off" aria-label="Find a topic"></label>' +
      '<div class="chips" role="tablist">' + [["", "All"]].concat(SECS.map(function (x) { return [x.k, x.short]; })).map(function (c) {
        return '<button class="chip' + (c[0] === learnSec ? ' on' : '') + '" data-fsec="' + c[0] + '">' + c[1] + '</button>';
      }).join("") + '<button class="chip' + (learnTodo ? ' on' : '') + '" data-ftodo="1">Not learned</button>' +
        '<button class="chip c26' + (learn26 ? ' on' : '') + '" data-f26="1">Asked in 2026</button></div>' +
    '</div>' +
    '<p class="muted fempty" id="fempty" hidden>No topic matches. Try a shorter word.</p>' +
    S.sections.map(function (x) {
      var done = x.topics.filter(function (t) { return learned(x.k, t.n); }).length;
      return '<section class="band lsec t-' + SEC_TONE[x.k] + '" id="sec-' + x.k + '"><div class="band-h"><h2 class="sec-h reveal"><i class="sdot"></i>' + h(x.name) + '</h2>' +
        '<span class="muted reveal">' + done + ' of ' + x.topics.length + ' learned</span></div>' +
        (x.official ? '<details class="offic reveal"><summary>Official syllabus wording</summary><p>' + h(x.official) + '</p></details>' : '') +
        '<div class="tgrid">' + x.topics.map(function (t) {
          var sx = stats[tkey(x.k, t.n)] || {}, st = topicState(x.k, t.n, sx), n = tCount(x.k, t.n), w = parseFloat(t.w) || 0, wb = w || (t.w ? 0.5 : 0), open = topicOpen(x.k, t.n);
          return '<a class="tcard reveal' + (learned(x.k, t.n) ? " done" : "") + (open ? "" : " locked") + '" href="' + learnHref(x.k, t.n) + '" data-y26="' + y26(x.k, t.n) + '" data-tn="' + h((t.n + " " + x.name + " " + (TALIAS[t.n] || "")).toLowerCase()) + '" data-ts="' + x.k + '"' + (learned(x.k, t.n) ? ' data-tl="1"' : '') + '>' +
            '<span class="tc-top"><span class="tc-w">' + (w ? '<b>' + w.toFixed(1) + '</b> a paper' : t.w ? '<b>&lt;1</b> a paper' : 'Rarely asked') + '</span>' +
              (!open ? '<span class="tag lock">' + LOCK + 'Premium</span>' : st.w ? '<span class="tag ' + st.c + '">' + h(st.w) + '</span>' : !isPremium() ? '<span class="tag key">Free</span>' : '') + '</span>' +
            '<span class="tc-t">' + h(t.n) + (y26(x.k, t.n) ? ' <span class="pyq y26" title="Lines and solved questions from SSC CGL 2026 in these notes">2026 · ' + y26(x.k, t.n) + '</span>' : '') + '</span>' +
            '<span class="tc-bar"><i style="--p:' + (maxW ? Math.max(0.04, wb / maxW) : 0) + '"></i></span>' +
            '<span class="tc-d">' + n.toLocaleString("en-IN") + ' past question' + (n === 1 ? '' : 's') + (sx.done ? ' · ' + sx.done + ' done' : '') + '</span></a>';
        }).join("") + '</div></section>';
    }).join("") + foot();
};

function yearSplit(qs) {
  var by = {};
  qs.forEach(function (q) { var p = paperOf(q); var y = p ? p.year : "?"; by[y] = (by[y] || 0) + 1; });
  return Object.keys(by).sort().reverse().map(function (y) { return by[y] + " from " + y; }).join(", ");
}
var PIDX = null;
function paperOf(q) {
  if (!PIDX) { PIDX = {}; D.papers.forEach(function (p) { p.qs.forEach(function (x) { PIDX[x.id] = p; }); }); }
  return PIDX[q.id];
}
function topicPage(sk, t) {
  var sec = secOf(sk), list = topicsOf(sk);
  var idx = list.map(function (x) { return x.n; }).indexOf(t);
  if (idx < 0) return blank();
  var meta = list[idx];
  if (!topicOpen(sk, t)) {
    var nm = (D.meta && D.meta.notes && D.meta.notes[tkey(sk, t)]) || {};
    return '<section class="thero reveal" style="margin-top:28px"><div class="th-t"><a class="kicker" href="#/learn">&#8592; ' + h(sec.short) + ' · topic ' + (idx + 1) + ' of ' + list.length + '</a>' +
      '<h1 class="page-h">' + h(t) + '</h1><p class="lede">' + (meta.w ? h(perPaper(meta.w)) + '. ' : '') + tCount(sk, t).toLocaleString("en-IN") + ' past questions, ' + (nm.blocks || 0) + ' blocks of notes, formulas, traps and worked examples, and a lesson.</p></div></section>' +
      upsell(t + " is in the Exam Pass", "Your free plan opens " + FREE().topics.length + " topics. The Exam Pass opens all 63, with every past question on each.") + foot();
  }
  if (!needNotes()) return '<div class="boot" style="padding-top:60px"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
  var N = D.notes[tkey(sk, t)] || null;
  try { localStorage.setItem("cgl-last", JSON.stringify({ s: sk, t: t })); } catch (e) {}
  var qs = topicQs(sk, t);
  var n25 = qs.filter(function (q) { return /^2025/.test(q.id); }).length;
  var st = topicStats().filter(function (x) { return x.s === sk && x.t === t; })[0] || { done: 0, n: qs.length };
  var vids = [], tv = (D.topicvideos || {})[tkey(sk, t)];
  if (tv && (tv.id || tv.list)) vids.push(tv);
  if (tv && tv.alt && (tv.alt.id || tv.alt.list)) vids.push(tv.alt);
  var pdfs = libFor(sk, t);
  var prev = list[idx - 1], next = list[idx + 1];
  var steps = [];
  function step(id, title, body) { steps.push([id, title]); return '<section class="band tstep" id="' + id + '"><h2 class="sec-h reveal"><span class="sn">' + steps.length + '</span>' + title + '</h2>' + body + '</section>'; }
  function ul(a) { return '<ul class="pts">' + a.map(function (x) { return '<li>' + h(x) + '</li>'; }).join("") + '</ul>'; }

  var body = "";
  if (N) {
    body += step("notes", "Learn", N.chapters ? notesV4(N) : '<div class="notes">' + N.learn.map(function (b) {
      return '<div class="note reveal"><h3>' + h(b.h) + '</h3>' + ul(b.points) + '</div>';
    }).join("") + '</div>');
    if (N.formulas.length || N.facts.length)
      body += step("formulas", N.formulas.length ? "Formulas and rules" : "Key facts",
        (N.formulas.length ? '<div class="fxg">' + N.formulas.map(function (f) {
          return '<div class="fxc reveal"><code>' + h(f.f) + '</code>' + (f.note ? '<span>' + h(f.note) + '</span>' : '') + '</div>';
        }).join("") + '</div>' : '') +
        (N.facts.length ? factsHTML(N.facts) : ''));
    body += step("method", "Method and traps",
      '<div class="two">' +
        (N.method.length ? '<div class="note reveal"><h3>How to solve</h3><ol class="pts">' + N.method.map(function (x) { return '<li>' + h(x) + '</li>'; }).join("") + '</ol></div>' : '') +
        (N.traps.length ? '<div class="note trap reveal"><h3>Where marks are lost</h3>' + ul(N.traps) + '</div>' : '') +
      '</div>');
    if (N.examples.length)
      body += step("examples", "Worked examples",
        '<p class="muted reveal" style="margin-top:10px">Try each one first. The answer stays hidden until you ask.</p>' +
        '<div class="exs">' + N.examples.map(function (e, k) {
          return '<details class="ex reveal"><summary><span class="exn">' + (k + 1) + '</span><span class="exq">' + h(e.q) + '</span></summary>' +
            '<div class="exa"><b>' + h(e.a) + '</b><p>' + h(e.how) + '</p></div></details>';
        }).join("") + '</div>');
  } else {
    body += step("notes", "Learn", '<p class="muted reveal" style="margin-top:12px">Notes for this topic are still being written. The lesson and past questions below are ready.</p>');
  }
  if (N && N.more && N.more.learn && N.more.learn.length)
    body += step("more", "More notes", '<p class="muted reveal" style="margin-top:10px">From ' + h((N.more.src || []).join(", ")) + ', rewritten short.</p>' +
      '<div class="notes">' + N.more.learn.map(function (b) {
        return '<div class="note reveal"><h3>' + h(b.h) + '</h3>' + ul(b.points) + '</div>';
      }).join("") + '</div>');
  if (vids.length)
    body += step("watch", "Watch", '<div class="vids">' + vids.map(function (v, k) { return vidHTML(v, k === 0); }).join("") + '</div>');
  var chap = (N && N.pages || []).map(function (c) {
    var i = (D.library || []).map(function (x) { return x.file; }).indexOf(c.file);
    if (i < 0 || !canPdf()) return "";
    return '<a class="item reveal" href="' + pdfHref(c.file, c.page) + '" style="grid-template-columns:38px minmax(0,1fr) auto">' +
      '<span class="num pdf">PDF</span><span><span class="t">' + h(c.label) + '</span><span class="d">' + h(D.library[i].title) + ', opens at page ' + c.page + '</span></span><span class="end">' + arr() + '</span></a>';
  }).join("");
  if (pdfs.length || chap)
    body += step("read", "Read more", '<div class="list" style="margin-top:18px">' + chap + pdfs.map(libRow).join("") + '</div>');
  body += step("practise", "Practise", '<div class="cta reveal">' +
      '<div><b>' + qs.length + ' past question' + (qs.length === 1 ? '' : 's') + '</b>' +
        '<span>' + yearSplit(qs) + '. ' +
        (st.done ? st.done + ' done, ' + st.acc + '% right.' : 'None attempted yet.') + '</span></div>' +
      '<div class="cta-b">' + (qs.length ? '<a class="btn key" href="' + pracHref(sk, t) + '">' + (st.done ? 'Continue practice' : 'Start practice') + arr() + '</a>' : '') +
      '<label class="lchk"><input type="checkbox" data-learn="' + h(tkey(sk, t)) + '"' + (learned(sk, t) ? ' checked' : '') + '><span>I have learned this topic</span></label></div></div>' +
    (N && N.revise.length ? '<div class="note reveal" style="margin-top:16px"><h3>Before the exam, read only this</h3>' + ul(N.revise) + '</div>' : ''));


  var tbar = '<div class="tbar" id="tbar">' +
      '<a class="tb-back" href="#/learn" aria-label="All topics">&#8592;</a>' +
      ddHTML("tsel", (D.syllabus.sections || []).map(function (x) {
        return { label: x.name, items: x.topics.map(function (y) {
          return { v: x.k + "|" + y.n, t: y.n, q: x.name + " " + (TALIAS[y.n] || ""), sub: learned(x.k, y.n) ? "Learned" : (y.w ? perPaper(y.w) : "") };
        }) };
      }), sk + "|" + t, { search: "Find a topic", aria: "Jump to topic", cls: "tb-dd" }) +
      '<div class="tb-r"><button class="tb-b" data-rs="-1" aria-label="Smaller text">A−</button><button class="tb-b" data-rs="1" aria-label="Larger text">A+</button>' +
      '<button class="tb-b tb-aa" data-rs="cycle" aria-label="Text size">Aa</button>' +
      '<button class="tb-b" id="focus" aria-pressed="' + (document.body.classList.contains("focus") ? "true" : "false") + '">Focus</button></div>' +
      '<i class="tb-prog" id="tprog"></i></div>';
  var acc = st.done ? st.acc : null;
  return tbar + '<article class="study t-' + SEC_TONE[sk] + '">' + '<section class="thero reveal">' +
      '<div class="th-t"><a class="kicker" href="#/learn">&#8592; ' + h(sec.short) + ' · topic ' + (idx + 1) + ' of ' + list.length + '</a>' +
        '<h1 class="page-h">' + h(t) + '</h1>' +
        '<p class="lede">' + h(N ? N.why : (meta.tip || "")) + '</p>' +
        '<div class="pills">' +
          (vids.length ? '<span class="tag">Lesson inside</span>' : '') +
          (N && N.more && (N.more.learn || []).length ? '<span class="tag">Extra notes</span>' : '') +
          (learned(sk, t) ? '<span class="tag key">Learned</span>' : '') +
        '</div></div>' +
      '<div class="th-stats">' +
        '<div class="th-s"><b>' + (meta.w ? h(/^\d/.test(meta.w) ? meta.w : '<1') : '·') + '</b><span>questions a paper</span></div>' +
        '<div class="th-s"><b>' + qs.length.toLocaleString("en-IN") + '</b><span>past questions</span></div>' +
        '<div class="th-s ring">' + miniRing(acc == null ? 0 : acc / 100, 62) + '<div><b>' + (acc == null ? '—' : acc + '%') + '</b><span>' + (acc == null ? 'not practised' : 'your accuracy') + '</span></div></div>' +
      '</div>' +
      '<nav class="steps" aria-label="On this page">' + steps.map(function (x, k) {
        return '<a href="#' + x[0] + '" data-jump="' + x[0] + '"><span class="sn">' + (k + 1) + '</span>' + x[1] + '</a>';
      }).join("") + '</nav>' +
    '</section>' + body +
    '<nav class="tnav reveal">' +
      (prev ? '<a class="btn quiet" href="' + learnHref(sk, prev.n) + '">&#8592; ' + h(prev.n) + '</a>' : '<span></span>') +
      (next ? '<a class="btn quiet" href="' + learnHref(sk, next.n) + '">' + h(next.n) + arr() + '</a>' : '') +
    '</nav></article>' + foot();
}

/* ── videos ── */
V["videos"] = function () {
  return '<section class="head">' +
      '<span class="kicker reveal">Plays here · free on YouTube</span>' +
      '<h1 class="page-h reveal">Videos.</h1>' +
      '<p class="lede reveal">Press play and it runs on this page. Recorded lessons at 1.5×; live classes spend a third of their length waiting. Each topic page also has its own lesson.</p>' +
    '</section>' +
    D.videos.map(function (g) {
      return '<section class="band"><h2 class="sec-h reveal">' + h(g.g) + '</h2><div class="vids grid">' +
        g.items.map(function (v) { return vidHTML(v); }).join("") + '</div></section>';
    }).join("") + foot();
};

/* ── library: PDFs read in the page ── */
V["library"] = function (i, pg) {
  var L = D.library || [];
  if (i != null && i !== "") {
    var x = L[+i]; if (!x || !x.file || !canPdf()) return blank();
    location.hash = pdfHref(x.file, pg); return "";
  }
  var bySec = {};
  L.forEach(function (x, k) { if (x.private && !canPdf()) return; (bySec[x.sec || "All"] = bySec[x.sec || "All"] || []).push({ x: x, i: k }); });
  var order = [{ k: "All", name: "Whole paper" }].concat(SECS.map(function (s) { return { k: s.k, name: s.name }; }));
  return '<section class="head">' +
      '<span class="kicker reveal">' + (canPdf() ? L.filter(function (x) { return x.file; }).length + ' PDFs you can read here' : L.filter(function (x) { return !x.private; }).length + ' free study PDFs, linked to their sources') + '</span>' +
      '<h1 class="page-h reveal">Library.</h1>' +
      '<p class="lede reveal">Free notes and question banks, downloaded from their publishers and kept here so they open instantly. The biggest ones link to their source.</p>' +
    '</section>' +
    (L.length ? order.filter(function (s) { return bySec[s.k]; }).map(function (s) {
      return '<section class="band"><h2 class="sec-h reveal">' + h(s.name) + '</h2><div class="list" style="margin-top:18px">' +
        bySec[s.k].map(libRow).join("") + '</div></section>';
    }).join("") : '<p class="muted">The library is being filled. Check back shortly.</p>') + foot();
};

/* ── current affairs 2026 ── */
/* ══════════ current affairs ══════════ */
var CA_ICON = {
  "Appointments": "👤", "Awards": "🏅", "Sports": "🏆", "Schemes & Policy": "📜", "Economy & Banking": "₹",
  "Science & Space": "🚀", "Defence": "🛡", "Reports & Indices": "📊", "Summits & International": "🌐",
  "Books & Authors": "📚", "Days & Themes": "📅", "States & Places": "📍", "Obituaries": "🕯", "Other": "•"
};
var CA_TONE = {
  "Appointments": "r", "Awards": "e", "Sports": "g", "Schemes & Policy": "q", "Economy & Banking": "g",
  "Science & Space": "q", "Defence": "r", "Reports & Indices": "e", "Summits & International": "r",
  "Books & Authors": "q", "Days & Themes": "e", "States & Places": "g", "Obituaries": "q", "Other": "r"
};
var caCat = "";                       // category filter, per visit
var gsegLast = null;                  // where the active pill was, so the next month springs from it
/* numbers, dates and years carry most of a current-affairs fact: set them bold */
function caFact(t) {
  // bold on the raw text, escape each piece: never touch the entities.
  // No lookbehind: older iOS Safari cannot parse it.
  var re = /(\b\d{1,2}(?:st|nd|rd|th)?\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s20\d\d)?|₹\s?[\d,.]+(?:\s(?:lakh\s)?crore)?|\d[\d,.]*(?:\s?(?:%|crore|lakh|km|kg|MW|GW|billion|million))?)/g;
  var out = "", last = 0, m;
  while ((m = re.exec(t))) {
    var s0 = m.index, e0 = s0 + m[0].length, pre = t.charAt(s0 - 1), post = t.charAt(e0);
    // a number glued to a word or code ("EOS-05", "Su-30MKI") is part of a name
    var glued = /^\d/.test(m[0]) && (/[A-Za-z\-–]/.test(pre) || /[A-Za-z\-]/.test(post));
    if (glued) continue;
    out += h(t.slice(last, s0)) + "<b>" + h(m[0]) + "</b>"; last = e0;
  }
  return out + h(t.slice(last));
}
function caTest(m) { var M = (D.ca.months || []).filter(function (x) { return x.m === m; })[0]; return M && M.test && M.test.length ? M.test : null; }
function caScore(m) {
  var r = ST.ca["test:" + m], T = caTest(m); if (!r || !T) return null;
  var right = 0, n = 0; T.forEach(function (q, i) { if (r[i] != null) { n++; if (r[i] === q.a) right++; } });
  return { right: right, n: n, total: T.length };
}
function gseg(items, activeIdx, cls) {
  return '<div class="gseg ' + (cls || '') + '" role="tablist"><i class="gs-hov" aria-hidden="true"></i><i class="gs-act" aria-hidden="true"></i>' +
    items.map(function (x, i) {
      return '<a role="tab" href="' + x.href + '" class="' + (i === activeIdx ? 'on' : '') + (x.done ? ' done' : '') + '" aria-selected="' + (i === activeIdx) + '">' + x.label + '</a>';
    }).join("") + '</div>';
}
function caSpan() {
  var M = (D.ca && D.ca.months && D.ca.months.length ? D.ca.months : (D.meta && D.meta.months) || []);
  var n = M.length || 21, a = M[0], b = M[M.length - 1];
  return { n: n, from: a ? a.label : "January 2025", to: b ? b.label : "September 2026",
    short: (a ? a.label.slice(0, 3) + " " + a.label.slice(-4) : "Jan 2025") + " to " + (b ? b.label.slice(0, 3) + " " + b.label.slice(-4) : "Sep 2026") };
}
function caNum(n) { return ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty","twenty-one","twenty-two","twenty-three","twenty-four"][n] || String(n); }
function caHead(byTopic) {
  var S = caSpan(), months = D.ca.months || [];
  var facts = ((D.meta && D.meta.months) || []).reduce(function (a, x) { return a + (x.n || 0); }, 0) || months.reduce(function (a, x) { return a + (x.items || []).length; }, 0);
  var read = months.filter(function (x) { return ST.ca[x.m]; }).length;
  var tests = months.filter(function (x) { var sc = caScore(x.m); return sc && sc.n; }).length;
  var R = 26, C = 2 * Math.PI * R, pct = months.length ? read / months.length : 0;
  return '<section class="cahead reveal"><div class="ca-mesh" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
    '<div class="ca-glass">' +
      '<div class="ca-ht"><span class="kicker">' + (byTopic === 1 || byTopic === true ? h(D.ca.topicSrc || "") : h(S.from) + ' to ' + h(S.to)) + '</span>' +
        '<h1 class="page-h">Current affairs.</h1>' +
        '<p class="lede">' + (byTopic === 1 || byTopic === true ? 'The same news, sorted the way General Awareness asks it.'
          : byTopic === 2 ? 'The facts SSC CGL 2026 has already asked about, from candidates\' recall of each shift. New shifts are added as they are held.'
          : caNum(S.n).charAt(0).toUpperCase() + caNum(S.n).slice(1) + ' months, the window your GA paper draws its current questions from. Read a month, lock it in with its cards, then take its 20-question test.') + '</p>' +
        ((D.ca.topics || []).length || caAskedN() ? gseg([{ href: "#/ca", label: "By month" }].concat((D.ca.topics || []).length ? [{ href: "#/ca/topic", label: "By topic" }] : [], caAskedN() ? [{ href: "#/ca/asked", label: "Asked in 2026" }] : []),
          byTopic === 2 ? ((D.ca.topics || []).length ? 2 : 1) : byTopic ? 1 : 0, "mode") : '') +
      '</div>' +
      '<div class="ca-stats">' +
        '<div class="cs-ring"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="' + R + '" class="cr-t"/><circle cx="32" cy="32" r="' + R + '" class="cr-a" style="stroke-dasharray:' + C.toFixed(1) + ';stroke-dashoffset:' + (C * (1 - pct)).toFixed(1) + '" data-off="' + (C * (1 - pct)).toFixed(1) + '" data-c="' + C.toFixed(1) + '"/></svg>' +
          '<div><b data-cacount="' + read + '">' + read + '</b><span>of ' + months.length + ' months read</span></div></div>' +
        '<div class="cs-n"><b data-cacount="' + S.n + '">' + S.n + '</b><span>months</span></div>' +
        '<div class="cs-n"><b data-cacount="' + facts + '">' + facts.toLocaleString("en-IN") + '</b><span>facts</span></div>' +
        '<div class="cs-n"><b data-cacount="' + tests + '">' + tests + '</b><span>tests taken</span></div>' +
      '</div>' +
    '</div></section>';
}
/* a fact's own date, for the timeline badge: "31 August 2026" -> "31 Aug" */
var CA_MON = { january: "Jan", february: "Feb", march: "Mar", april: "Apr", may: "May", june: "Jun", july: "Jul", august: "Aug", september: "Sep", october: "Oct", november: "Nov", december: "Dec" };
function caDate(t) {
  var m = /\b(\d{1,2})(?:st|nd|rd|th)?\s(January|February|March|April|May|June|July|August|September|October|November|December)\b/.exec(t);
  return m ? { d: m[1], m: CA_MON[m[2].toLowerCase()] } : null;
}
function caText(f) { return typeof f === "string" ? f : f.fact; }
var caMode = (function () { try { return localStorage.getItem("cgl-ca-mode") || "short"; } catch (e) { return "short"; } })();
function caMore(x) {
  if (!x) return "";
  return '<div class="cx">' +
    (x.w ? '<p class="cx-w">' + h(x.w) + '</p>' : '') +
    (x.k && x.k.length ? '<dl class="cx-k">' + x.k.map(function (p) { return '<div><dt>' + h(p[0]) + '</dt><dd>' + caFact(String(p[1])) + '</dd></div>'; }).join("") + '</dl>' : '') +
    (x.s ? '<div class="cx-s"><span>Linked static GK</span><p>' + caFact(x.s) + '</p></div>' : '') +
    (x.u ? '<a class="cx-u" href="' + h(x.u) + '" target="_blank" rel="noopener noreferrer">Read the full story<i aria-hidden="true">↗</i></a>' : '') +
  '</div>';
}
/* a fact asked in this year's exam carries the same chip as the notes */
function caAsked(f) { return f && typeof f === "object" && (f.pyq || []).indexOf("2026") >= 0 ? ' ' + chip26(f.q26) : ""; }
function caFactLi(f) {
  var t = caText(f), x = typeof f === "string" ? null : f.x, d = caDate(t);
  var dd = '<span class="cf-d' + (d ? '' : ' nd') + '">' + (d ? '<b>' + d.d + '</b>' + d.m : '') + '</span>';
  if (!x) return '<li>' + dd + '<span class="cf-t">' + caFact(t) + caAsked(f) + '</span></li>';
  return '<li class="has-x' + (caMode === "full" ? ' open' : '') + '">' + dd +
    '<div class="cf-b"><button class="cf-t" data-x aria-expanded="' + (caMode === "full") + '">' + caFact(t) + caAsked(f) + '<i class="cf-c" aria-hidden="true"></i></button>' + caMore(x) + '</div></li>';
}
function caCards(groups, allowFilter) {
  var cats = Object.keys(groups);
  if (caCat && !groups[caCat]) caCat = "";
  var total = cats.reduce(function (a, c) { return a + groups[c].length; }, 0);
  var anyX = cats.some(function (c) { return groups[c].some(function (f) { return typeof f !== "string" && f.x; }); });
  var chips = allowFilter ? '<div class="ca-tools"><div class="cachips" role="toolbar" aria-label="Categories"><button class="cchip' + (!caCat ? ' on' : '') + '" data-cacat="">All <small>' + total + '</small></button>' +
      cats.map(function (c) { return '<button class="cchip t-' + (CA_TONE[c] || "r") + (caCat === c ? ' on' : '') + '" data-cacat="' + h(c) + '"><i aria-hidden="true"></i>' + h(c) + ' <small>' + groups[c].length + '</small></button>'; }).join("") + '</div>' +
      (anyX ? '<div class="ca-mode" role="radiogroup" aria-label="Detail"><button role="radio" data-camode="short" aria-checked="' + (caMode !== "full") + '">Short</button><button role="radio" data-camode="full" aria-checked="' + (caMode === "full") + '">Detailed</button></div>' : '') +
    '</div>' : '';
  return chips + '<div class="cagrid' + (caCat ? ' one' : '') + '" id="cagrid">' + cats.map(function (c) {
    var tone = CA_TONE[c] || "r", L = groups[c], fold = L.length > 5 && !caCat;
    return '<article class="cacard t-' + tone + (fold ? ' fold' : '') + '" data-cat="' + h(c) + '"' + (caCat && caCat !== c ? ' hidden' : '') + '>' +
      '<div class="cc-h"><h3>' + h(c) + '</h3><small>' + L.length + '</small></div>' +
      '<ul class="cc-l">' + L.map(caFactLi).join("") + '</ul>' +
      (L.length > 5 ? '<button class="cc-more" data-more>Show all ' + L.length + '</button>' : '') + '</article>';
  }).join("") + '</div>';
}
/* one fact from each of the categories SSC asks most, as a place to start */
var CA_PICK = ["Appointments", "Awards", "Sports", "Schemes & Policy", "Defence", "Summits & International", "Reports & Indices", "Science & Space"];
function caPicks(cats) {
  var P = CA_PICK.filter(function (c) { return cats[c] && cats[c].length; }).slice(0, 6);
  if (P.length < 3) return "";
  return '<section class="capicks"' + (caCat ? ' hidden' : '') + '><div class="cp-h"><span class="kicker">Start here</span><h3>One from each big category</h3></div>' +
    '<div class="cp-row">' + P.map(function (c) {
      return '<div class="cp t-' + (CA_TONE[c] || "r") + '"><span class="cp-k"><i aria-hidden="true"></i>' + h(c) + '</span><p>' + caFact(caText(cats[c][0])) + '</p></div>'; }).join("") +
    '</div></section>';
}
/* facts from the months that SSC CGL 2026 has asked about (marked "pyq": ["2026"]) */
function caAskedN() { return ((D.meta && D.meta.months) || []).reduce(function (a, x) { return a + (x.y26 || 0); }, 0); }
function caAskedView() {
  var M = (D.ca.months || []).slice().reverse(), shown = 0, rows = "";
  M.forEach(function (x) {
    var L = (x.items || []).filter(function (it) { return (it.pyq || []).indexOf("2026") >= 0; });
    if (!L.length || !monthOpen(x.m)) return;
    shown += L.length;
    rows += '<article class="cacard t-' + (CA_TONE[L[0].cat] || "r") + '"><div class="cc-h"><h3><a href="#/ca/' + x.m + '">' + h(x.label) + '</a></h3><small>' + L.length + '</small></div>' +
      '<ul class="cc-l">' + L.map(caFactLi).join("") + '</ul></article>';
  });
  var locked = caAskedN() - shown;
  return caHead(2) + '<section class="band" style="margin-top:22px"><div class="band-h"><h2 class="sec-h reveal">Asked in SSC CGL 2026</h2><span class="muted reveal">' + caAskedN() + ' facts so far</span></div>' +
    (rows ? '<div class="cagrid">' + rows + '</div>' : '') +
    (locked > 0 ? upsell(locked + " more asked fact" + (locked === 1 ? "" : "s") + " in earlier months", "The Exam Pass opens every month of current affairs, with the 2026 questions marked.") : '') +
    (!caAskedN() ? '<p class="muted">None yet.</p>' : '') + '</section>' + foot();
}
V["ca"] = function (m, slug) {
  var C = D.ca;
  if (!C || !C.months || !C.months.length) return '<section class="head"><h1 class="page-h">Current affairs.</h1><p class="lede">Being compiled. Check back shortly.</p></section>' + foot();
  if (m === "test" && slug) {
    if (!monthOpen(slug)) return '<section class="head"><a class="kicker" href="#/ca">&#8592; Current affairs</a><h1 class="page-h reveal">Month test</h1></section>' + upsell("This test is in the Exam Pass", "The Exam Pass opens all " + caSpan().n + " months of current affairs and their 20-question tests.") + foot();
    return caTestView(slug);
  }
  if (m === "asked") return caAskedView();
  if (m === "topic" && !(C.topics || []).length) { location.hash = "#/ca"; return ""; }
  if (m === "topic") {
    var T = C.topics || [], ti = 0;
    T.forEach(function (t, i) { if (t.slug === slug) ti = i; });
    var cur = T[ti]; if (!cur) return blank();
    var g = {}; cur.sections.forEach(function (x) { g[x.h] = x.facts; });
    var nf = cur.sections.reduce(function (a, x) { return a + x.facts.length; }, 0);
    return caHead(true) +
      '<div class="ca-sel reveal">' + gseg(T.map(function (t) { return { href: "#/ca/topic/" + t.slug, label: h(t.cat.replace(/ &.*| 2026.*/, "")), done: ST.ca["t:" + t.slug] }; }), ti, "months") + '</div>' +
      '<section class="band" style="margin-top:22px"><div class="band-h"><h2 class="sec-h reveal">' + h(cur.cat) + '</h2>' +
        '<span class="muted reveal">' + nf + ' facts · ' + (cur.cards || []).length + ' cards</span></div>' +
        '<div class="ca-act reveal">' +
          ((cur.cards || []).length ? '<a class="btn key sm" href="#/cards/' + (910 + ti) + '">Cards for this topic' + arr() + '</a>' : '') +
          '<label class="lchk"><input type="checkbox" data-ca="t:' + h(cur.slug) + '"' + (ST.ca["t:" + cur.slug] ? ' checked' : '') + '><span>Read this topic</span></label></div>' +
        caCards(g, false) + '</section>' + foot();
  }
  var months = C.months, cur2 = months.filter(function (x) { return x.m === m; })[0] || months[months.length - 1];
  var ci = months.indexOf(cur2);
  var cats = {};
  cur2.items.forEach(function (it) { (cats[it.cat] = cats[it.cat] || []).push(it); });
  var strip = caStrip(months, ci);
  if (!monthOpen(cur2.m)) {
    var mm = ((D.meta && D.meta.months) || []).filter(function (x) { return x.m === cur2.m; })[0] || {};
    return caHead(false) + strip +
      '<section class="band ca-band"><h2 class="ca-mh reveal">' + h(cur2.label) + '</h2>' + upsell((mm.n || "All the") + " facts from " + cur2.label, "Your free plan opens the latest month. The Exam Pass opens all " + caSpan().n + " months and a 20-question test for each.") + '</section>' + foot();
  }
  if (caCat && !cats[caCat]) caCat = "";
  var sc = caScore(cur2.m), test = caTest(cur2.m), done = !!ST.ca[cur2.m];
  var pct = sc && sc.n ? Math.round(sc.right / sc.total * 100) : 0, R = 22, CC = 2 * Math.PI * R;
  return caHead(false) + strip +
    '<section class="band ca-band">' +
      '<div class="ca-mrow reveal">' +
        '<div><h2 class="ca-mh">' + h(cur2.label) + '</h2><span class="ca-meta">' + cur2.items.length + ' facts · ' + Object.keys(cats).length + ' categories' + (cur2.src ? ' · <a href="' + h(cur2.src) + '" target="_blank" rel="noopener noreferrer">source</a>' : '') + '</span></div>' +
        '<div class="ca-acts">' +
          '<button class="ca-done' + (done ? ' on' : '') + '" data-cadone="' + h(cur2.m) + '" aria-pressed="' + done + '"><i aria-hidden="true"></i>' + (done ? 'Read' : 'Mark as read') + '</button>' +
          ((C.cards || []).length ? '<a class="btn quiet sm" href="#/cards/900">Cards' + arr() + '</a>' : '') +
          (cur2.pdf && canPdf() ? '<a class="btn quiet sm" href="' + pdfHref(cur2.pdf) + '">PDF' + arr() + '</a>' : '') +
        '</div>' +
      '</div>' +
      (test ? '<a class="catest reveal" href="#/ca/test/' + cur2.m + '">' +
        '<span class="ct-ring"><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="' + R + '" class="cr-t"/><circle cx="26" cy="26" r="' + R + '" class="cr-a" style="stroke-dasharray:' + CC.toFixed(1) + ';stroke-dashoffset:' + (CC * (1 - pct / 100)).toFixed(1) + '"/></svg><b>' + (sc && sc.n ? pct + '%' : test.length) + '</b></span>' +
        '<span class="ct-t"><span class="ct-k">Month test</span><b>' + (sc && sc.n ? sc.right + ' of ' + sc.total + ' last time' : test.length + ' questions, about 8 minutes') + '</b><span class="ct-d">' + (sc && sc.n ? 'Retake it until every answer sticks.' : 'Answers and explanations as you go.') + '</span></span>' +
        '<span class="ct-go">' + (sc && sc.n ? 'Retake' : 'Start') + arr() + '</span></a>' : '') +
      '<div class="ca-find reveal"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>' +
        '<input id="casearch" type="search" placeholder="Search every month: RBI, Padma, ISRO, Olympic..." aria-label="Search current affairs" autocomplete="off"></div>' +
      '<div id="casr" hidden></div>' +
      '<div id="cabody">' + caPicks(cats) + caCards(cats, true) + '</div>' +
      (ci > 0 || ci < months.length - 1 ? '<nav class="ca-pn">' +
        (ci > 0 ? '<a href="#/ca/' + months[ci - 1].m + '"><small>Previous</small><b>' + h(months[ci - 1].label) + '</b></a>' : '<span></span>') +
        (ci < months.length - 1 ? '<a class="nx" href="#/ca/' + months[ci + 1].m + '"><small>Next</small><b>' + h(months[ci + 1].label) + '</b></a>' : '<span></span>') + '</nav>' : '') +
    '</section>' + foot();
};
/* the month picker: a sticky frosted bar, months grouped by year, with arrows */
function caStrip(months, ci) {
  var items = [], yr = "";
  months.forEach(function (x) {
    var y = x.label.slice(-4);
    if (y !== yr) { yr = y; items.push({ sep: y }); }
    items.push({ href: "#/ca/" + x.m, label: (monthOpen(x.m) ? '' : LOCK) + h(x.label.slice(0, 3)), done: ST.ca[x.m] });
  });
  var on = 0, k = -1;
  items.forEach(function (it, i) { if (!it.sep) { k++; if (k === ci) on = i; } });
  return '<div class="ca-sel" id="casel">' +
    '<a class="ca-arr" href="#/ca/' + months[Math.max(0, ci - 1)].m + '"' + (ci ? '' : ' aria-disabled="true"') + ' aria-label="Previous month"><svg viewBox="0 0 24 24"><path d="m14.5 6-6 6 6 6"/></svg></a>' +
    gsegY(items, on) +
    '<a class="ca-arr" href="#/ca/' + months[Math.min(months.length - 1, ci + 1)].m + '"' + (ci < months.length - 1 ? '' : ' aria-disabled="true"') + ' aria-label="Next month"><svg viewBox="0 0 24 24"><path d="m9.5 6 6 6-6 6"/></svg></a>' +
  '</div>';
}
function gsegY(items, on) {
  return '<div class="gseg months" role="tablist" aria-label="Months"><i class="gs-hov" aria-hidden="true"></i><i class="gs-act" aria-hidden="true"></i>' +
    items.map(function (it, i) {
      if (it.sep) return '<span class="gs-yr" aria-hidden="true">' + it.sep + '</span>';
      return '<a href="' + it.href + '"' + (i === on ? ' class="on' + (it.done ? ' done' : '') + '" aria-current="true"' : (it.done ? ' class="done"' : '')) + '>' + it.label + '</a>';
    }).join("") + '</div>';
}
/* current affairs: read toggle, folds, search across months, and the motion */
function wireCa() {
  var host = el(".cahead");
  if (!host) return;
  var M = window.Motion, still = BOT || reduceMotion();
  var onchip = el(".cachips .cchip.on");
  if (onchip && onchip.offsetLeft > innerWidth * 0.6) onchip.scrollIntoView({ inline: "center", block: "nearest" });
  var d = el("[data-cadone]");
  if (d) d.addEventListener("click", function () {
    var k = d.dataset.cadone, on = !ST.ca[k];
    if (on) ST.ca[k] = Date.now(); else delete ST.ca[k];
    save();
    d.classList.toggle("on", on); d.setAttribute("aria-pressed", String(on));
    d.lastChild.textContent = on ? "Read" : "Mark as read";
    var a = el(".gseg.months a.on"); if (a) a.classList.toggle("done", on);
    if (on && M && !still) M.animate(d, { transform: ["scale(.94)", "scale(1)"] }, { type: "spring", bounce: 0.35, duration: 0.45 });
    // the header ring and count follow
    var n = (D.ca.months || []).filter(function (x) { return ST.ca[x.m]; }).length, tot = (D.ca.months || []).length;
    var r = el(".cs-ring .cr-a"), b = el(".cs-ring b");
    if (r) r.style.strokeDashoffset = (+r.dataset.c * (1 - n / tot)).toFixed(1);
    if (b) b.textContent = n;
  });
  els("[data-more]").forEach(function (b) { b.addEventListener("click", function () {
    var card = b.closest(".cacard"); card.classList.remove("fold"); card.dataset.opened = "1"; b.hidden = true;
  }); });

  // a point opens into its drawer; Detailed opens every drawer at once
  var grid = el("#cagrid");
  if (grid) grid.addEventListener("click", function (e) {
    var t = e.target.closest("[data-x]"); if (!t || e.target.closest("a")) return;
    var li = t.closest("li"), on = !li.classList.contains("open");
    li.classList.toggle("open", on); t.setAttribute("aria-expanded", String(on));
    if (on && M && !still) M.animate(el(".cx", li), { opacity: [0, 1], transform: ["translateY(-4px)", "translateY(0)"] }, { duration: 0.28, ease: [0.23, 1, 0.32, 1] });
  });
  els("[data-camode]").forEach(function (b) { b.addEventListener("click", function () {
    caMode = b.dataset.camode;
    try { localStorage.setItem("cgl-ca-mode", caMode); } catch (e) {}
    els("[data-camode]").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
    els("#cagrid li.has-x").forEach(function (li) { li.classList.toggle("open", caMode === "full"); var t = el("[data-x]", li); if (t) t.setAttribute("aria-expanded", String(caMode === "full")); });
  }); });

  // search every open month; results replace the cards until the box is cleared
  var q = el("#casearch"), out = el("#casr"), body = el("#cabody"), t = null;
  if (q) q.addEventListener("input", function () {
    clearTimeout(t);
    t = setTimeout(function () {
      var v = q.value.trim().toLowerCase();
      if (v.length < 2) { out.hidden = true; out.innerHTML = ""; body.hidden = false; return; }
      var words = v.split(/\s+/), hits = [], shut = 0;
      (D.ca.months || []).slice().reverse().forEach(function (mo) {
        if (!monthOpen(mo.m)) { shut++; return; }
        mo.items.forEach(function (it) {
          var tx = it.fact.toLowerCase();
          if (words.every(function (w) { return tx.indexOf(w) >= 0; })) hits.push({ m: mo, it: it });
        });
      });
      body.hidden = true; out.hidden = false;
      out.innerHTML = '<div class="casr-h"><b>' + hits.length + '</b> ' + (hits.length === 1 ? 'fact' : 'facts') + ' for “' + h(q.value.trim()) + '”' +
        (shut ? '<span>' + shut + ' locked month' + (shut === 1 ? '' : 's') + ' not searched</span>' : '') + '</div>' +
        (hits.length ? '<ul class="casr-l">' + hits.slice(0, 80).map(function (x) {
          return '<li><a href="#/ca/' + x.m.m + '" class="casr-m">' + h(x.m.label.slice(0, 3) + " " + x.m.label.slice(-4)) + '</a><span class="casr-c t-' + (CA_TONE[x.it.cat] || "r") + '">' + h(x.it.cat) + '</span><p>' + caFact(x.it.fact) + caAsked(x.it) + '</p></li>'; }).join("") + '</ul>'
          : '<p class="casr-0">Nothing matches. Try one word, such as a name or a place.</p>');
    }, 120);
  });

  if (!M || still) return;
  // numbers count up, the ring fills, cards rise as they come into view
  els(".ca-stats [data-cacount]").forEach(function (b) {
    var to = +b.dataset.cacount; if (!to) return;
    M.animate(0, to, { duration: 1.1, ease: [0.23, 1, 0.32, 1], onUpdate: function (x) { b.textContent = Math.round(x).toLocaleString("en-IN"); } });
  });
  var ring = el(".cs-ring .cr-a");
  if (ring) M.animate(ring, { strokeDashoffset: [+ring.dataset.c, +ring.dataset.off] }, { duration: 1.2, ease: [0.23, 1, 0.32, 1] });
  var ctr = el(".catest .cr-a");
  if (ctr) { var to = ctr.style.strokeDashoffset, from = ctr.style.strokeDasharray; M.animate(ctr, { strokeDashoffset: [from, to] }, { duration: 1, delay: 0.2, ease: [0.23, 1, 0.32, 1] }); }
  if (el(".capicks")) M.animate(els(".capicks .cp"), { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0)"] }, { delay: M.stagger(0.05, { startDelay: 0.1 }), duration: 0.5, ease: [0.23, 1, 0.32, 1] });
  els(".cacard").slice(0, 6).forEach(function (c, i) {
    M.animate(c, { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0)"] }, { delay: 0.08 + i * 0.05, duration: 0.45, ease: [0.23, 1, 0.32, 1] });
  });
}
/* a month's test: practice mode, each answer judged as you pick */
function caTestView(m) {
  var T = caTest(m), M = (D.ca.months || []).filter(function (x) { return x.m === m; })[0];
  if (!T) return blank();
  var key = "test:" + m;
  if (!ST.ca[key] || typeof ST.ca[key] !== "object") ST.ca[key] = {};
  var qs = T.map(function (q, i) { return { id: "ca-" + m + "-" + i, s: "G", q: q.q, o: q.o, a: q.a, e: q.e, t: q.cat, src: M.label }; });
  var host = quiz({
    qs: qs, back: "#/ca/" + m, backLabel: M.label,
    get: function (k) { var v = ST.ca[key][k]; return v == null ? null : v; },
    set: function (k, v) { ST.ca[key][k] = v; save(); },
    finLabel: "Finish test",
    done: function () { location.hash = "#/ca/" + m; }
  });
  setAside(host.__pads());
  return host;
}
function wireGseg() {
  els(".gseg").forEach(function (g) {
    var act = el(".gs-act", g), hov = el(".gs-hov", g), on = el("a.on", g);
    var box = function (a) { return { x: a.offsetLeft, w: a.offsetWidth }; };
    var AX = new Spring(0, { damping: 0.82, response: 0.42 }), AW = new Spring(0, { damping: 0.82, response: 0.42 });
    var HX = new Spring(0, { damping: 0.78, response: 0.32 }), HW = new Spring(0, { damping: 0.78, response: 0.32 });
    function paintA() { act.style.transform = "translateX(" + AX.x.toFixed(2) + "px)"; act.style.width = AW.x.toFixed(2) + "px"; }
    function paintH() { hov.style.transform = "translateX(" + HX.x.toFixed(2) + "px)"; hov.style.width = HW.x.toFixed(2) + "px"; }
    AX.onFrame = paintA; AW.onFrame = paintA; HX.onFrame = paintH; HW.onFrame = paintH;
    if (on) {
      var gk = /^#\/ca\/topic/.test(location.hash) ? "t" : "m";
      var b = box(on), from = g.classList.contains("months") && gsegLast && gsegLast.key === gk ? gsegLast : null;
      if (from && !reduceMotion()) { AX.set(from.x); AW.set(from.w); paintA(); AX.target(b.x); AW.target(b.w); }
      else { AX.set(b.x); AW.set(b.w); paintA(); }
      if (g.classList.contains("months")) gsegLast = { key: gk, x: b.x, w: b.w };
      // keep the chosen month in view inside a scrolled strip
      if (g.scrollWidth > g.clientWidth) g.scrollLeft = b.x - (g.clientWidth - b.w) / 2;
    }
    var shown = false;
    els("a", g).forEach(function (a) {
      a.addEventListener("pointerenter", function () {
        var b = box(a);
        if (!shown || reduceMotion()) { HX.set(b.x); HW.set(b.w); paintH(); } else { HX.target(b.x); HW.target(b.w); }
        shown = true; g.classList.add("hovering");
      });
    });
    g.addEventListener("pointerleave", function () { shown = false; g.classList.remove("hovering"); });
  });
}

/* ══════════ five years of papers ══════════
   Per topic: average questions per paper in each exam year, a spark line of
   the trend, and the count expected in the 2026 paper. The prediction is a
   weighted average leaning on 2025, the first year of the new vendor. */
function spark(vals, max) {
  var W = 88, H = 26, n = vals.length;
  if (!max) max = 1;
  var pts = vals.map(function (v, i) { return (4 + i * (W - 8) / Math.max(1, n - 1)).toFixed(1) + "," + (H - 3 - (v / max) * (H - 6)).toFixed(1); });
  var last = pts[pts.length - 1].split(",");
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><polyline points="' + pts.join(" ") + '"/>' +
    '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.6"/></svg>';
}
/* the 2026 shifts so far: repeats, patterns and per-topic counts (tools/analyse2026.py) */
function y26band(Y) {
  return '<section class="band tstep" id="an-2026"><div class="band-h"><h2 class="sec-h reveal">' + h(Y.h) + '</h2>' +
      '<span class="muted reveal">' + h(Y.basis) + '</span></div>' +
    '<p class="muted reveal" style="margin:0 0 18px;max-width:62ch">' + h(Y.lede) + '</p>' +
    '<div class="stats reveal">' + Y.stats.map(function (x) {
      return '<div class="stat"><div class="k">' + h(x.k) + '</div><div class="v">' + h(x.v) + (x.of ? '<small> / ' + h(x.of) + '</small>' : '') + '</div>' +
        '<div class="s">' + h(x.s) + '</div></div>';
    }).join("") + '</div>' +
    '<div class="notes study-ish">' + Y.insights.map(function (x, i) {
      return '<details class="note ins reveal"' + (i ? '' : ' open') + '><summary><h3>' + h(x.h) + '</h3></summary><ul class="pts">' +
        x.points.map(function (p) { return '<li>' + h(p) + '</li>'; }).join("") + '</ul></details>';
    }).join("") + '</div></section>';
}
/* ══════════ the last-day sheet: what the 2026 shifts asked, the fastest way to do each ══════════ */
V["lastday"] = function () {
  var L = D.lastday;
  if (!L) return '<section class="head"><h1 class="page-h">Last-day sheet.</h1><p class="lede">Being compiled.</p></section>' + foot();
  var SN = { R: "Reasoning", Q: "Quant", E: "English" }, LT = "ABCD";
  function ex(e) {
    if (!e || !e.q) return "";
    return '<div class="ld-ex"><span class="ld-k">A 2026 question · about ' + h(String(e.sec || 60)) + ' seconds</span><p class="ld-q">' + h(e.q).replace(/\n/g, "<br>") + '</p>' +
      '<ol class="sol-o">' + (e.o || []).map(function (o, k) { return '<li' + (k === e.a ? ' class="ok"' : '') + '><b>' + LT[k] + '</b><span>' + h(o) + '</span></li>'; }).join("") + '</ol>' +
      '<details class="sol-d"><summary><span>The fast solution</span></summary><ol class="sol-st">' + (e.steps || []).map(function (s) { return '<li>' + h(s) + '</li>'; }).join("") + '</ol>' +
      '<p class="sol-a"><span>Answer</span><b>' + h(LT[e.a] + ". " + (e.o || [])[e.a]) + '</b></p></details></div>';
  }
  function card(c, i) {
    return '<article class="ld-card reveal"><h3><span class="ld-n">' + (i + 1) + '</span>' + h(c.t) + (c.per ? '<small>' + h(c.per) + '</small>' : '') + '</h3>' +
      ((c.forms || []).length ? '<p class="ld-forms">' + c.forms.map(h).join(' · ') + '</p>' : '') +
      ((c.formulas || []).length ? '<div class="ld-fx">' + c.formulas.map(function (f) { return '<code>' + h(f) + '</code>'; }).join("") + '</div>' : '') +
      '<ul class="pts ld-trick">' + (c.trick || []).map(function (t) { return '<li>' + h(t) + '</li>'; }).join("") + '</ul>' + ex(c.ex) + '</article>';
  }
  function list(items) { return '<ul class="pts ld-trick">' + items.map(function (t) { return '<li>' + h(t) + '</li>'; }).join("") + '</ul>'; }
  var S = L.strategy || {}, V = L.vocab || {}, nav = [["ld-plan", "Exam-day plan"], ["ld-R", "Reasoning"], ["ld-Q", "Quant"], ["ld-E", "English"], ["ld-vocab", "Words asked"], ["ld-ga", "GA facts"], ["ld-rep", "Asked twice"], ["ld-pattern", "The pattern"]];
  return '<section class="head">' +
      '<span class="kicker reveal">Exam day · ' + h(examLabel({ day: "numeric", month: "long" })) + ' · ' + h(L.basis || "") + '</span>' +
      '<h1 class="page-h reveal">The last-day sheet.</h1>' +
      '<p class="lede reveal">Only what the ten 2026 shifts asked, with the fastest way to do each. Read it tonight and once more in the morning; nothing new after that.</p>' +
      '<div class="reveal" style="margin-top:18px"><button class="btn quiet sm" type="button" data-print>Print or save as PDF</button></div>' +
    '</section>' +
    '<nav class="chips reveal" style="margin-top:6px">' + nav.map(function (x) { return '<a class="chip" href="#' + x[0] + '" data-jump="' + x[0] + '">' + x[1] + '</a>'; }).join("") + '</nav>' +
    '<section class="band tstep" id="ld-plan"><h2 class="sec-h reveal">Exam-day plan</h2>' +
      '<div class="ld-cols">' + [["The clock", S.clock], ["Tonight", S.night], ["In the hall", S.hall]].map(function (x) { return '<div class="ld-card reveal"><h3>' + x[0] + '</h3>' + list(x[1] || []) + '</div>'; }).join("") + '</div></section>' +
    ["R", "Q", "E"].map(function (k) {
      var cs = (L.cards || {})[k] || [];
      return '<section class="band tstep" id="ld-' + k + '"><div class="band-h"><h2 class="sec-h reveal">' + SN[k] + '</h2><span class="muted reveal">' + cs.length + ' sure topics, surest first</span></div>' +
        (cs.length ? cs.map(card).join("") : '<p class="muted">Being compiled.</p>') + '</section>';
    }).join("") +
    '<section class="band tstep" id="ld-vocab"><div class="band-h"><h2 class="sec-h reveal">Every word asked this year</h2><span class="muted reveal">' + Object.keys(V).reduce(function (a, k) { return a + V[k].length; }, 0) + ' items</span></div>' +
      '<div class="ld-vocab">' + ["Synonyms", "Antonyms", "Idioms & Phrases", "One Word Substitution", "Spelling"].filter(function (k) { return (V[k] || []).length; }).map(function (k) {
        return '<div class="ld-card reveal"><h4>' + h(k) + ' <small>' + V[k].length + '</small></h4><ul>' + V[k].map(function (w) { return '<li><b>' + h(w[0]) + '</b>' + (w[1] ? ' <span class="ld-arr">→</span> ' + h(w[1]) : '') + '</li>'; }).join("") + '</ul></div>';
      }).join("") + '</div></section>' +
    '<section class="band tstep" id="ld-ga"><div class="band-h"><h2 class="sec-h reveal">General Awareness: every fact asked this year</h2><span class="muted reveal">' + (L.ga || []).reduce(function (a, g) { return a + g.n; }, 0) + ' facts, by theme</span></div>' +
      (L.ga || []).map(function (g, i) {
        return '<details class="ld-theme reveal"' + (i < 2 ? ' open' : '') + '><summary>' + h(g.theme) + ' <small>' + g.n + '</small></summary><ol class="ld-facts">' +
          g.facts.map(function (f) { return '<li' + (f.rep ? ' class="hot"' : '') + '>' + h(f.fact) + (f.rep ? ' <span class="pyq rep">Repeated</span>' : '') + '</li>'; }).join("") + '</ol></details>';
      }).join("") + '</section>' +
    '<section class="band tstep" id="ld-rep"><div class="band-h"><h2 class="sec-h reveal">Asked twice this year</h2><span class="muted reveal">' + (L.repeats || []).length + ' questions that came back in another shift</span></div>' +
      (L.repeats || []).map(function (r) {
        return '<article class="kp-q reveal"><div class="qbar"><span class="c">' + h(SN[r.s] || "GA") + ' · ' + h(r.t) + repChip({ id: r.id, rep: r.also }) + '</span></div><div class="qstem"><p>' + h(r.q).replace(/\n/g, "<br>") + '</p></div>' +
          '<div class="opts kp-o">' + r.o.map(function (o, k) { return '<div class="opt' + (k === r.a ? ' ok' : '') + '"><em>' + LT[k] + '</em><span>' + h(o) + '</span></div>'; }).join("") + '</div>' +
          '<details class="sol-d"><summary><span>Solution</span></summary><p class="sol-tr">' + h(r.e).replace(/\n/g, "<br>") + '</p></details></article>';
      }).join("") + '</section>' +
    '<section class="band tstep" id="ld-pattern"><div class="band-h"><h2 class="sec-h reveal">The 2026 pattern</h2><span class="muted reveal">questions per paper, and how many of the ' + (L.pattern && L.pattern.length ? '10' : '') + ' sets had the topic</span></div>' +
      (L.pattern || []).map(function (s) {
        return '<div class="ld-card reveal"><h3>' + h(s.name) + '</h3><div class="atbl" style="margin-top:10px"><table><thead><tr><td>Topic</td><td class="n">Per paper</td><td class="n">Sets</td></tr></thead><tbody>' +
          s.rows.map(function (r) { return '<tr><td>' + h(r.t) + '</td><td class="n">' + r.per.toFixed(1) + '</td><td class="n">' + r.sets + '</td></tr>'; }).join("") + '</tbody></table></div></div>';
      }).join("") + '</section>' + foot();
};
V["analysis"] = function () {
  var A = D.analysis;
  if (!A) return '<section class="head"><h1 class="page-h">Analysis.</h1><p class="lede">Being compiled.</p></section>' + foot();
  var yrs = A.years, Y = A.y2026, now = function (s, t) { var v = Y && Y.topics[s] && Y.topics[s][t]; return v == null ? '·' : v.toFixed(1); };
  var guess = ((D.meta && D.meta.papers) || D.papers).filter(function (p) { return p.guess; });
  return '<section class="head">' +
      '<span class="kicker reveal">' + h(A.basis) + '</span>' +
      '<h1 class="page-h reveal">Five years of papers.</h1>' +
      '<p class="lede reveal">' + h(A.lede) + '</p>' + t2Band("analysis") +
      (guess.length ? '<div class="reveal" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px">' + guess.map(function (p, i) {
        return '<a class="btn ' + (i ? 'quiet' : 'key') + '" href="#/mock/' + encodeURIComponent(p.id) + '">' + (paperOpen(p.id) ? '' : LOCK) + h(p.label) + arr() + '</a>';
      }).join("") + '</div>' : '') +
    '</section>' + (Y ? y26band(Y) : '') +
    '<nav class="chips reveal" style="margin-top:6px">' + SECS.map(function (x) { return '<a class="chip" href="#an-' + x.k + '" data-jump="an-' + x.k + '">' + x.short + '</a>'; }).join("") + '</nav>' +
    SECS.map(function (sec) {
      var rows = (A.sections[sec.k] || []);
      var max = 0; rows.forEach(function (r) { yrs.forEach(function (y) { max = Math.max(max, r.y[y] || 0); }); });
      var ins = (A.insights || []).filter(function (x) { return x.s === sec.k; });
      return '<section class="band tstep" id="an-' + sec.k + '"><div class="band-h"><h2 class="sec-h reveal">' + h(sec.name) + '</h2>' +
          '<span class="muted reveal">Questions per paper, of 25</span></div>' +
        (ins.length ? '<div class="notes study-ish">' + ins.map(function (x) {
          return '<details class="note ins reveal"' + '><summary><h3>' + h(x.h) + '</h3></summary><ul class="pts">' + x.points.map(function (p) { return '<li>' + h(p) + '</li>'; }).join("") + '</ul></details>';
        }).join("") + '</div>' : '') +
        '<div class="atbl reveal"><table><thead><tr><td>Topic</td>' + yrs.map(function (y, i) { return '<td class="n' + (i < yrs.length - 2 ? ' old' : '') + '">' + String(y).slice(2) + '</td>'; }).join("") +
          (Y ? '<td class="n">26</td>' : '') + '<td>Trend</td><td class="n p">Expect</td></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td><a href="' + learnHref(sec.k, r.t) + '">' + h(r.t) + '</a>' + (r.note ? '<span>' + h(r.note) + '</span>' : '') + '</td>' +
              yrs.map(function (y, i) { var v = r.y[y]; return '<td class="n' + (i < yrs.length - 2 ? ' old' : '') + '">' + (v == null ? '·' : v.toFixed(1)) + '</td>'; }).join("") +
              (Y ? '<td class="n">' + now(sec.k, r.t) + '</td>' : '') +
              '<td>' + spark(yrs.map(function (y) { return r.y[y] || 0; }), max) + '</td>' +
              '<td class="n p"><b>' + r.pred + '</b>' + (r.trend ? '<i class="tr ' + r.trend + '">' + (r.trend === "up" ? "▲" : r.trend === "down" ? "▼" : "") + '</i>' : '') + '</td></tr>';
          }).join("") + '</tbody></table></div></section>';
    }).join("") +
    '<p class="muted" style="margin-top:28px">' + h(A.method || "") + '</p>' + foot();
};

/* ══════════ first sign-in: when is your exam ══════════ */
var wel = { hours: 6, shift: "" };
V["welcome"] = function () {
  var P = ST.profile || {}, today = ymd(new Date());
  wel.hours = +P.hours || wel.hours; wel.shift = P.shift || wel.shift;
  var HRS = [[3, "3 h", "Working or in college"], [6, "6 h", "Serious part-time"], [9, "9 h", "Full-time"], [12, "12 h", "All in"]];
  return '<section class="welcome reveal">' +
    '<span class="kicker">' + (P.exam ? 'Your plan' : 'Welcome' + (AU ? ', ' + h(AU.name) : '')) + '</span>' +
    '<h1 class="page-h">When is your exam?</h1>' +
    '<p class="lede">Your date is on the admit card and the city slip. Tier 1 runs from 30 September to 30 October 2026. The plan is built from today to that day, around the hours you have.</p>' +
    '<div class="wf">' +
      '<label class="wl" for="wdate">Exam date</label>' +
      '<input id="wdate" class="wdate" type="date" min="' + today + '" max="2027-12-31" value="' + h(P.exam || "2026-10-10") + '">' +
      '<div class="wl" id="whl">Hours a day you can study</div>' +
      '<div class="hopts" role="radiogroup" aria-labelledby="whl">' + HRS.map(function (x) {
        return '<button type="button" class="hopt' + (wel.hours === x[0] ? ' on' : '') + '" role="radio" aria-checked="' + (wel.hours === x[0]) + '" data-hours="' + x[0] + '"><b>' + x[1] + '</b><span>' + x[2] + '</span></button>';
      }).join("") + '</div>' +
      '<div class="wl" id="wsl">Shift <small>optional</small></div>' +
      '<div class="chips" role="radiogroup" aria-labelledby="wsl">' + ["", "1", "2", "3", "4"].map(function (x) {
        return '<button type="button" class="chip' + (wel.shift === x ? ' on' : '') + '" data-shift="' + x + '">' + (x ? 'Shift ' + x : 'Not sure yet') + '</button>';
      }).join("") + '</div>' +
      '<div id="werr"></div>' +
      '<button class="btn key go" id="wgo">' + (P.exam ? 'Rebuild my plan' : 'Build my plan') + arr() + '</button>' +
      (P.exam ? '<p class="muted" style="margin-top:12px;font-size:13.5px">Rebuilding keeps every tick you have made.</p>' : '') +
    '</div></section>';
};
function wireWelcome() {
  var go = el("#wgo"); if (!go) return;
  els("[data-hours]").forEach(function (b) { b.addEventListener("click", function () { wel.hours = +b.dataset.hours; els("[data-hours]").forEach(function (x) { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); }); }); });
  els("[data-shift]").forEach(function (b) { b.addEventListener("click", function () { wel.shift = b.dataset.shift; els("[data-shift]").forEach(function (x) { x.classList.toggle("on", x === b); }); }); });
  go.addEventListener("click", function () {
    var v = el("#wdate").value, d = parseYmd(v);
    if (!d || d < dayOnly(new Date())) { el("#werr").innerHTML = '<div class="err">Pick a date from today onwards.</div>'; return; }
    var P = ST.profile || {};
    ST.profile = { exam: v, hours: wel.hours, shift: wel.shift, start: P.exam === v && P.start ? P.start : ymd(new Date()) };
    syncExam(); PLANC = null; save();
    location.hash = "#/plan";
  });
}

/* ══════════ premium: pricing and checkout ══════════ */
/* shown once, the first time the app opens after the trial ends */
V["trialover"] = function () {
  var t = totals(), learned = Object.keys(ST.learn || {}).filter(function (k) { return ST.learn[k]; }).length;
  var mocks = Object.keys(ST.att || {}).filter(function (k) { return ST.att[k] && ST.att[k].done && ST.att[k].mode === "mock"; }).length;
  var free = FREE();
  return '<section class="tover reveal"><span class="kicker">Your ' + trialDays() + ' free days are over</span>' +
    '<h1 class="page-h">Keep going to your exam.</h1>' +
    '<p class="lede">In your trial you answered <b>' + t.done.toLocaleString("en-IN") + '</b> question' + (t.done === 1 ? '' : 's') + (t.done ? ' at ' + t.acc + '% accuracy' : '') +
      ', opened <b>' + learned + '</b> topic' + (learned === 1 ? '' : 's') + ' and took <b>' + mocks + '</b> mock' + (mocks === 1 ? '' : 's') + '. The Exam Pass keeps all of it open for ' + planDays() + ' days, past your exam on ' + h(examLabel({ day: "numeric", month: "long" })) + '.</p>' +
    '<div class="tover-b"><a class="btn key big" href="#/premium">Get the ' + passName() + ', ₹' + passRupees() + arr() + '</a><a class="btn quiet big" href="#/learn">Continue with the free topics</a></div>' +
    '<p class="tover-f">Still free: ' + (free.topics.length || 8) + ' topics with complete notes, ' + (free.papers.length || 2) + ' full mocks, the latest month of current affairs and your day-by-day plan.</p>' +
    inviteHTML() + '</section>' + foot();
};
V["premium"] = function (ok) {
  var m = D.meta || {}, free = FREE();
  var until = AU && AU.ent && AU.ent.until ? new Date(AU.ent.until) : null;
  var trial = onTrial(), t2p = t2Offer(), active = isPremium() && !trial && !(t2p && AU.ent && AU.ent.paid && (AU.ent.until - Date.now()) < 60 * 864e5), d = days(), rs = passRupees(), pd = passDays();
  var perDay = d > 0 ? (rs / Math.min(d, planDays())).toFixed(d > 12 ? 1 : 0) : null;
  var CHECK = '<svg viewBox="0 0 20 20" aria-label="Included"><path d="m5 10.5 3.2 3L15 6.5"/></svg>';
  var T2c = m.t2 || { papers: 18, questions: 2200, notes: 66 }, allQ = ((m.questions || 12623) + T2c.questions).toLocaleString("en-IN");
  var rows = [
    ["Tier 1 topics with complete notes", (free.topics.length || 8) + " of 63", "All 63"],
    ["Tier 1 past questions to practise", free.topics.reduce(function (a, k) { return a + ((m.topics || {})[k] || { n: 0 }).n; }, 0).toLocaleString("en-IN"), (m.questions || 12623).toLocaleString("en-IN")],
    ["Tier 1 full mocks, 2026 sectional timing", String(free.papers.length || 2), (m.papers || []).filter(function (p) { return !p.bank && !p.guess; }).length + " + 2 guess papers"],
    ["Tier 2 papers (Paper I, Statistics, Paper III)", "1 paper", "All " + T2c.papers + ", " + T2c.questions.toLocaleString("en-IN") + " questions"],
    ["Tier 2 notes (Computer, Statistics, Paper III and more)", "1 topic", "All " + T2c.notes],
    ["Current affairs, " + caSpan().short, "Latest month", "All " + caSpan().n + " months, " + caSpan().n + " tests"],
    ["Flashcards", (free.decks.length || 3) + " decks", (m.cards || 3000).toLocaleString("en-IN") + " cards"],
    ["Day-by-day plan for Tier 1 and Tier 2", CHECK, CHECK],
    ["Five-year analysis and cut-offs", CHECK, CHECK]
  ];
  var untilTxt = until ? until.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "";

  var card;
  if (active) {
    card = '<div class="ck ck-on" id="ck">' +
      '<div class="ck-seal" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21"/><path d="m15 24.5 6 5.5 12-12"/></svg></div>' +
      '<b class="ck-t">' + (isAdmin() ? 'Owner account' : ok ? 'Payment received. You are in.' : 'Premium is on') + '</b>' +
      '<p class="ck-s">' + (isAdmin() ? 'Admin accounts never expire.' : 'Everything is unlocked until ' + h(untilTxt) + '.') + '</p>' +
      '<a class="btn key big ck-go" href="#/learn">Open your topics' + arr() + '</a>' +
      (isAdmin() ? '<a class="btn quiet ck-go" href="#/admin">Admin console' + arr() + '</a>'
        : '<button class="btn quiet ck-go" id="payBtn">Add ' + planDays() + ' more days, ₹' + rs + '</button>') +
      '<div id="payMsg" class="paymsg" aria-live="polite"></div></div>';
  } else {
    card = '<div class="ck" id="ck">' +
      '<div class="ck-top"><span class="ck-k">' + passName() + '</span><span class="ck-tag">' + (t2p ? 'Tier 1 done' : 'One-time') + '</span></div>' +
      (trial ? '<p class="ck-trial">Your free trial has ' + trialLeft() + ' day' + (trialLeft() === 1 ? '' : 's') + ' left. Pay now and your ' + pd + ' days start after it ends, so nothing is wasted.</p>' : '') +
      (t2p ? '<p class="ck-trial">Your Tier 1 shift is over, so you get the Tier 2 Pass: the same ₹' + rs + ', but ' + pd + ' days, long enough to reach Tier 2.</p>' : '') +
      '<div class="ck-price"><b>₹' + rs + '</b><span>for ' + pd + ' days</span></div>' +
      (perDay ? '<p class="ck-per">About ₹' + perDay + ' a day until your exam.</p>' : '') +
      '<ul class="ck-l">' +
        '<li>' + CHECK + 'All ' + (63 + T2c.notes) + ' topics with complete notes, Tier 1 and Tier 2</li>' +
        '<li>' + CHECK + allQ + ' real past questions and every mock</li>' +
        '<li>' + CHECK + 'Both guess papers and ' + caSpan().n + ' months of current affairs</li>' +
        '<li>' + CHECK + 'Tier 2: all ' + T2c.papers + ' papers, Statistics, Paper III and a plan for your post</li>' +
        '<li>' + CHECK + 'Unlocks instantly, never renews</li></ul>' +
      (!AU ? '<a class="btn key big ck-go" href="#/account">Create a free account to continue' + arr() + '</a>'
        : '<button class="btn key brand big ck-go" id="payBtn" data-plan="' + passKey() + '"' + (AU.payments === false ? ' data-off="1"' : '') + '><span class="ck-bl">Pay ₹' + rs + ' securely</span>' + arr() + '</button>') +
      '<div id="payMsg" class="paymsg" aria-live="polite"></div>' +
      '<div class="ck-trust"><span>UPI</span><span>Cards</span><span>Net banking</span><span>Wallets</span></div>' +
      '<p class="ck-f">Secured by Razorpay. <a href="#/legal/refunds">Refund policy</a> · <a href="#/legal/terms">Terms</a></p>' +
    '</div>';
  }

  return '<div class="prw">' +
    '<section class="pr-hero">' +
      '<div class="pr-ht"><span class="kicker">' + (active ? 'Your pass' : 'The ' + passName()) + '</span>' +
        '<h1 class="page-h">' + (active ? 'Everything is unlocked.' : t2p ? 'Tier 1 is done.<br>Take everything<br>to Tier 2.' : 'Every question.<br>Every topic.<br>Both tiers.') + '</h1>' +
        '<p class="lede">' + (active ? 'Complete notes for all ' + (63 + T2c.notes) + ' topics, ' + allQ + ' past questions, every mock and both guess papers, for Tier 1 and Tier 2.'
          : t2p ? 'Your Tier 1 shift is over. The Tier 2 Pass keeps all ' + (63 + T2c.notes) + ' topics, all ' + T2c.papers + ' Tier 2 papers, ' + allQ + ' real past questions and every mock open for ' + pd + ' days, long enough to reach Tier 2, for ₹' + rs + ' once. No auto-renewal, no card saved.'
          : 'Every account starts with ' + trialDays() + ' days of full access. After that ' + (free.topics.length || 8) + ' topics and ' + (free.papers.length || 2) + ' mocks stay free, and the Exam Pass keeps all ' + (63 + T2c.notes) + ' topics, ' + allQ + ' real past questions and every mock open for ' + planDays() + ' days, for ₹' + rs + ' once. No auto-renewal, no card saved.') + '</p>' +
      '</div>' + card +
      '<ol class="pr-steps"><li><b>1</b><span>Pay with UPI, card or net banking</span></li><li><b>2</b><span>Premium unlocks the moment it succeeds</span></li><li><b>3</b><span>Your plan now covers every topic</span></li></ol>' +
    '</section>' +
    '<section class="band"><h2 class="sec-h">Free and the Exam Pass, side by side</h2>' +
      '<div class="cmp" role="table">' +
        '<div class="cmp-r cmp-h" role="row"><span role="columnheader"></span><span role="columnheader">Free, after ' + trialDays() + ' days</span><span role="columnheader" class="pro">Exam Pass</span></div>' +
        rows.map(function (r) { return '<div class="cmp-r" role="row"><span role="rowheader">' + h(r[0]) + '</span><span role="cell">' + (r[1] === CHECK ? r[1] : h(r[1])) + '</span><span role="cell" class="pro">' + (r[2] === CHECK ? r[2] : h(r[2])) + '</span></div>'; }).join("") +
      '</div></section>' +
    '<section class="band"><h2 class="sec-h">Good to know</h2><div class="pr-faq">' +
      [["What happens after I pay?", "Premium switches on the moment Razorpay confirms the payment, usually within seconds. If your connection drops, it is applied automatically within a few minutes."],
       ["Does it renew?", "No. It is a single payment for " + planDays() + " days. Paying again adds " + planDays() + " days to whatever is left, and paying during your free trial starts the " + planDays() + " days after the trial ends."],
       ["Refunds", "If premium did not unlock or you were charged twice, write to " + SITE.email + " within 7 days with the payment ID. See the refund policy."],
       ["Phone and laptop?", "Both. Sign in on any device and your plan, answers and cards follow you."],
       ["Is my payment safe?", "Payments go through Razorpay. We never see or store your card, UPI or bank details."],
       ["Is this an official SSC site?", "No. CGL Compass is an independent study tool, not affiliated with the Staff Selection Commission."]].map(function (f) {
        return '<div><h3>' + h(f[0]) + '</h3><p>' + h(f[1]) + '</p></div>'; }).join("") +
    '</div></section>' +
    (!active && AU ? '<div class="pr-bar" id="prBar" hidden><div><b>₹' + rs + '</b><span>' + planDays() + ' days, all topics</span></div><button class="btn key" data-pay>Pay ₹' + rs + '</button></div>' : '') +
  '</div>' + foot();
};
var rzpP = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (!rzpP) rzpP = new Promise(function (ok, no) {
    var sc = document.createElement("script"); sc.src = "https://checkout.razorpay.com/v1/checkout.js";
    sc.onload = ok; sc.onerror = function () { rzpP = null; no(new Error("Could not reach Razorpay. Check your connection.")); };
    document.head.appendChild(sc);
  });
  return rzpP;
}
function wirePay() {
  var b = el("#payBtn"); if (!b) return;
  var msg = el("#payMsg");
  function say(t, bad) {
    msg.innerHTML = t ? '<div class="' + (bad ? 'err' : 'okm') + '">' + (bad ? '' : '<span class="spin" aria-hidden="true"></span>') + h(t) + '</div>' : '';
    if (t && window.Motion && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      window.Motion.animate(msg.firstChild, { opacity: [0, 1], transform: ["translateY(-4px)", "translateY(0)"] }, { duration: 0.25 });
    if (bad && window.Motion && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      window.Motion.animate(el("#ck"), { transform: ["translateX(0)", "translateX(-6px)", "translateX(5px)", "translateX(-3px)", "translateX(0)"] }, { duration: 0.35 });
  }
  // phones: a pay bar rides along once the checkout card has scrolled away
  var bar = el("#prBar"), ck = el("#ck");
  if (bar && ck) {
    var io = new IntersectionObserver(function (e) { bar.hidden = e[0].isIntersecting; }, { threshold: 0 });
    io.observe(ck);
    el("[data-pay]", bar).addEventListener("click", function () { ck.scrollIntoView({ behavior: "smooth", block: "center" }); b.click(); });
  }
  b.addEventListener("click", function () {
    if (b.dataset.off) { say("Payments open soon. Your free trial keeps working meanwhile.", true); return; }
    b.disabled = true; say("Opening secure checkout…");
    Promise.all([loadRazorpay(), api("/api/create-order", { method: "POST", body: JSON.stringify({ token: AU.token, plan: b.dataset.plan || "pass" }) })])
      .then(function (r) {
        var o = r[1];
        var rz = new window.Razorpay({
          key: o.key, amount: o.amount, currency: o.currency, order_id: o.order,
          name: SITE.brand, description: (b.dataset.plan === "t2" ? "Tier 2 Pass, " : "Exam Pass, ") + passDays() + " days",
          prefill: { name: o.name }, theme: { color: "#0062d6" },
          handler: function (resp) {
            say("Payment received. Unlocking everything…");
            api("/api/verify-payment", { method: "POST", body: JSON.stringify(Object.assign({ token: AU.token }, resp)) })
              .then(refreshMe).then(function () { premiumLoaded = false; return loadPremium(); })
              .then(function () { location.hash = "#/premium/ok"; route(); toast("Premium is on"); })
              .catch(function (e) { b.disabled = false; say(e.message + " If money left your account, it will be applied automatically within a few minutes.", true); });
          },
          modal: { ondismiss: function () { b.disabled = false; say(""); } }
        });
        rz.on("payment.failed", function (e) { b.disabled = false; say((e.error && e.error.description) || "The payment did not go through.", true); });
        say(""); rz.open();
      })
      .catch(function (e) { b.disabled = false; say(e.message, true); });
  });
}

/* ══════════ admin ══════════ */
var ADM = null, admQ = "";
V["admin"] = function () {
  if (!isAdmin()) return blank();
  if (!ADM) {
    api("/api/admin?token=" + encodeURIComponent(AU.token)).then(function (j) { ADM = j; route(); })
      .catch(function (e) { ADM = { error: e.message, users: [], payments: [] }; route(); });
    return '<div class="boot" style="padding-top:60px"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
  }
  var U = ADM.users || [], now = Date.now();
  var prem = U.filter(function (u) { return u.premium; }).length, active7 = U.filter(function (u) { return u.stats && now - u.stats.savedAt < 7 * 864e5; }).length;
  var revenue = (ADM.payments || []).reduce(function (a, p) { return a + (p.amount || 0); }, 0) / 100;
  var fmt = function (t) { return t ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—"; };
  var ago = function (t) { if (!t) return "never"; var m = Math.round((now - t) / 60000); return m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  var rows = U.filter(function (u) { return !admQ || (u.name + " " + u.slug).toLowerCase().indexOf(admQ) >= 0; });
  return '<section class="head"><span class="kicker reveal">Admin</span><h1 class="page-h reveal">Accounts.</h1>' +
      (ADM.error ? '<div class="err reveal">' + h(ADM.error) + '</div>' : '') + '</section>' +
    '<div class="adstats reveal">' +
      [[U.length, "accounts"], [prem, "premium"], [active7, "active this week"], ["₹" + revenue.toLocaleString("en-IN"), (ADM.payments || []).length + " payments"]].map(function (x) {
        return '<div class="ads"><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join("") + '</div>' +
    '<div class="adbar reveal"><label class="fsearch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg><input id="admq" type="search" placeholder="Find an account" value="' + h(admQ) + '" aria-label="Find an account"></label>' +
      '<button class="btn quiet sm" id="admRefresh">Refresh</button></div>' +
    '<div class="adlist">' + rows.map(function (u) {
      var st = u.stats || {};
      var badge = u.admin ? '<span class="tag key">Admin</span>' : u.paid || (u.premium && !u.trial) ? '<span class="tag ok">' + (u.until > Date.UTC(2090, 0, 1) ? 'Premium · lifetime' : 'Paid to ' + fmt(u.until)) + '</span>'
        : u.trial ? '<span class="tag key">Trial to ' + fmt(u.trialUntil) + '</span>' : '<span class="tag">Free' + (u.trialUntil ? ' · trial ended' : '') + '</span>';
      if (u.refCount) badge += '<span class="tag">' + u.refCount + ' invited</span>';
      return '<div class="adrow reveal">' +
        '<div class="ad-id"><span class="av">' + h(u.name.charAt(0).toUpperCase()) + '</span><div><b>' + h(u.name) + '</b><span>@' + h(u.slug) + ' · joined ' + fmt(u.created) + ' · active ' + ago(st.savedAt) + '</span></div>' + badge + (u.locked ? '<span class="tag no">PIN locked</span>' : '') + '</div>' +
        '<div class="ad-st">' +
          [["Practised", st.practised], ["Mocks", st.mocks], ["Learned", st.learned], ["Error log", st.errors], ["CA read", st.caRead], ["Cards", st.cards]].map(function (x) {
            return '<span><b>' + (x[1] == null ? 0 : x[1]) + '</b>' + x[0] + '</span>'; }).join("") +
          '<span><b>' + (st.exam ? h(st.exam.slice(5).split("-").reverse().join("/")) : "—") + '</b>Exam</span></div>' +
        '<div class="ad-act">' +
          (!u.admin ? '<button class="btn sm key" data-adm="grant" data-slug="' + h(u.slug) + '" data-days="30">+30 days</button>' : '') +
          (!u.admin && u.paid ? '<button class="btn sm quiet" data-adm="revoke" data-slug="' + h(u.slug) + '">Revoke</button>' : '') +
          (!u.admin && !u.paid ? (u.trial ? '<button class="btn sm quiet" data-adm="trial" data-slug="' + h(u.slug) + '" data-days="0">End trial</button>'
            : '') + '<button class="btn sm quiet" data-adm="trial" data-slug="' + h(u.slug) + '" data-days="5">Trial: 5 days from now</button>' : '') +
          (u.locked ? '<button class="btn sm quiet" data-adm="unlock" data-slug="' + h(u.slug) + '">Unlock PIN</button>' : '') +
          '<button class="btn sm quiet" data-adm="reset" data-slug="' + h(u.slug) + '">Reset progress</button>' +
          (!u.admin ? '<button class="btn sm quiet danger" data-adm="delete" data-slug="' + h(u.slug) + '">Delete</button>' : '') +
        '</div></div>';
    }).join("") + '</div>' +
    '<section class="band"><h2 class="sec-h reveal">Payments</h2>' +
      ((ADM.payments || []).length ? '<div class="list" style="margin-top:18px">' + ADM.payments.map(function (p) {
        return '<div class="item" style="grid-template-columns:minmax(0,1fr) auto"><span><span class="t">' + h(p.name || p.slug) + ' · ₹' + (p.amount / 100) + '</span><span class="d">' + fmt(p.at) + ' · ' + h(p.paymentId) + ' · via ' + h(p.via) + ' · premium to ' + fmt(p.until) + '</span></span></div>';
      }).join("") + '</div>' : '<p class="muted" style="margin-top:14px">No payments yet.</p>') + '</section>' + foot();
};
function wireAdmin() {
  var q = el("#admq");
  if (q) q.addEventListener("input", function () { admQ = q.value.trim().toLowerCase(); var pos = q.selectionStart; route(); var n = el("#admq"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
  var r = el("#admRefresh"); if (r) r.addEventListener("click", function () { ADM = null; route(); });
  els("[data-adm]").forEach(function (b) {
    b.addEventListener("click", function () {
      var a = b.dataset.adm, sl = b.dataset.slug;
      var ask = { reset: "Erase all progress for @" + sl + "?", delete: "Delete the account @" + sl + " and all its progress? This cannot be undone.", revoke: "Remove premium from @" + sl + "?" }[a];
      if (ask && !confirm(ask)) return;
      b.disabled = true;
      api("/api/admin", { method: "POST", body: JSON.stringify({ token: AU.token, action: a, slug: sl, days: b.dataset.days }) })
        .then(function () { ADM = null; route(); })
        .catch(function (e) { b.disabled = false; alert(e.message); });
    });
  });
}

/* ══════════ the public front door ══════════ */
/* the topic river and the free-trial answer read meta.json; on a first visit
   the landing paints before it arrives, and landingFill() completes them */
function topicRowsHTML() {
  var T = (D.meta && D.meta.topics) || {}, papers = ((D.meta && D.meta.papers) || []).filter(function (p) { return !p.guess; }).length || 145;
  var rows = Object.keys(T).map(function (k) { var p = k.split("|"); return { s: p[0], t: p[1], n: T[k].n || 0 }; })
    .filter(function (x) { return /^[QREG]$/.test(x.s) && !/^(Mixed|Other)$/.test(x.t); })
    .filter(function (x, i, a) { return a.findIndex(function (y) { return y.t === x.t; }) === i; });
  if (!rows.length) return "";
  var SN = { Q: "Quant", R: "Reasoning", E: "English", G: "GA" };
  rows.sort(function (a, b) { return b.n - a.n; });
  return [0, 1, 2, 3].map(function (r) {
    var tt = rows.filter(function (_, i) { return i % 4 === r; });
    var chips = tt.map(function (x) { var per = x.n / papers;
      return '<span class="tp-c s-' + x.s + '"><i></i><b>' + h(x.t) + '</b><em>' + SN[x.s] + ' · ' + per.toFixed(1) + ' a paper</em></span>'; }).join("");
    return '<div class="tp-row" data-dir="' + (r % 2 ? 1 : -1) + '"><div class="tp-track">' + chips + chips + chips + '</div></div>';
  }).join("");
}
/* The rows drift on their own and answer every kind of motion:
   scrolling speeds them up and leans them, the cursor steers their direction and
   magnifies the chips under it like a dock, and on a phone tilting the screen steers them. */
function wireTopicRows(lp) {
  var box = el(".lp-topics", lp), rows = els(".tp-row", lp);
  if (!box || !rows.length || rows[0].__w) return;
  rows[0].__w = 1;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || BOT) return;
  var fine = matchMedia("(pointer: fine)").matches;
  var st = rows.map(function (r, i) {
    var tr = el(".tp-track", r), cs = els(".tp-c", tr);
    return { row: r, el: tr, cs: cs, dir: +r.dataset.dir, x: -((i * 173) % 400), v: 0, w: 0, off: [], mag: [] };
  });
  var measure = function () { st.forEach(function (o) { o.w = o.el.scrollWidth / 3; o.off = o.cs.map(function (c) { return [c.offsetLeft + c.offsetWidth / 2, c.offsetWidth]; }); o.top = o.row.offsetTop + o.row.offsetHeight / 2; }); };
  measure(); window.addEventListener("resize", measure);
  var px = -1, py = -1, inside = false, tilt = 0, lastY = scrollY, vel = 0, skew = 0, last = performance.now(), on = false;
  var rb = el(".tp-rows", box), drag = null;
  var at = function (e) { var r = rb.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; rb.style.setProperty("--gx", px.toFixed(0) + "px"); rb.style.setProperty("--gy", py.toFixed(0) + "px"); };
  rb.addEventListener("pointermove", function (e) {
    at(e); inside = fine || !!drag; rb.classList.add("lit");
    if (!drag) return;
    var now = performance.now(), dx = e.clientX - drag.x, dtm = Math.max(1, now - drag.t);
    drag.o.x += dx; drag.vx = drag.vx * 0.6 + (dx / dtm * 1000) * 0.4; drag.x = e.clientX; drag.t = now;
    if (Math.abs(e.clientX - drag.x0) > 6) drag.moved = true;
  });
  rb.addEventListener("pointerdown", function (e) {
    at(e); inside = true; rb.classList.add("lit");
    var o = st.reduce(function (b, c) { return Math.abs(c.top - py) < Math.abs(b.top - py) ? c : b; }, st[0]);
    drag = { o: o, x: e.clientX, x0: e.clientX, t: performance.now(), vx: 0, moved: false };
    rb.classList.add("dragging");
  });
  var drop = function () {
    if (drag) { drag.o.v = Math.max(-2600, Math.min(2600, drag.vx)); drag.o.fling = 1; drag = null; }
    rb.classList.remove("dragging");
    if (!fine) { inside = false; setTimeout(function () { if (!drag) rb.classList.remove("lit"); }, 500); }
  };
  rb.addEventListener("pointerup", drop); rb.addEventListener("pointercancel", drop);
  rb.addEventListener("pointerleave", function () { if (fine) { inside = false; rb.classList.remove("lit"); } drop(); });
  window.addEventListener("deviceorientation", function (e) { if (e.gamma != null) tilt = Math.max(-30, Math.min(30, e.gamma)) / 30; });
  if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { var was = on; on = es[0].isIntersecting; if (on && !was) { last = performance.now(); requestAnimationFrame(tick); } }).observe(box);
  else { on = true; requestAnimationFrame(tick); }
  function tick(now) {
    if (!on || !document.body.contains(box)) return;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var dy = scrollY - lastY; lastY = scrollY;
    vel += (Math.max(-80, Math.min(80, dy)) - vel) * 0.12;
    skew += (Math.max(-8, Math.min(8, -vel * 0.12)) - skew) * 0.15;       // rows lean into a fast scroll
    var W = rb.clientWidth, steer = inside && fine ? (px / W - 0.5) * 2 : tilt;   // cursor side or phone tilt, -1..1
    st.forEach(function (o, i) {
      var near = inside ? Math.max(0, 1 - Math.abs(py - o.top) / 90) : 0;
      var base = (24 + i * 5) * o.dir, push = Math.abs(vel) * 1.6 * o.dir;
      var target = (base + push) * (1 - near * 0.8) - steer * 70 * (1 - near * 0.6);
      if (drag && drag.o === o) { o.v = drag.vx; }                       // the finger holds this row
      else {
        o.fling = Math.max(0, (o.fling || 0) - dt * 0.8);                 // a flung row glides, then settles back to its drift
        o.v += (target - o.v) * Math.min(1, dt * (3.5 - o.fling * 2.8));
        o.x += o.v * dt;
      }
      if (o.w) { while (o.x <= -o.w) o.x += o.w; while (o.x > 0) o.x -= o.w; }
      o.el.style.transform = "translate3d(" + o.x.toFixed(2) + "px,0,0) skewX(" + skew.toFixed(2) + "deg)";
      // dock magnification on the row under the cursor and its neighbours
      var rowNear = inside ? Math.max(0, 1 - Math.abs(py - o.top) / 150) : 0;
      for (var k = 0; k < o.cs.length; k++) {
        var m = 0;
        if (rowNear > 0) { var cx = o.off[k][0] + o.x, d = Math.abs(cx - px); if (d < 260) m = (1 - d / 260) * rowNear; }
        m = m * m * (3 - 2 * m);
        if (m > 0.004 || o.mag[k]) {
          o.mag[k] = m > 0.004 ? m : 0;
          o.cs[k].style.transform = m > 0.004 ? "translateY(" + (-6 * m).toFixed(2) + "px) scale(" + (1 + 0.16 * m).toFixed(3) + ")" : "";
          o.cs[k].style.zIndex = m > 0.3 ? 2 : "";
          o.cs[k].classList.toggle("hot", m > 0.55);
        }
      }
    });
    requestAnimationFrame(tick);
  }
}
function freeTierText() {
  var F = FREE();
  return "Everything is open for your first " + trialDays() + " days. After that, " + (F.topics.length || 8) + " full topics, " + (F.papers.length || 2) + " complete mocks, the latest month of current affairs and your plan stay free.";
}
function freeTrialText() {
  var F = FREE();
  return "Everything, for " + trialDays() + " days: all 63 topics with complete notes, every past question, every mock and every month of current affairs. After that, " + (F.topics.length || 8) + " full topics, " + (F.papers.length || 2) + " complete mocks, the latest month of current affairs and three flashcard decks stay free for good. Invite a friend and you both get " + refBonus() + " more days.";
}
function landingFill() {
  var lp = el(".lp"), rv = lp && el(".tp-rows", lp);
  if (!rv) return;
  if (!el(".tp-c", rv)) { rv.innerHTML = topicRowsHTML(); wireTopicRows(lp); }
  var ht = el(".lp-ht", lp);
  if (ht && !el(".np-pill", ht)) ht.insertAdjacentHTML("afterbegin", newPaperPill());
  var fq = el('[data-faq="free"] p', lp);
  if (fq) fq.textContent = freeTrialText();
  var ft = el("[data-free-tier]", lp);
  if (ft) ft.textContent = freeTierText();
}
/* the newest exam's recalled paper, open to everyone */
function newPaperPill() {
  var p = ((D.meta && D.meta.papers) || []).filter(function (x) { return x.open && x.memo; })[0];
  return p ? '<a class="np-pill" href="#/mock/' + encodeURIComponent(p.id) + '"><b>New</b><span>' + h(p.label) + ': every question solved, free</span>' + arr() + '</a>' : '';
}
V["landing"] = function () {
  var m = D.meta || {}, T2c = m.t2 || { papers: 18, questions: 2200, notes: 66 }, q = ((m.questions || 12623) + T2c.questions).toLocaleString("en-IN");
  var shifts = (m.papers || []).length ? (m.papers || []).filter(function (p) { return !p.guess; }).length : 145;
  var d = days();
  var STEPS = [
    ["Tell us your exam date", "Pick your shift date and how many hours a day you can study. That is all it needs."],
    ["Get a plan for every day", "Heaviest topics first, the four sections interleaved, current affairs spread across the weeks, revision and a full rehearsal at the end."],
    ["Learn, practise, tick it off", "Each day opens the notes, the past questions and the mock it needs. Misses go to an error log that brings them back."]
  ];
  // a sample day, drawn with the same parts the real plan uses
  var DAY = [
    ["Quant", "Geometry: triangles and circles", "Notes + 40 PYQs", "1 h 40 m"],
    ["Reasoning", "Seating arrangement", "Notes + 30 PYQs", "1 h 10 m"],
    ["English", "Idioms and phrases", "60 cards + 25 PYQs", "50 m"],
    ["GA", "Polity: Fundamental Rights", "Facts + 30 PYQs", "1 h"],
    ["Current affairs", "August 2026", "Read + 20-question test", "40 m"],
    ["Mock", "CGL 2025, 12 Sep shift 2", "4 × 15 min, timed", "1 h"]
  ];
  var STORY = [
    ["Tell us your exam date", "Your shift date and how many hours a day you have. Nothing else."],
    ["Get a plan for every day", "Heaviest topics first, four sections interleaved, revision and a full rehearsal at the end."],
    ["Learn from complete notes", "Every topic as a chapter you can actually remember: timelines, tables, mnemonics and a one-screen recap."],
    ["Test yourself like the real exam", "Real shifts under the 2026 sectional timing. Every miss goes to an error log that brings it back."]
  ];
  var FAQ = [
    ["Where do the questions come from?", "From SSC's own candidate response sheets, shift by shift, with the official answer key. 2025 papers were read from the printed sheets."],
    ["What does the free trial include?", freeTrialText(), "free"],
    ["Is the Exam Pass a subscription?", "No. ₹" + planRupees() + " once for " + planDays() + " days. Nothing renews by itself and no card is stored. Pay during your trial and the " + planDays() + " days start when the trial ends."],
    ["What about after Tier 1?", "The day after your Tier 1 shift the app turns to Tier 2, and the Tier 2 Pass opens: the same ₹" + planRupees() + ", but it lasts long enough to reach Tier 2 in December."],
    ["Does it cover Tier 2?", "Yes. Every Tier 2 paper since the 2022 pattern, including CGL 2025, the Statistics paper for JSO and Paper III for AAO, as timed mocks or topic practice, with notes for Computer Knowledge, Statistics and Paper III and a Tier 2 plan built for your post."],
    ["What if my exam date changes?", "Change it any time. The plan is rebuilt around the new date and keeps what you have already done."],
    ["Does it work on a phone?", "Yes. It is built for the phone first; your progress follows you between phone and laptop."],
    ["Is this an official SSC site?", "No. It is an independent study tool and is not affiliated with the Staff Selection Commission."]
  ];
  return '<div class="lp">' +
    '<section class="lp-hero">' +
      '<div class="lp-ht">' +
        newPaperPill() +
        '<span class="kicker">SSC CGL 2026 · Tier 1 and Tier 2</span>' +
        '<h1 class="lp-h"><span>Your SSC CGL</span> <span>preparation,</span> <span>planned to <em>the day.</em></span></h1>' +
        '<p class="lp-lede">Tell us your exam date. Get a daily plan for Tier 1, then for Tier 2, complete notes for every topic on the syllabus and ' + q + ' real past questions from both tiers.</p>' +
        '<div class="lp-cta"><a class="btn key brand big" href="#/account" data-mode="up">Build my plan' + arr() + '</a><a class="btn quiet big" href="#/premium">Premium, ₹' + planRupees() + '</a></div>' +
        '<p class="lp-fine">' + trialDays() + ' days of everything free, no card. Already a member? <a href="#/account" data-mode="in">Sign in</a></p>' +
      '</div>' +
      compassStage(true).replace('class="g2-stage', 'class="g2-stage lp-pc') +
    '</section>' +
    '<section class="lp-stats">' + [[q, "real past questions"], [shifts + T2c.papers, "real papers, Tier 1 and 2"], [63 + T2c.notes, "topics with complete notes"], [String(((D.meta && D.meta.months) || []).length || 21), "months of current affairs"]].map(function (x) {
      return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join("") + '</section>' +

    '<section class="lp-manifesto"><p class="lp-mf" data-words>Most aspirants do not fail for lack of effort. They fail for lack of direction: too many sources, no order, and no idea what today should look like. CGL Compass fixes the direction, so all your effort counts.</p></section>' +

    '<section class="lp-story" id="story">' +
      '<div class="st-pin">' +
        '<div class="st-text">' +
          '<span class="kicker">How it works</span>' +
          '<div class="st-rail" aria-hidden="true"><i></i></div>' +
          '<ol class="st-steps">' + STORY.map(function (x, i) {
            return '<li data-st="' + i + '"' + (i ? '' : ' class="on"') + '><span class="st-n">0' + (i + 1) + '</span><h3>' + h(x[0]) + '</h3><p>' + h(x[1]) + '</p></li>'; }).join("") + '</ol>' +
        '</div>' +
        '<div class="st-stage">' +
          // 1: the date
          '<div class="st-v on" data-sv="0"><div class="sv-card sv-cal"><div class="sv-h"><span>Your exam</span><b>October 2026</b></div>' +
            '<div class="cal">' + ["M","T","W","T","F","S","S"].map(function (x) { return '<em>' + x + '</em>'; }).join("") +
              '<i></i><i></i><i></i>' + Array.apply(null, { length: 31 }).map(function (_, i) { var n = i + 1; return '<span class="' + (n === 10 ? 'x' : n < 10 && n >= 1 ? 'soon' : '') + '">' + n + '</span>'; }).join("") + '</div>' +
            '<div class="sv-row"><span>Shift 1 · 9:00 AM</span><span>6 hours a day</span></div></div></div>' +
          // 2: the plan
          '<div class="st-v" data-sv="1"><div class="lp-day"><div class="lp-dh"><div><span>Day 4 of ' + Math.max(d, 14) + '</span><b>Today, 6 hours</b></div><em>' + d + ' days to go</em></div><ul>' +
            DAY.map(function (r, i) { return '<li class="' + (i < 3 ? 'done' : '') + '"><i aria-hidden="true"></i><div><span class="lp-sec">' + h(r[0]) + '</span><b>' + h(r[1]) + '</b><small>' + h(r[2]) + '</small></div><time>' + h(r[3]) + '</time></li>'; }).join("") +
            '</ul><div class="lp-dbar"><span style="transform:scaleX(.5)"></span></div></div></div>' +
          // 3: the notes
          '<div class="st-v" data-sv="2"><div class="sv-card sv-notes"><div class="sv-h"><span>History · Chapter 7</span><b>The Revolt of 1857</b></div>' +
            '<p class="sv-intro">It began as a soldiers\' mutiny at Meerut and became the first large, organised challenge to Company rule.</p>' +
            '<ol class="sv-tl"><li><b>10 May 1857</b><span>Sepoys at Meerut revolt and march to Delhi.</span></li><li><b>11 May</b><span>Bahadur Shah Zafar proclaimed emperor.</span></li><li><b>1858</b><span>Crown takes over from the Company.</span></li></ol>' +
            '<div class="sv-mn"><span>Remember</span>Rani Lakshmibai: Jhansi · Kunwar Singh: Bihar · Begum Hazrat Mahal: Lucknow</div></div></div>' +
          // 4: the mock
          '<div class="st-v" data-sv="3"><div class="sv-card sv-mock"><div class="sv-h"><span>Full mock · 60 min</span><b>Your score</b></div>' +
            '<div class="sv-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50"/><circle class="arc" cx="60" cy="60" r="50" pathLength="100" style="stroke-dashoffset:26"/></svg><div><b>148</b><span>of 200</span></div></div>' +
            '<div class="sv-bars">' + [["Reasoning", 84], ["General Awareness", 64], ["Quant", 76], ["English", 72]].map(function (x) {
              return '<div><span>' + x[0] + '</span><i><em style="transform:scaleX(' + x[1] / 100 + ')"></em></i></div>'; }).join("") + '</div>' +
            '<div class="sv-row"><span>2025 cut-off, UR: about 136</span><span class="up">+12 above</span></div></div></div>' +
        '</div>' +
      '</div>' +
    '</section>' +

    notesShowHTML() +

    '<section class="lp-topics" aria-label="All 63 topics">' +
      '<div class="lp-bh"><span class="kicker">The whole syllabus</span><h2 class="lp-h2">63 topics. Every one mapped, taught and tested.</h2>' +
        '<p class="lp-sub">Every topic has complete notes, every past question and a place in your plan. <span class="hint-f">Point at the rows, or drag them.</span><span class="hint-t">Swipe the rows, or tilt your phone.</span></p></div>' +
      '<div class="tp-rows" aria-hidden="true">' + topicRowsHTML() + '</div>' +
    '</section>' +

    '<section class="lp-band">' +
      '<div class="lp-bh"><span class="kicker">What is inside</span><h2 class="lp-h2">Everything the plan points you to.</h2></div>' +
      '<div class="lp-bento">' +
        '<article class="b-notes"><h3>Complete notes for every topic</h3><p>Concepts from the basics up, every formula and rule, the traps SSC sets, worked examples from past papers and a last-day revision list.</p>' +
          '<div class="b-snip"><span>Percentage · successive change</span><p>+25% then −12%: 25 − 12 − (25 × 12)/100 = <b>+10%</b></p></div></article>' +
        '<article class="b-mock"><h3>Mocks under the 2026 rules</h3><p>Real Tier 1 shifts in four locked 15-minute sections, and real Tier 2 papers with their module timers.</p><div class="b-timer"><b data-clock>14:59</b><span>Reasoning · locked</span></div></article>' +
        '<article><h3>Five years, one forecast</h3><p>Every shift from 2021 to 2025 sorted by topic, and two guess papers written to that pattern.</p><a class="b-link" href="#/cutoffs">See every cut-off since 2017' + arr() + '</a></article>' +
        '<article><h3>An error log that clears itself</h3><p>Every miss comes back until you get it right twice in a row.</p></article>' +
        '<article><h3>' + caSpan().n + ' months of current affairs</h3><p>' + caSpan().from + ' to ' + caSpan().to + ', month by month, each with a 20-question test.</p></article>' +
      '</div>' +
    '</section>' +

    '<section class="lp-band lp-t2s">' +
      '<div class="lp-bh"><span class="kicker">Tier 1 and Tier 2</span><h2 class="lp-h2">One planner for the whole exam.</h2>' +
        '<p class="lp-sub">Tier 1 today, Tier 2 the day after your shift. The same notes go deeper, the plan changes shape, and the mocks change to the Tier 2 paper.</p></div>' +
      '<div class="lp-t2">' +
        '<article><span class="t2-k">Tier 1</span><h3>' + shifts + ' real shifts, 63 topics</h3><p>Mocks under the 2026 fifteen-minute sections, notes from the basics up, current affairs and a plan to your shift.</p></article>' +
        '<article><span class="t2-k">Tier 2</span><h3>' + T2c.papers + ' real papers, by post</h3><p>Paper I with the 2026 module timers, Statistics for JSO, Paper III for AAO, Computer Knowledge, and a plan built for the post you want.</p></article>' +
        '<a class="t2-soon" href="#/tier2" style="text-decoration:none"><span class="t2-k">Automatic</span><h3>It switches when you do</h3><p>The day after your Tier 1 shift, your home page, plan and mocks turn to Tier 2. You can switch any time.</p></a>' +
      '</div>' +
    '</section>' +

    '<section class="lp-band lp-price">' +
      '<div class="lp-bh"><span class="kicker">Pricing</span><h2 class="lp-h2">Everything free for ' + trialDays() + ' days. Then ₹' + planRupees() + ' to your exam.</h2></div>' +
      '<div class="lp-tiers">' +
        '<article class="tier">' +
          '<header><span class="tier-k">Free trial</span><p class="tier-p"><b>' + trialDays() + ' days</b><small>of everything, no card</small></p></header>' +
          '<p class="tier-d" data-free-tier>' + freeTierText() + '</p>' +
          '<ul class="tier-l"><li>All 63 topics, every mock, for ' + trialDays() + ' days</li><li>Your day-by-day plan to your shift</li><li>+' + refBonus() + ' days for each friend you invite</li><li>Then ' + (FREE().topics.length || 8) + ' topics and ' + (FREE().papers.length || 2) + ' mocks stay free</li></ul>' +
          '<a class="btn quiet big" href="#/account" data-mode="up">Start the free ' + trialDays() + ' days' + arr() + '</a>' +
        '</article>' +
        '<article class="tier pro">' +
          '<header><span class="tier-k">Exam Pass</span><span class="tier-b">Everything, to your exam</span><p class="tier-p"><b>₹' + planRupees() + '</b><small>for ' + planDays() + ' days, paid once</small></p></header>' +
          '<p class="tier-d">About ₹' + Math.max(1, Math.round(planRupees() / planDays() * 10) / 10) + ' a day. The whole of CGL Compass, for less than one day of coaching.</p>' +
          '<ul class="tier-l"><li>All 63 topics with complete notes</li><li>' + q + ' real past questions</li><li>Every Tier 1 and Tier 2 mock</li><li>Both 2026 guess papers</li><li>Never renews, no auto-debit</li></ul>' +
          '<a class="btn key big" href="#/premium">Get the Exam Pass' + arr() + '</a>' +
        '</article>' +
      '</div>' +
    '</section>' +

    '<section class="lp-band lp-faq">' +
      '<div class="lp-bh"><span class="kicker">Questions</span><h2 class="lp-h2">Before you start.</h2></div>' +
      '<div class="lp-qs">' + FAQ.map(function (f) {
        return '<details class="offic l2-qa"' + (f[2] ? ' data-faq="' + f[2] + '"' : '') + '><summary>' + h(f[0]) + '</summary><p>' + h(f[1]) + '</p></details>'; }).join("") + '</div>' +
    '</section>' +
    '<section class="lp-final"><div class="lp-fin">' +
      '<b class="lp-fd">' + d + '</b><h2>' + (d === 1 ? 'day' : 'days') + ' to ' + h(examLabel({ day: "numeric", month: "long" })) + '.<br>Let us use every one.</h2>' +
      '<a class="btn big lp-fbtn" href="#/account" data-mode="up">Build my plan' + arr() + '</a>' +
      '<svg class="fin-cmp" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92" class="fc-r"/><circle cx="100" cy="100" r="78" class="fc-i"/>' +
        Array.apply(null, { length: 36 }).map(function (_, i) { var q = i % 9 === 0; return '<line x1="100" y1="' + (q ? 14 : 18) + '" x2="100" y2="26" transform="rotate(' + i * 10 + ' 100 100)" class="' + (q ? 'fq' : 'fm') + '"/>'; }).join("") +
        '<g class="fin-nd" transform="rotate(0 100 100)"><path d="M100 30 108 100h-16z" class="fn"/><path d="M100 170 108 100h-16z" class="fs"/></g><circle cx="100" cy="100" r="6" class="fh"/></svg>' +
    '</div></section>' +
  '</div>' + foot();
};

/* ══════════ legal: what Razorpay and visitors need to see ══════════ */
V["legal"] = function (which) {
  var B = SITE.brand, O = SITE.owner, E = SITE.email;
  var P = {
    terms: ["Terms of use", [
      ["The service", B + " is an independent online study tool for the SSC Combined Graduate Level examination, operated by " + O + ". It is not affiliated with the Staff Selection Commission."],
      ["Accounts", "You sign in with a name and a PIN. Keep the PIN private; you are responsible for activity on your account. One account is for one person."],
      ["Free trial", "Every new account gets " + trialDays() + " days of access to all content. Accounts made before the trial began got " + trialDays() + " days from 30 September 2026. When a friend creates an account with Google or a phone number through your invite link, you both get " + refBonus() + " more days, for up to 10 friends. After the trial, a small set of free content stays open."],
      ["Exam Pass", "The Exam Pass costs ₹" + planRupees() + " and unlocks all content for " + planDays() + " days, counted from payment, or from the end of a free trial or an existing paid period that is still running. It does not renew automatically."],
      ["Content", "Past questions are reproduced from publicly released SSC candidate response sheets for study. Notes, explanations, analysis and guess papers are our own and may contain errors; check important facts against official sources."],
      ["Acceptable use", "Do not copy, resell or redistribute the content, share accounts, or attempt to bypass access controls. We may suspend accounts that do."],
      ["Liability", "The service is provided as is. We do not guarantee any exam result. Our total liability is limited to the amount you paid in the last " + planDays() + " days."],
      ["Changes", "We may update these terms; the date below shows the latest version. Continued use means you accept the update."]
    ]],
    privacy: ["Privacy policy", [
      ["What we store", "Your display name, a salted hash of your PIN (never the PIN itself), your study progress, your exam date and study hours, and a record of any payment (payment ID, amount, date)."],
      ["Payments", "Payments are processed by Razorpay. We never see or store your card, UPI or bank details."],
      ["Why", "Only to run your account, sync your progress between devices and apply premium."],
      ["Sharing", "We do not sell or share your data. It is stored with our hosting provider, Vercel."],
      ["Deletion", "Write to " + E + " from any address with your account name and we will delete your account and progress."]
    ]],
    refunds: ["Refund and cancellation", [
      ["Cancellation", "The Exam Pass is a one-time payment for " + planDays() + " days. There is nothing to cancel; it simply ends."],
      ["Refunds", "If premium did not unlock after a successful payment, or you were charged twice, write to " + E + " within 7 days with the payment ID. We will unlock it or refund the full amount to the original method within 5 to 7 working days."],
      ["Other requests", "Because all content is available immediately after payment, other refund requests are reviewed case by case."]
    ]],
    contact: ["Contact", [
      ["Support", "Email " + E + ". We reply within two working days."],
      ["Operator", O + ", " + SITE.city + ", India."]
    ]]
  };
  var d = P[which] || P.terms;
  return '<section class="head"><span class="kicker reveal">' + h(B) + '</span><h1 class="page-h reveal">' + h(d[0]) + '.</h1>' +
    '<p class="muted reveal">Last updated 30 September 2026.</p></section>' +
    '<div class="legal">' + d[1].map(function (x) { return '<section class="reveal"><h2>' + h(x[0]) + '</h2><p>' + h(x[1]) + '</p></section>'; }).join("") + '</div>' +
    '<nav class="l2-legalnav reveal">' + [["terms", "Terms"], ["privacy", "Privacy"], ["refunds", "Refunds"], ["contact", "Contact"]].map(function (x) {
      return '<a href="#/legal/' + x[0] + '"' + (x[0] === which ? ' class="on"' : '') + '>' + x[1] + '</a>'; }).join("") + '</nav>' + foot();
};

/* a hosted PDF, opened through a signed link that only allowed accounts get */
V["pdf"] = function (sub, name, pg) {
  if (!canPdf()) return blank();
  var f = sub + "/" + name, x = (D.library || []).filter(function (y) { return y.file === "pdfs/" + f; })[0] || { title: name.replace(/\.pdf$/, "").replace(/-/g, " ") };
  return '<div class="reader">' +
    '<div class="reader-h"><a class="kicker" href="#/library">&#8592; Library</a><h1>' + h(x.title) + '</h1>' +
      '<div class="reader-a"><span class="muted">' + [x.pages ? x.pages + ' pages' : '', x.mb ? (+x.mb).toFixed(1) + ' MB' : '', pg ? 'opens at page ' + (+pg) : ''].filter(Boolean).join(' · ') + '</span>' +
      '<a class="btn quiet sm" id="pdfFull" href="#" target="_blank" rel="noopener">Full screen &#8599;</a>' +
      (x.url ? '<a class="btn quiet sm" href="' + h(x.url) + '" target="_blank" rel="noopener noreferrer">Source &#8599;</a>' : '') + '</div></div>' +
    '<div class="pdfwrap"><div class="skel pdfskel"></div><iframe class="pdfv" id="pdfv" data-f="' + h(f) + '" data-pg="' + (+pg || 0) + '" title="' + h(x.title) + '"></iframe></div>' +
    '<p class="muted" style="margin-top:12px;font-size:13.5px">On a phone the page viewer may show only the first page. Use Full screen.</p></div>';
};
function wirePdf() {
  var fr = el("#pdfv"); if (!fr || fr.src) return;
  api("/api/file?f=" + encodeURIComponent(fr.dataset.f) + "&token=" + encodeURIComponent(AU.token)).then(function (j) {
    var u = j.url + (+fr.dataset.pg ? "#page=" + fr.dataset.pg + "&view=FitH" : "#view=FitH");
    fr.src = u; var fl = el("#pdfFull"); if (fl) fl.href = u;
    fr.addEventListener("load", function () { var sk = el(".pdfskel"); if (sk) sk.remove(); });
  }).catch(function (e) { fr.outerHTML = '<div class="err">' + h(e.message) + '</div>'; });
}

/* ── more: the phone's way to everything the bottom bar has no room for ── */
V["more"] = function () {
  var L = [
    ["#/plan", "Plan", "Your days to the exam, learn then practise"],
    ["#/tier2", "Tier 2", "Real Tier 2 mocks, Computer, Statistics and Paper III notes, typing trainer"],
    ["#/tier2/plan", "Tier 2 plan", t2Prof() ? "Your plan to " + t2Prof().exam : "Build a day-by-day plan for Tier 2"],
    ["#/cutoffs", "Cut-offs", "Every Tier 1 cut-off since 2017 and a 2026 estimate"],
    ["#/lastday", "Last-day sheet", "What the 2026 shifts asked and the fastest way to do each"],
    ["#/analysis", "Analysis & guess paper", "Five years of papers, what repeats, and a predicted paper"],
    ["#/errors", "Error log", (errList().length || "No") + " questions to clear"],
    ["#/cards", "Flashcards", cardList().length + " cards, spaced by how well you know them"],
    ["#/ca", "Current affairs", caSpan().from + " to " + caSpan().to + ", by month or by topic"],
    ["#/library", "Library", "Free notes and question banks, read here"],
    ["#/videos", "Videos", "Lessons that play on the page"],
    ["#/sources", "Sources", "What is worth buying, and what to skip"],
    ["#/progress", "Progress", "Mock scores and accuracy by topic"],
    ["#/premium", onTrial() ? "Free trial: " + trialLeft() + " days left" : isPremium() ? "Your pass" : "Get the " + passName(), onTrial() ? "Everything is open; the Exam Pass keeps it that way" : isPremium() ? "Everything unlocked" : "₹" + planRupees() + " for " + planDays() + " days, all 63 topics and every mock"],
    ["#/welcome", "Exam date and hours", ST.profile && ST.profile.exam ? examLabel() + ", " + ST.profile.hours + " h a day" : "Set them to build your plan"],
    ["#/account", "Account", AU ? "Signed in as " + AU.name : "Sign in"]
  ];
  if (isAdmin()) L.unshift(["#/admin", "Admin", "Accounts, plans and payments"]);
  return '<section class="head"><h1 class="page-h reveal">More.</h1></section>' +
    '<div class="list reveal">' + L.map(function (x) {
      return '<a class="item" href="' + x[0] + '" style="grid-template-columns:minmax(0,1fr) auto;align-items:center"><span><span class="t">' + h(x[1]) + '</span><span class="d">' + h(x[2]) + '</span></span><span class="end">' + arr() + '</span></a>';
    }).join("") + '</div>' + foot();
};

/* ── sources ── */
V["sources"] = function () {
  return '<section class="head">' +
      '<span class="kicker reveal">Every link opened and checked</span>' +
      '<h1 class="page-h reveal">Sources.</h1>' +
      '<p class="lede reveal">Official first, then the free material worth your time, then the few paid things that earn their price in the time you have.</p>' +
    '</section>' +
    D.sources.map(function (g) {
      return '<section class="band"><h2 class="sec-h reveal">' + h(g.g) + '</h2>' + (g.note ? '<p class="muted reveal" style="margin-top:12px">' + h(g.note) + '</p>' : '') +
        '<div class="list" style="margin-top:18px">' +
        g.items.map(function (it) {
          return '<a class="item reveal" href="' + h(it.url) + '" target="_blank" rel="noopener noreferrer" style="grid-template-columns:minmax(0,1fr) auto">' +
            '<span><span class="t">' + h(it.title) + '</span><span class="d">' + h(it.what) + '</span>' +
            (it.tag ? '<span class="meta"><span class="tag' + (it.tag === "Buy" ? " key" : it.tag === "Skip" ? " no" : "") + '">' + h(it.tag) + '</span>' + (it.price ? '<span>' + h(it.price) + '</span>' : '') + '</span>' : '') + '</span>' +
            '<span class="end">&#8599;</span></a>';
        }).join("") + '</div></section>';
    }).join("") + foot();
};

/* ── progress ── */
function trendChart(hist) {
  if (!hist.length) return '<p class="muted">Your score line starts with your first mock.</p>';
  var W = 640, H = 220, L = 34, R = 12, T = 14, B = 26;
  var max = 200, n = hist.length;
  var x = function (i) { return L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)); };
  var y = function (v) { return T + (1 - Math.max(0, v) / max) * (H - T - B); };
  var pts = hist.map(function (m, i) { return x(i).toFixed(1) + "," + y(m.s.marks).toFixed(1); }).join(" ");
  var grid = [0, 50, 100, 150, 200].map(function (v) {
    return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="gl"/>' +
      '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" class="ax" text-anchor="end">' + v + '</text>';
  }).join("");
  var cut = CUTOFF ? '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(CUTOFF.ur) + '" y2="' + y(CUTOFF.ur) + '" class="cut"/>' +
    '<text x="' + (W - R) + '" y="' + (y(CUTOFF.ur) - 6) + '" class="ax cutl" text-anchor="end">UR cut-off ' + CUTOFF.ur + '</text>' : '';
  return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Mock scores over time">' + grid + cut +
    '<polyline points="' + pts + '" class="ln"/>' +
    hist.map(function (m, i) { return '<circle cx="' + x(i) + '" cy="' + y(m.s.marks) + '" r="4.5" class="dot"><title>' + m.s.marks.toFixed(1) + '</title></circle>'; }).join("") +
    '</svg></div>';
}
V["progress"] = function () {
  var t = totals(), hist = mockHistory(), stats = topicStats().filter(function (s) { return s.done; });
  var ring = [
    { k: "Questions", p: t.total ? t.done / t.total : 0, n: t.done, v: String(t.done), suffix: " of " + t.total },
    { k: "Accuracy", p: t.acc / 100, n: t.acc, v: t.acc + "%", suffix: "%" },
    { k: "Cards", p: cardPct() / 100, n: cardPct(), v: cardPct() + "%", suffix: "%" }
  ];
  return '<section class="head hero">' +
      '<div class="hero-t"><span class="kicker reveal">Stored against your account</span>' +
      '<h1 class="page-h reveal">Progress.</h1>' +
      '<p class="lede reveal">Mock scores against last year\'s cut-off, and accuracy by topic.</p></div>' +
      '<figure class="hero-g reveal">' + rings(ring) + ringLegend(ring) + '</figure></section>' +
    '<section class="band"><h2 class="sec-h reveal">Mock scores</h2><div class="reveal" style="margin-top:18px">' + trendChart(hist) + '</div></section>' +
    '<section class="band"><h2 class="sec-h reveal">By topic</h2>' +
      (stats.length ? '<div class="list" style="margin-top:18px">' + stats.sort(function (a, b) { return a.acc - b.acc; }).map(function (s) {
        return '<a class="item reveal" href="#/practice/' + s.s + '/' + encodeURIComponent(s.t) + '" style="grid-template-columns:minmax(0,1fr) auto">' +
          '<span><span class="t">' + h(secOf(s.s).short + ' · ' + s.t) + '</span><span class="d">' + s.right + ' of ' + s.done + ' right</span>' +
          '<span class="track" style="max-width:260px"><i style="--p:' + (s.acc / 100) + '"></i></span></span>' +
          '<span class="end"><b>' + s.acc + '%</b></span></a>';
      }).join("") + '</div>' : '<p class="muted reveal" style="margin-top:14px">Nothing answered yet.</p>') + '</section>' +
    '<section class="band"><h2 class="sec-h reveal">Reset</h2>' +
      '<p class="muted reveal" style="margin-top:14px">Clearing is permanent.</p>' +
      '<button class="btn quiet reveal" id="wipe" style="margin-top:18px">Erase all progress' + arr() + '</button></section>' + foot();
};

function blank() {
  return '<div class="blank"><b>Not found</b><p>That page does not exist, or its data has not loaded.</p>' +
    '<a class="btn key" href="#/" style="margin-top:20px">Overview' + arr() + '</a></div>';
}
function foot() {
  return '<footer class="foot"><nav class="footnav"><a href="/ssc-cgl-syllabus">Syllabus</a><a href="/ssc-cgl-exam-pattern">Exam pattern</a><a href="/ssc-cgl-cut-off">Cut-offs</a><a href="/ssc-cgl-previous-year-papers">Previous papers</a><a href="/ssc-cgl-notes">Notes</a><a href="/ssc-cgl-tier-2">Tier 2</a><a href="/about">About</a></nav><nav class="footnav"><a href="#/premium">Pricing</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refunds">Refunds</a><a href="/contact">Contact</a></nav>SSC Combined Graduate Level Examination 2026, Tier 1 and Tier 2. Past papers from publicly shared shift-wise PDFs; answer keys as published.<br>' +
    'Not affiliated with the Staff Selection Commission. Verify dates, timings and rules against your own admit card and ssc.gov.in.</footer>';
}

/* ── cards ── */
V["cards"] = function (deck, mode) {
  var all = cardList(); srsMigrate(all);
  var scope = deck ? decodeURIComponent(deck) : "";
  function pool(sc) {
    if (!sc || sc === "all") return all.slice();
    if (/^sec:/.test(sc)) return all.filter(function (c) { return c.sec === sc.slice(4); });
    return all.filter(function (c) { return c.topic === +sc; });
  }
  function scopeName(sc) { return !sc || sc === "all" ? "All decks" : /^sec:/.test(sc) ? "All " + secOf(sc.slice(4)).short : deckName(+sc); }
  var free = isPremium() ? '' : '<a class="freebar" href="#/premium">' + LOCK + '<span>Free: ' + all.length + ' cards in ' + D.cards.length + ' decks. The ' + passName() + ' opens ' + ((D.meta && D.meta.cards) || 3000).toLocaleString("en-IN") + '.</span><b>Unlock' + arr() + '</b></a>';
  function asideStats() {
    var c = srsCounts(all), d = srsToday();
    setAside('<h4>Today</h4>' +
      '<div class="runstat"><span class="k">Studied</span><b>' + (d.n + d.r) + '</b></div>' +
      '<div class="runstat"><span class="k">New learned</span><b>' + d.n + ' / ' + SRS.newPerDay + '</b></div>' +
      '<div class="runstat" style="margin-top:14px"><span class="k">Held for 3 weeks+</span><b>' + mastered() + '</b></div>' +
      '<div class="runstat"><span class="k">Readiness</span><b>' + cardPct() + '%</b></div>' +
      '<div class="track"><i style="--p:' + (cardPct() / 100) + '"></i></div>' +
      '<h4 style="margin-top:24px">Waiting</h4><ul class="fc-cnt"><li class="n"><b>' + c.nShow + '</b>new</li><li class="l"><b>' + c.l + '</b>learning</li><li class="r"><b>' + c.r + '</b>due</li></ul>' +
      '<p class="fc-how">Spaced repetition, the Anki way: cards you know come back in days or months, cards you miss come back in minutes.</p>');
  }

  /* ── the deck list ── */
  if (!scope) {
    asideStats();
    var tot = srsCounts(all);
    var groups = SECS.map(function (x) { return { k: x.k, name: x.name, decks: D.cards.filter(function (t) { return t.sec === x.k; }) }; }).filter(function (g) { return g.decks.length; });
    var row = function (t) {
      var c = srsCounts(pool(String(t.n)));
      return '<div class="fd-row"><a class="fd-name" href="#/cards/' + t.n + '/study"><b>' + h(t.t) + '</b><span>' + t.c.length + ' cards</span></a>' +
        '<span class="fd-n ' + (c.nShow ? 'on' : '') + '">' + c.nShow + '</span><span class="fd-l ' + (c.l ? 'on' : '') + '">' + c.l + '</span><span class="fd-r ' + (c.r ? 'on' : '') + '">' + c.r + '</span>' +
        '<a class="fd-br" href="#/cards/' + t.n + '/browse" title="Browse every card" aria-label="Browse ' + h(t.t) + '"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="13" height="15" rx="2"/><path d="M7.5 3h10a2 2 0 0 1 2 2v12"/></svg></a></div>';
    };
    return free + '<section class="head"><span class="kicker reveal">' + all.length.toLocaleString("en-IN") + ' cards · spaced repetition, the Anki way</span><h1 class="page-h reveal">Flashcards.</h1></section>' +
      '<div class="fd-today reveal"><div><span class="mono">Today</span><b>' + (tot.nShow + tot.l + tot.r) + ' cards waiting</b>' +
        '<p><em class="n">' + tot.nShow + ' new</em> · <em class="l">' + tot.l + ' learning</em> · <em class="r">' + tot.r + ' due</em></p></div>' +
        '<div class="fd-go"><a class="btn key big" href="#/cards/all/study">Study now' + arr() + '</a><a class="btn quiet big" href="#/cards/all/browse">Browse all</a></div></div>' +
      groups.map(function (g) {
        return '<section class="band reveal"><div class="fd-hd"><h2 class="sec-h">' + h(g.name) + '</h2><a class="fd-all" href="#/cards/sec:' + g.k + '/study">Study all ' + secOf(g.k).short + arr() + '</a></div>' +
          '<div class="fd-tb"><div class="fd-row fd-th"><span>Deck</span><span>New</span><span>Learn</span><span>Due</span><span></span></div>' + g.decks.map(row).join("") + '</div></section>';
      }).join("") +
      '<p class="fd-keys reveal"><kbd>Space</kbd> show answer · <kbd>1</kbd> Again <kbd>2</kbd> Hard <kbd>3</kbd> Good <kbd>4</kbd> Easy · <kbd>Z</kbd> undo · in Browse, <kbd>←</kbd> <kbd>→</kbd> flick through</p>' + foot();
  }

  var host = document.createElement("div");
  host.className = "fcx";
  var list = pool(scope);

  /* ── browse: flick through every card with the arrow keys ── */
  if (mode === "browse") {
    var bi = 0, bflip = false, both = false, qx = "";
    var shown = function () { var s = qx.trim().toLowerCase(); return !s ? list : list.filter(function (c) { return (c.q + " " + c.a + " " + c.x).toLowerCase().indexOf(s) >= 0; }); };
    var stateTxt = function (id) { var s = cs(id); if (!s) return "New"; if (s[0] !== 2) return "Learning"; var d = s[1] - srsDay(); return d <= 0 ? "Due now" : "Next in " + d + "d"; };
    var bdraw = function (keepSearch) {
      var L = shown(); if (bi >= L.length) bi = Math.max(0, L.length - 1); var c = L[bi];
      var body = c ? '<div class="fcx-card' + (bflip || both ? ' flip' : '') + '" id="bcard" tabindex="0">' +
          '<div class="fcx-meta"><span>' + h(c.tname) + '</span><span>' + stateTxt(c.id) + '</span></div>' +
          '<p class="fcx-q">' + h(c.q) + '</p><div class="fcx-ans"><p class="fcx-a">' + h(c.a) + '</p>' + (c.x ? '<p class="fcx-x">' + h(c.x) + '</p>' : '') + '</div>' +
          (bflip || both ? '' : '<p class="fcx-tap">Tap or press <kbd>↑</kbd> to show the answer</p>') + '</div>'
        : '<div class="blank"><b>No card matches</b><p>Try another word.</p></div>';
      host.innerHTML = '<div class="fcx-top"><a class="kicker" href="#/cards">&#8592; Decks</a><b>' + h(scopeName(scope)) + '</b><span class="fcx-n">' + (L.length ? bi + 1 : 0) + ' / ' + L.length + '</span></div>' +
        '<div class="fcx-tools"><input id="bq" type="search" placeholder="Search these cards" value="' + h(qx) + '" aria-label="Search cards"><label class="fcx-both"><input type="checkbox" id="both"' + (both ? ' checked' : '') + '> Show answers</label>' +
          '<a class="btn key sm" href="#/cards/' + encodeURIComponent(scope) + '/study">Study these</a></div>' + body +
        '<div class="fcx-nav"><button class="btn quiet" data-b="-1"' + (bi ? '' : ' disabled') + '>&#8592; Prev</button><button class="btn quiet" data-b="f">Flip</button><button class="btn quiet" data-b="1"' + (bi < L.length - 1 ? '' : ' disabled') + '>Next &#8594;</button></div>' +
        '<p class="fd-keys"><kbd>←</kbd> <kbd>→</kbd> previous / next · <kbd>↑</kbd> <kbd>↓</kbd> or <kbd>Space</kbd> flip · <kbd>/</kbd> search</p>';
      var inp = el("#bq", host);
      inp.addEventListener("input", function () { qx = inp.value; bi = 0; bflip = false; bdraw(true); });
      if (keepSearch) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      el("#both", host).addEventListener("change", function (e) { both = e.target.checked; bdraw(); });
      var card = el("#bcard", host); if (card) card.addEventListener("click", function () { bflip = !bflip; bdraw(); });
      swipeNav(card, function (d) { move(d); });
    };
    var move = function (d) { var L = shown(), n = bi + d; if (n < 0 || n >= L.length) return; bi = n; bflip = false; bdraw(); };
    host.addEventListener("click", function (e) { var b = e.target.closest("[data-b]"); if (!b) return; if (b.dataset.b === "f") { bflip = !bflip; bdraw(); } else move(+b.dataset.b); });
    document.addEventListener("keydown", function bk(e) {
      if (!document.body.contains(host)) return document.removeEventListener("keydown", bk);
      if (e.target && e.target.id === "bq") { if (e.key === "Escape" || e.key === "Enter") e.target.blur(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") { e.preventDefault(); move(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
      else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); bflip = !bflip; bdraw(); }
      else if (e.key === "/") { e.preventDefault(); var i2 = el("#bq", host); if (i2) i2.focus(); }
    });
    asideStats(); bdraw();
    return host;
  }

  /* ── study: Anki's queue ── */
  var flip = false, cur = null, undo = [], done = 0;
  function pick() {
    var now = Date.now(), today = srsDay(), d = srsToday(), lim = SRS.newPerDay + (d.extra || 0) - d.n;
    var learnNow = [], rev = [], neu = [], soon = [];
    list.forEach(function (c) { var s = cs(c.id);
      if (!s) { if (neu.length < Math.max(0, lim)) neu.push(c); return; }
      if (s[0] === 2) { if (s[1] <= today) rev.push(c); return; }
      if (s[1] <= now) learnNow.push(c); else if (s[1] <= now + SRS.learnAhead * 6e4) soon.push(c); });
    learnNow.sort(function (a, b) { return cs(a.id)[1] - cs(b.id)[1]; });
    rev.sort(function (a, b) { return cs(a.id)[1] - cs(b.id)[1] || (a.id < b.id ? -1 : 1); });
    if (learnNow.length) return { c: learnNow[0], q: "l" };
    if (rev.length && neu.length) return done % 4 === 3 ? { c: neu[0], q: "n" } : { c: rev[0], q: "r" };   // new cards spread among reviews
    if (rev.length) return { c: rev[0], q: "r" };
    if (neu.length) return { c: neu[0], q: "n" };
    if (soon.length) { soon.sort(function (a, b) { return cs(a.id)[1] - cs(b.id)[1]; }); return { c: soon[0], q: "l" }; }
    return null;
  }
  function grade(g) {
    if (!cur || !flip) return;
    var id = cur.c.id, prev = cs(id), d = srsToday();
    undo.push({ id: id, s: prev ? prev.slice() : null, dn: d.n, dr: d.r });
    ST.cards[id] = srsNext(prev, g);
    if (!prev) d.n++; else d.r++;
    done++; save(); flip = false; draw();
  }
  function back() {
    var u = undo.pop(); if (!u) return;
    if (u.s) ST.cards[u.id] = u.s; else delete ST.cards[u.id];
    var d = srsToday(); d.n = u.dn; d.r = u.dr; done = Math.max(0, done - 1); save();
    cur = { c: list.filter(function (x) { return x.id === u.id; })[0], q: u.s ? (u.s[0] === 2 ? "r" : "l") : "n" }; flip = true; paint();
  }
  function draw() { cur = pick(); paint(); }
  function paint() {
    var c = srsCounts(list);
    asideStats();
    if (!cur) {
      var nextL = list.map(function (x) { return cs(x.id); }).filter(function (s) { return s && s[0] !== 2; }).map(function (s) { return s[1]; }).sort()[0];
      var tomorrow = list.filter(function (x) { var s = cs(x.id); return s && s[0] === 2 && s[1] === srsDay() + 1; }).length;
      host.innerHTML = '<div class="fcx-top"><a class="kicker" href="#/cards">&#8592; Decks</a><b>' + h(scopeName(scope)) + '</b></div>' +
        '<div class="fcx-done"><div class="fcx-ok">✓</div><h2>Congratulations! You have finished this deck for now.</h2>' +
        '<p>' + (done ? done + ' card' + (done === 1 ? '' : 's') + ' this session. ' : '') + (nextL ? 'Learning cards come back at ' + new Date(nextL).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) + '. ' : '') + (tomorrow ? tomorrow + ' review' + (tomorrow === 1 ? '' : 's') + ' due tomorrow.' : '') + '</p>' +
        '<div class="fcx-da">' + (c.n ? '<button class="btn key" id="more">Learn 10 more new cards today</button>' : '') + '<a class="btn quiet" href="#/cards/' + encodeURIComponent(scope) + '/browse">Browse these cards</a><a class="btn quiet" href="#/cards">Back to decks</a></div></div>';
      var mo = el("#more", host); if (mo) mo.addEventListener("click", function () { var d = srsToday(); d.extra = (d.extra || 0) + 10; save(); draw(); });
      return;
    }
    var s = cs(cur.c.id), q = cur.c;
    var G = [["Again", 1, "a"], ["Hard", 2, "h"], ["Good", 3, "g"], ["Easy", 4, "e"]];
    host.innerHTML = '<div class="fcx-top"><a class="kicker" href="#/cards">&#8592; Decks</a><b>' + h(scopeName(scope)) + '</b>' +
        '<span class="fcx-q3"><em class="n' + (cur.q === "n" ? ' cur' : '') + '">' + c.nShow + '</em><em class="l' + (cur.q === "l" ? ' cur' : '') + '">' + c.l + '</em><em class="r' + (cur.q === "r" ? ' cur' : '') + '">' + c.r + '</em></span></div>' +
      '<div class="fcx-card' + (flip ? ' flip' : '') + '" id="scard" tabindex="0">' +
        '<div class="fcx-meta"><span>' + h(q.tname) + '</span><span>' + (s ? (s[0] === 2 ? 'Review · ' + s[2] + 'd' : 'Learning') : 'New') + '</span></div>' +
        '<p class="fcx-q">' + h(q.q) + '</p>' +
        (flip ? '<div class="fcx-ans"><p class="fcx-a">' + h(q.a) + '</p>' + (q.x ? '<p class="fcx-x">' + h(q.x) + '</p>' : '') + '</div>' : '') +
      '</div>' +
      (flip ? '<div class="fcx-g">' + G.map(function (x) { return '<button class="g-' + x[2] + '" data-g="' + x[1] + '"><small>' + srsLabel(s, x[1]) + '</small><b>' + x[0] + '</b><kbd>' + x[1] + '</kbd></button>'; }).join("") + '</div>'
        : '<button class="btn key big fcx-show" data-show>Show answer <kbd>Space</kbd></button>') +
      '<div class="fcx-foot">' + (undo.length ? '<button class="fcx-undo" data-undo>Undo <kbd>Z</kbd></button>' : '<span></span>') + '<a href="#/cards/' + encodeURIComponent(scope) + '/browse">Browse deck</a></div>';
    var card = el("#scard", host);
    if (card && !flip) card.addEventListener("click", function () { flip = true; paint(); });
    if (card && flip) swipeNav(card, function (d) { grade(d > 0 ? 1 : 3); }, true);
  }
  host.addEventListener("click", function (e) {
    var t = e.target.closest("[data-g],[data-show],[data-undo]"); if (!t) return;
    if (t.dataset.g) grade(+t.dataset.g); else if (t.hasAttribute("data-show")) { flip = true; paint(); } else back();
  });
  document.addEventListener("keydown", function sk(e) {
    if (!document.body.contains(host)) return document.removeEventListener("keydown", sk);
    if (e.metaKey && e.key !== "z" || e.altKey || /input|textarea|select/i.test(e.target.tagName || "")) return;
    var k = e.key;
    if ((k === " " || k === "Enter") && cur) { e.preventDefault(); if (!flip) { flip = true; paint(); } else grade(3); }
    else if (/^[1-4]$/.test(k) && flip) { e.preventDefault(); grade(+k); }
    else if (k === "z" || k === "Z") { e.preventDefault(); back(); }
  });
  draw();
  return host;
};
/* a horizontal swipe on touch: in Browse it moves between cards; in Study (after the flip)
   right is Good and left is Again, the way flashcard apps teach the thumb */
function swipeNav(elm, cb, study) {
  if (!elm) return;
  var x0 = null, y0 = 0;
  elm.addEventListener("touchstart", function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
  elm.addEventListener("touchend", function (e) {
    if (x0 == null) return; var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) cb(study ? (dx > 0 ? -1 : 1) : (dx < 0 ? 1 : -1));
  }, { passive: true });
}


/* ── account ── */
var gateMode = "fb";
/* Google / phone sign-in: config comes from /api/auth (null when switched off) */
var FBCFG, FBJS = null, FBID = null;
function fbConfig() {
  if (FBCFG !== undefined) return Promise.resolve(FBCFG);
  return fetch("/api/auth").then(function (r) { return r.json(); })
    .then(function (j) { FBCFG = j.firebase || null; return FBCFG; })
    .catch(function () { FBCFG = null; return null; });
}
function fireAuth() {
  FBJS = FBJS || loadScript("js/fireauth.js?v=" + DATAV).then(function () { return window.FireAuth.init(FBCFG); })
    .catch(function (e) { FBJS = null; throw e.message ? e : new Error("Could not load sign-in. Check your connection."); });
  return FBJS;
}
/* reCAPTCHA for SMS needs an element that survives repaints */
function rcHost() {
  var r = document.getElementById("fb-rc");
  if (!r) { r = document.createElement("div"); r.id = "fb-rc"; document.body.appendChild(r); }
  return r;
}
var GLOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

function phoneFields(pre) {
  return '<div class="ph-step" data-step="num">' +
      '<div class="field"><label for="' + pre + 'ph">Mobile number</label>' +
        '<div class="ph-in"><span>+91</span><input id="' + pre + 'ph" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="98765 43210"></div></div>' +
      '<button class="btn quiet go" id="' + pre + 'phgo">Send code' + arr() + '</button></div>' +
    '<div class="ph-step" data-step="code" hidden>' +
      '<div class="field"><label for="' + pre + 'otp">Code sent to <b class="ph-to"></b></label>' +
        '<input id="' + pre + 'otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" class="otp"></div>' +
      '<button class="btn key go" id="' + pre + 'otpgo">Verify' + arr() + '</button>' +
      '<p class="ph-alt"><button type="button" class="ph-back">Change number</button><button type="button" class="ph-resend" disabled>Resend in <span>30</span>s</button></p></div>';
}

V["account"] = function () {
  if (AU) {
    var t = totals(), M = AU.methods || {}, P = ST.profile || {}, prem = isPremium(), adm = isAdmin();
    var until = AU.ent && AU.ent.until ? new Date(AU.ent.until) : null;
    var left = until ? Math.max(0, Math.ceil((until - new Date()) / 864e5)) : 0;
    var via = M.google ? "Google" : M.phone ? "phone" : "name and PIN";
    var initial = h(String(AU.name || "?").trim().charAt(0).toUpperCase());
    var ICO = {
      phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
      pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>'
    };
    function row(icon, label, val, act) {
      return '<div class="mrow"><span class="mi">' + icon + '</span><div><b>' + label + '</b><span>' + (val ? h(val) : 'Not connected') + '</span></div>' + act + '</div>';
    }
    function link(href, title, sub, ext) {
      return '<a class="ac-link" href="' + href + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '><span><b>' + title + '</b><small>' + sub + '</small></span>' + arr() + '</a>';
    }
    var th = document.documentElement.getAttribute("data-theme") || "auto", rs = readScale();
    var tl = trialLeft();
    var planCard = onTrial()
      ? '<div class="ac-card ac-plan on"><span class="ac-k">Your plan</span><b>Free trial, full access</b>' +
          '<p>Everything is open: all 63 topics, every past question and every mock. ' + tl + ' day' + (tl === 1 ? '' : 's') + ' left, then ' + (FREE().topics.length || 8) + ' topics and ' + (FREE().papers.length || 2) + ' mocks stay free.</p>' +
          '<div class="ac-meter"><i style="transform:scaleX(' + Math.min(1, tl / trialDays()).toFixed(3) + ')"></i></div><small>' + tl + ' of ' + trialDays() + ' days left</small>' +
          '<a class="btn key sm" href="#/premium">Get the ' + passName() + ', ₹' + passRupees() + arr() + '</a></div>'
      : prem
      ? '<div class="ac-card ac-plan on"><span class="ac-k">Your plan</span><b>' + (adm ? 'Owner' : 'Exam Pass') + '</b>' +
          '<p>' + (adm ? 'Admin accounts never expire.' : 'Everything is unlocked until ' + h(until.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })) + '.') + '</p>' +
          (adm ? '' : '<div class="ac-meter"><i style="transform:scaleX(' + Math.min(1, left / planDays()).toFixed(3) + ')"></i></div><small>' + left + ' day' + (left === 1 ? '' : 's') + ' left</small>') +
          '<a class="btn quiet sm" href="#/premium">' + (adm ? 'Premium page' : 'Add ' + planDays() + ' more days') + arr() + '</a></div>'
      : '<div class="ac-card ac-plan"><span class="ac-k">Your plan</span><b>' + (trialOver() ? 'Free trial ended' : 'Free') + '</b>' +
          '<p>' + (FREE().topics.length || 8) + ' topics and ' + (FREE().papers.length || 2) + ' mocks stay open. The Exam Pass opens all 63 topics, every past question and every mock for ' + planDays() + ' days.</p>' +
          '<a class="btn key sm" href="#/premium">Get the ' + passName() + ', ₹' + passRupees() + arr() + '</a></div>';
    var examCard = P.exam
      ? '<div class="ac-card"><span class="ac-k">Your exam</span><b>' + h(examLabel({ day: "numeric", month: "long" })) + '</b>' +
          '<p>' + (P.shift ? 'Shift ' + h(P.shift) + ' · ' : '') + (P.hours || 6) + ' hours a day · ' + days() + ' day' + (days() === 1 ? '' : 's') + ' to go</p>' +
          '<a class="btn quiet sm" href="#/welcome">Change date or hours' + arr() + '</a></div>'
      : '<div class="ac-card"><span class="ac-k">Your exam</span><b>Not set</b><p>Tell us your shift date and hours, and the plan builds every day to it.</p>' +
          '<a class="btn key sm" href="#/welcome">Set my exam date' + arr() + '</a></div>';
    var progCard = '<div class="ac-card"><span class="ac-k">Your progress</span><b>' + t.done.toLocaleString("en-IN") + ' <small>questions</small></b>' +
      '<p>' + (t.done ? t.acc + '% accuracy · ' : 'Nothing answered yet · ') + cardPct() + '% of cards locked in</p>' +
      '<a class="btn quiet sm" href="#/progress">See progress' + arr() + '</a></div>';
    return '<section class="ac-hero reveal">' +
        '<span class="ac-av" aria-hidden="true">' + initial + '</span>' +
        '<div><span class="kicker">Account</span><h1 class="ac-name">' + h(AU.name) + '</h1>' +
        '<p class="ac-sub">Signed in with ' + via + '. Your answers, cards and ticked tasks are saved here and follow you to any device.</p></div>' +
        '<span class="ac-badge' + (prem ? ' on' : '') + '">' + (adm ? 'Owner' : onTrial() ? 'Trial · ' + tl + 'd left' : prem ? 'Exam Pass' : 'Free') + '</span>' +
      '</section>' +
      '<div class="ac-grid reveal">' + planCard + examCard + progCard + '</div>' +
      (adm ? '' : '<section class="band reveal">' + inviteHTML() + '</section>') +
      '<section class="band reveal"><h2 class="sec-h">Ways to sign in</h2>' +
        '<p class="ac-note">Connect Google or your phone to sign in on any device without a PIN.</p>' +
        '<div class="methods" id="methods">' +
          '<div id="err" aria-live="polite"></div>' +
          row(GLOGO, "Google", M.google, M.google ? '<span class="mok">Connected</span>' : '<button class="btn quiet sm" id="lkg">Connect</button>') +
          row(ICO.phone, "Phone", M.phone, M.phone ? '<span class="mok">Connected</span>' : '<button class="btn quiet sm" id="lkp">Connect</button>') +
          '<div class="lkp-form" hidden>' + phoneFields("lk") + '</div>' +
          (M.pin ? row(ICO.pin, "Name and PIN", AU.name, '<span class="mok">On</span>') : '') +
        '</div>' +
      '</section>' +
      '<section class="band reveal"><h2 class="sec-h">Preferences</h2>' +
        '<div class="ac-prefs">' +
          '<div class="ac-pref"><div><b>Appearance</b><small>Auto follows your device.</small></div>' +
            '<div class="ac-seg" role="radiogroup" aria-label="Appearance">' + [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(function (x) {
              return '<button role="radio" data-th="' + x[0] + '" aria-checked="' + (th === x[0]) + '">' + x[1] + '</button>'; }).join("") + '</div></div>' +
          '<div class="ac-pref"><div><b>Reading size</b><small>Notes and questions.</small></div>' +
            '<div class="ac-seg" role="group" aria-label="Reading size"><button data-acrs="-1" aria-label="Smaller text">A−</button><span id="rsv">' + Math.round(rs * 100) + '%</span><button data-acrs="1" aria-label="Larger text">A+</button></div></div>' +
        '</div>' +
      '</section>' +
      '<section class="band reveal"><h2 class="sec-h">Help and privacy</h2>' +
        '<div class="ac-links">' +
          link("mailto:" + SITE.email + "?subject=" + encodeURIComponent("Help with my account (" + AU.name + ")"), "Contact support", SITE.email + ", we reply within two working days", true) +
          link("/refunds", "Refunds", "Premium did not unlock, or you were charged twice") +
          link("/privacy", "Privacy", "What we store and why") +
          link("mailto:" + SITE.email + "?subject=" + encodeURIComponent("Delete my account (" + AU.name + ")") + "&body=" + encodeURIComponent("Please delete my CGL Compass account " + AU.name + " and its progress."), "Delete my account", "We delete the account and its progress on request", true) +
        '</div>' +
      '</section>' +
      '<div class="ac-out reveal"><button class="btn quiet" id="out">Sign out of this device' + arr() + '</button></div>' + foot();
  }
  if (FBCFG === null && gateMode === "fb") gateMode = "in";
  var fb = gateMode === "fb", mk = gateMode === "in";
  var form;
  if (fb) {
    form =
      '<span class="kicker">' + h(SITE.brand) + '</span>' +
      '<h1>Sign in or start free.</h1>' +
      '<p class="sub">New here? The same buttons create your account. Then tell us your exam date and we build the days.</p>' +
      '<div id="err" aria-live="polite"></div>' +
      '<button class="btn gbtn" id="gg"' + (FBCFG ? '' : ' disabled') + '>' + GLOGO + '<span>Continue with Google</span></button>' +
      '<div class="g2-or"><span>or with your phone</span></div>' +
      '<div class="fb-ph">' + phoneFields("") + '</div>' +
      '<div class="ph-step nm-step" hidden><div class="field"><label for="fnm">Your name</label>' +
        '<input id="fnm" type="text" autocomplete="name" maxlength="40" autocapitalize="words" placeholder="Aaron"></div>' +
        '<button class="btn key go" id="fnmgo">Create account' + arr() + '</button></div>' +
      '<p class="fine">Have a name and PIN account? <button type="button" data-gm="in">Sign in with PIN</button><br>' +
        'By continuing you accept the <a href="#/legal/terms">terms</a> and <a href="#/legal/privacy">privacy policy</a>.</p>';
  } else {
    form =
      '<span class="kicker">' + h(SITE.brand) + '</span>' +
      '<h1>' + (mk ? "Sign in with your PIN." : "Start your plan.") + '</h1>' +
      '<p class="sub">' + (mk
        ? "For accounts made with a name and a PIN."
        : "A name and a 4 to 8 digit PIN. Then tell us your exam date and we build the days.") + '</p>' +
      (FBCFG ? '' : '<div class="g2-seg" role="tablist" aria-label="Account">' +
        '<button role="tab" data-gm="in" aria-selected="' + mk + '">Sign in</button>' +
        '<button role="tab" data-gm="up" aria-selected="' + !mk + '">Create account</button>' +
        '<i aria-hidden="true"></i></div>') +
      '<div id="err" aria-live="polite"></div>' +
      '<div class="field"><label for="nm">Name</label>' +
        '<input id="nm" type="text" autocomplete="username" placeholder="Aaron" maxlength="40" autocapitalize="words" spellcheck="false"></div>' +
      '<div class="field"><label for="pn">PIN</label>' +
        '<input id="pn" type="password" inputmode="numeric" pattern="[0-9]*" placeholder="••••" maxlength="8" autocomplete="' + (mk ? "current-password" : "new-password") + '"></div>' +
      '<button class="btn key go" id="gogo">' + (mk ? "Sign in" : "Create account") + arr() + '</button>' +
      '<p class="fine">' + (FBCFG ? '<button type="button" data-gm="fb">Use Google or phone instead</button><br>' : 'Use a PIN you do not use anywhere else. ') +
        '<a href="#/legal/privacy">Privacy</a></p>';
  }
  return '<div class="gate2"><div class="g2-form">' + form + '</div>' + compassStage() + '</div>';
};

/* ══════════ the compass: a 3D needle that points at your countdown ══════════
   The dial has 60 ticks, one per day; the needle stands on the number of days
   left, and on north when the exam is today. The WebGL bundle (React Three
   Fiber, ~340 KB gzipped) loads only on the two pages that show it, and a
   drawn SVG compass stands in until it is ready, or for good without WebGL. */
function compassAngle() { return Math.min(days(), 59) / 60 * Math.PI * 2; }
function isDark() {
  var t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
}
function compassStage(small) {
  var d = days(), deg = Math.min(d, 59) * 6, ticks = "";
  for (var i = 0; i < 60; i++) {
    var q = i % 15 === 0, m = i % 5 === 0;
    ticks += '<line x1="100" y1="' + (q ? 22 : m ? 24 : 26) + '" x2="100" y2="31" transform="rotate(' + i * 6 + ' 100 100)" class="' + (q ? "tq" : m ? "tm" : "tn") + '"/>';
  }
  return '<aside class="g2-stage on-navy' + (small ? ' small' : '') + '" data-compass>' +
    '<div class="g2-art" aria-hidden="true"><svg viewBox="0 0 200 200" class="g2-svg">' +
      '<circle cx="100" cy="100" r="86" class="bz"/><circle cx="100" cy="100" r="80" class="fc"/>' + ticks +
      '<g transform="rotate(' + deg + ' 100 100)"><path d="M100 36 107 100h-14z" class="nn"/><path d="M100 164 107 100h-14z" class="ns"/></g>' +
      '<circle cx="100" cy="100" r="5" class="hub"/></svg>' +
      '<div class="g2-gl"></div></div>' +
    '<div class="g2-cap"><b>' + d + '</b><span>day' + (d === 1 ? '' : 's') + ' to ' + h(examLabel({ day: "numeric", month: "long" })) + '.' +
      (small ? ' The needle is your countdown.' : ' Each tick on the dial is one day; the needle walks to north as your exam arrives.') + '</span></div>' +
    '</aside>';
}
var HERO = null, HERO_JS = null;
function hasGL() {
  try { var c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}
function loadScript(src) {
  return new Promise(function (ok, no) {
    var s = document.createElement("script"); s.src = src; s.async = true;
    s.onload = ok; s.onerror = no; document.head.appendChild(s);
  });
}
function compassOK() {
  var c = navigator.connection || {};
  if (c.saveData || /(^|\b)(slow-2g|2g|3g)\b/.test(c.effectiveType || "")) return false;
  if (navigator.webdriver || matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  // phones keep the drawn compass: a live WebGL scene costs battery and main-thread time there
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
  // phones get the light particle compass on the landing only; the heavier model stays desktop-only
  if (matchMedia("(max-width: 700px)").matches && !el("[data-compass].lp-pc")) return false;
  return true;
}
function mountCompass() {
  if (HERO && !document.body.contains(HERO.el)) { try { HERO.h.unmount(); } catch (e) {} HERO = null; }
  var st = el("[data-compass]");
  if (!st || HERO || !hasGL() || !compassOK()) return;
  // the drawn compass is already on screen; the 1.2 MB scene arrives after the page is idle
  var start = function () { (window.requestIdleCallback || function (f) { setTimeout(f, 700); })(mountCompassNow, { timeout: 3000 }); };
  if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
}
function mountCompassNow() {
  var st = el("[data-compass]");
  if (!st || HERO) return;
  HERO_JS = HERO_JS || loadScript("js/compass3d.js?v=" + DATAV);
  HERO_JS.then(function () {
    if (!document.body.contains(st) || HERO || !window.CompassHero) return;
    var PC = st.classList.contains("lp-pc") && window.ParticleHero;
    HERO = { el: st, h: PC ? window.ParticleHero.mount(st.querySelector(".g2-gl"), { angle: compassAngle(), dark: isDark(), center: true })
      : window.CompassHero.mount(st.querySelector(".g2-gl"), { angle: compassAngle(), dark: isDark() || (st.classList.contains("on-navy") && document.documentElement.dataset.brand === "midnight") }) };
    // the canvas needs a frame or two to draw; swap once it has
    setTimeout(function () { st.classList.add("live"); }, 280);
  }).catch(function () { HERO_JS = null; });
}
window.addEventListener("cgl-theme", function () { var ob = el(".orb-3d"); if (ob && ob.__o) ob.__o.set({ dark: isDark() }); var b = el(".ns-3d.live"); if (b && window.NotesStack && b.__ns) b.__ns.set({ dark: isDark() }); if (HERO) HERO.h.set({ dark: isDark() || (!HERO.el.classList.contains("lp-pc") && HERO.el.classList.contains("on-navy") && document.documentElement.dataset.brand === "midnight") }); });

/* a short staggered arrival for the sign-in form: Motion runs it, CSS holds the end state */
function enter(sel) {
  if (!window.Motion || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var list = els(sel);
  if (!list.length) return;
  window.Motion.animate(list, { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0)"] },
    { delay: window.Motion.stagger(0.045), duration: 0.5, ease: [0.23, 1, 0.32, 1] });
}

/* A topic's fact bank runs to 250 lines, too many for one list. Lines are
   written "Sub-area: fact"; when prefixes repeat they become collapsible
   groups, and when every prefix is unique (a vocabulary list) the bank
   becomes a two-column glossary. Either way a filter box narrows it. */
function factKey(x) { return String(x).toLowerCase().replace(/\barticles?\b|\barts?\b\.?/g, "art").replace(/\s+/g, " "); }
function factsHTML(F) {
  var rows = F.map(function (x) {
    var i = x.indexOf(": ");
    return i > 0 && i <= 48 ? { k: x.slice(0, i), v: x.slice(i + 2) } : { k: "", v: x };
  });
  var cnt = {}; rows.forEach(function (r) { if (r.k) cnt[r.k] = (cnt[r.k] || 0) + 1; });
  var repeated = rows.filter(function (r) { return r.k && cnt[r.k] > 1; }).length;
  var gloss = repeated < rows.length * 0.3 && rows.filter(function (r) { return r.k; }).length > rows.length * 0.7;
  var body;
  if (gloss) {
    body = '<dl class="fgl">' + rows.map(function (r) {
      return '<div class="fr" data-q="' + h(factKey(r.k + " " + r.v)) + '"><dt>' + h(r.k) + '</dt><dd>' + h(r.v) + '</dd></div>'; }).join("") + '</dl>';
  } else {
    var order = [], g = {};
    rows.forEach(function (r) { var k = r.k && cnt[r.k] > 1 ? r.k : "More facts"; if (!g[k]) { g[k] = []; order.push(k); } g[k].push(r.k && cnt[r.k] > 1 ? r.v : (r.k ? r.k + ": " + r.v : r.v)); });
    if (order.indexOf("More facts") > -1) order = order.filter(function (k) { return k !== "More facts"; }).concat(["More facts"]);
    body = '<div class="fgs">' + order.map(function (k, i) {
      return '<details class="fg"' + (i < 2 ? ' open' : '') + '><summary><span>' + h(k) + '</span><em>' + g[k].length + '</em></summary><ul class="pts">' +
        g[k].map(function (x) { return '<li class="fr" data-q="' + h(factKey(k + " " + x)) + '">' + h(x) + '</li>'; }).join("") + '</ul></details>'; }).join("") + '</div>';
  }
  return '<div class="factbank reveal"><div class="fb-h"><h3>' + (gloss ? "Word bank" : "Fact bank") + ' <small>' + F.length + '</small></h3>' +
    '<input type="search" class="fb-q" placeholder="Filter ' + F.length + (gloss ? ' words' : ' facts') + '" aria-label="Filter"></div>' + body +
    '<p class="fb-none" hidden>Nothing matches.</p></div>';
}
function wireFacts() {
  els(".factbank").forEach(function (fb) {
    var q = fb.querySelector(".fb-q"), none = fb.querySelector(".fb-none");
    if (!q) return;
    q.addEventListener("input", function () {
      var t = factKey(q.value.trim()), shown = 0;
      els(".fr", fb).forEach(function (r) { var on = !t || r.dataset.q.indexOf(t) > -1; r.hidden = !on; if (on) shown++; });
      els("details.fg", fb).forEach(function (d) {
        var any = els(".fr", d).some(function (r) { return !r.hidden; });
        d.hidden = !any; if (t && any) d.open = true;
      });
      none.hidden = shown > 0;
    });
  });
}

/* ══════════ front page motion ══════════
   Each piece has a reason: the nav pill shows where the pointer is, the
   headline arrives once, the sample plan ticks itself off to show what the
   product does, and the mock clock runs because a mock is a clock. Nothing
   loops forever and all of it settles to its final state under reduced motion. */
var BOT = /bot|crawl|spider|slurp|inspectiontool|lighthouse|headless|preview/i.test(navigator.userAgent || "");
/* landing: a pinned scene that shows what a note page looks like, one feature per scroll step.
   The lines are real (Polity, Fundamental Rights; History, Era 3) with their real exam years. */
function notesShowHTML() {
  var STEPS = [
    ["Complete notes, one clean flow", "Every topic reads as one story: tables, timelines and short points, with the textbook detail folded in, not bolted on."],
    ["Lines SSC asked, marked with the year", "Every line asked in a real Tier 1 shift from 2021 to 2025 is highlighted, with the years it came."],
    ["Must-read blocks first", "The blocks that carry the most asked facts are flagged, so even a short day covers what matters."],
    ["Only what SSC asked, in one tap", "Switch on the exam lens and the page shrinks to the asked lines: a ten-minute revision of a whole topic."],
    ["Names linked, dates that never confuse", "Chains link each ruler to the minister, the book and the place, and every early date carries BCE or CE."]
  ];
  function ln(t, yrs) { return '<li' + (yrs ? ' class="hot"' : '') + '><span>' + h(t) + (yrs ? ' <em class="pyq">Asked ' + yrs + '</em>' : '') + '</span></li>'; }
  return '<section class="lp-notes" id="notes-show" aria-label="What the notes look like">' +
    '<div class="ns-pin">' +
      '<div class="ns-text">' +
        '<span class="kicker">The notes</span>' +
        '<h2 class="lp-h2">Notes that show you what SSC asks.</h2>' +
        '<ol class="ns-steps">' + STEPS.map(function (x, i) {
          return '<li data-ns="' + i + '"' + (i ? '' : ' class="on"') + '><span class="st-n">0' + (i + 1) + '</span><div><h3>' + h(x[0]) + '</h3><p>' + h(x[1]) + '</p></div></li>'; }).join("") + '</ol>' +
      '</div>' +
      '<div class="ns-stage" data-k="0">' +
        '<div class="ns-3d" aria-hidden="true"></div>' +
        '<article class="ns-sheet" aria-hidden="true">' +
          '<header><span class="ns-ch">Polity · Chapter 4 <em class="yl yl-high">Asked often</em></span><b>Fundamental Rights (Part III, Articles 12-35)</b>' +
            '<span class="ns-lens"><i></i>Only what SSC asked</span></header>' +
          '<ul class="ns-lines">' +
            ln("Part III (Arts 12-35) can be enforced in court: the Magna Carta of India.", "’22 ’23") +
            ln("Art 12: 'State' covers the Government, Parliament, the States and local authorities.") +
            ln("Part III has 6 groups of rights; the 44th Amendment (1978) removed property.", "’23") +
            ln("Art 13: a law that clashes with a right is void; only the invalid part goes.") +
            ln("Property is now a legal right under Art 300A.", "’22 ’23 ’25") +
          '</ul>' +
          '<div class="ns-must"><span class="mr">Must read</span><b>Equality, Arts 14 to 18</b>' +
            '<div class="ns-tab">' +
              '<div class="hot"><b>14</b><span>Equality before law <em class="pyq">Asked ’25</em></span></div>' +
              '<div class="hot"><b>15</b><span>No discrimination by religion, caste or sex <em class="pyq">Asked ’22</em></span></div>' +
              '<div><b>16</b><span>Equal chance in public jobs</span></div>' +
              '<div><b>17</b><span>Untouchability abolished</span></div>' +
            '</div></div>' +
        '</article>' +
        '<article class="ns-card2" aria-hidden="true">' +
          '<span class="ns-ch">History · Era 3 · 185 BCE to 647 CE</span>' +
          '<ol class="ns-tl">' +
            '<li><div class="ns-y"><b>c. 185</b><small>BCE</small></div><p>Pushyamitra Shunga founds the Shunga line. <em class="pyq">Asked ’22 ’24</em></p></li>' +
            '<li><div class="ns-y"><b>78</b><small>CE</small></div><p>Shaka era begins; Kanishka holds the Fourth Buddhist Council. <em class="pyq">Asked ’21 ’23</em></p></li>' +
          '</ol>' +
          '<div class="ns-chain"><span>Chandragupta Maurya</span><i></i><span>Kautilya</span><i></i><span>Arthashastra</span></div>' +
        '</article>' +
      '</div>' +
    '</div>' +
  '</section>';
}
function wireLanding() {
  var lp = el(".lp");
  if (!lp) return;
  var M = window.Motion, still = BOT || matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ease = [0.23, 1, 0.32, 1];

  // mouse and trackpad scrolling glides on the landing page; touch keeps the phone's own scrolling
  if (window.Lenis && !still && matchMedia("(pointer: fine)").matches && !window.__lenis) {
    var LN = window.__lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.95 });
    (function raf(t) { if (window.__lenis !== LN) return; LN.raf(t); requestAnimationFrame(raf); })(performance.now());
  }

  // headline: three lines rise out of a light blur, once per visit
  var lines = els(".lp-h > span", lp);
  if (M && !still && !wireLanding.seen) {
    M.animate(lines, { opacity: [0, 1], transform: ["translateY(18px)", "translateY(0)"], filter: ["blur(8px)", "blur(0px)"] },
      { delay: M.stagger(0.08), duration: 0.7, ease: ease });
    M.animate(els(".lp-lede,.lp-cta,.lp-fine", lp), { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0)"] },
      { delay: M.stagger(0.06, { startDelay: 0.28 }), duration: 0.6, ease: ease });
  }
  wireLanding.seen = true;


  wireTopicRows(lp);

  // ── the nav mark: its needle spins in once, then quietly points at the cursor
  var nd = el(".pubnav .nd"), ndA = 45, ndT = 45, ndRun = false;
  if (nd && !still && matchMedia("(pointer: fine)").matches) {
    var logo = el(".pubnav .pn-b b");
    var ndTick = function () {
      ndA += (ndT - ndA) * 0.14;
      nd.setAttribute("transform", "rotate(" + ndA.toFixed(2) + " 32 32)");
      if (Math.abs(ndT - ndA) > 0.05) requestAnimationFrame(ndTick); else ndRun = false;
    };
    var ndGo = function () { if (!ndRun) { ndRun = true; requestAnimationFrame(ndTick); } };
    if (!wireLanding.spun) { wireLanding.spun = true; ndA = 45 - 720; ndGo(); }
    var onMove = function (e) {
      if (!document.body.contains(nd)) return document.removeEventListener("pointermove", onMove);
      var r = logo.getBoundingClientRect(), a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
      while (a - ndA > 180) a -= 360; while (a - ndA < -180) a += 360;
      ndT = a; ndGo();
    };
    document.addEventListener("pointermove", onMove, { passive: true });
  }

  // ── cards: a soft light follows the cursor and the card leans a few degrees toward it
  if (!still && matchMedia("(pointer: fine)").matches) {
    els(".ns-steps li", lp).forEach(function (c) {
      c.classList.add("tilt");
      c.addEventListener("pointermove", function (e) {
        var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        c.style.setProperty("--mx", (x * 100).toFixed(1) + "%"); c.style.setProperty("--my", (y * 100).toFixed(1) + "%");
        c.style.setProperty("--rx", ((0.5 - y) * 5).toFixed(2) + "deg"); c.style.setProperty("--ry", ((x - 0.5) * 6).toFixed(2) + "deg");
      });
      c.addEventListener("pointerleave", function () { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); });
    });
    // main buttons lean toward the pointer
    els(".lp-cta .btn, .lp-fbtn, .lp-tiers .btn", lp).forEach(function (b) {
      b.classList.add("mag");
      b.addEventListener("pointermove", function (e) { var r = b.getBoundingClientRect(); b.style.transform = "translate(" + ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + "px," + ((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1) + "px)"; });
      b.addEventListener("pointerleave", function () { b.style.transform = ""; });
    });
    // the hero follows the cursor with a soft spotlight
    var hero0 = el(".lp-hero", lp);
    if (hero0) hero0.addEventListener("pointermove", function (e) { var r = hero0.getBoundingClientRect(); hero0.style.setProperty("--hx", (e.clientX - r.left) + "px"); hero0.style.setProperty("--hy", (e.clientY - r.top) + "px"); });
  }

  // ── the finale: the compass needle points wherever the reader points
  var fin = el(".lp-fin", lp), fnd = el(".fin-nd", lp);
  if (fin && fnd && !still) {
    var fa = 0, ft = 0, frun = false;
    var fTick = function () { fa += (ft - fa) * 0.12; fnd.setAttribute("transform", "rotate(" + fa.toFixed(2) + " 100 100)"); if (Math.abs(ft - fa) > 0.05) requestAnimationFrame(fTick); else frun = false; };
    fin.addEventListener("pointermove", function (e) {
      var svg = el(".fin-cmp", fin).getBoundingClientRect(), a = Math.atan2(e.clientX - (svg.left + svg.width / 2), -(e.clientY - (svg.top + svg.height / 2))) * 180 / Math.PI;
      while (a - fa > 180) a -= 360; while (a - fa < -180) a += 360;
      ft = a; if (!frun) { frun = true; requestAnimationFrame(fTick); }
    });
  }

  // ── a thin line at the top shows how far down the page you are
  if (M && M.scroll && !still) {
    var bar = el(".lp-prog") || (function () { var b = document.createElement("div"); b.className = "lp-prog"; lp.appendChild(b); return b; })();
    M.scroll(function (p) { bar.style.transform = "scaleX(" + p.toFixed(4) + ")"; });
  }

  // without scroll motion the notes scene is a plain, unpinned picture of the finished page
  var nsx = el("#notes-show", lp), flat = matchMedia("(max-width: 860px)").matches;
  if (nsx && (!M || !M.scroll || still || flat)) { nsx.classList.add("ns-static"); if (flat) nsx.classList.add("ns-flat"); el(".ns-stage", nsx).dataset.k = "2"; }
  // phones: the story's four scenes sit under their own step, in reading order, with nothing pinned
  var stx = el("#story", lp);
  if (stx && flat) {
    stx.classList.add("st-flat");
    var vv = els(".st-v", stx);
    els(".st-steps li", stx).forEach(function (li, i) { li.classList.add("on"); if (vv[i]) { vv[i].classList.add("on"); li.appendChild(vv[i]); } });
  }

  // scroll-linked motion; reduced motion keeps the static layout
  if (M && !still) (function () {

  // hero: as it scrolls away the copy lifts and fades, and the needle swings to north
  var hero = el(".lp-hero", lp), ht = el(".lp-ht", lp), a0 = compassAngle(), lastA = -1;
  var stage = matchMedia("(min-width: 961px)").matches ? el(".lp-hero .g2-stage", lp) : null, lg = el(".pubnav .pn-b b");
  if (hero && M.scroll) M.scroll(function (p) {
    ht.style.transform = "translateY(" + (p * -60) + "px)"; ht.style.opacity = String(Math.max(0, 1 - p * 1.6));
    // the compass flies up into the nav logo as the hero leaves
    if (stage && lg) {
      var e = Math.min(1, Math.max(0, (p - 0.22) / 0.6)); e = e * e * (3 - 2 * e);
      var sr = stage.getBoundingClientRect(), lr = lg.getBoundingClientRect(), bx = sr.left + sr.width / 2 - (stage.__tx || 0), by = sr.top + sr.height / 2 - (stage.__ty || 0);
      var bw = sr.width / (stage.__sc || 1), tx = (lr.left + lr.width / 2 - bx) * e, ty = (lr.top + lr.height / 2 - by) * e, sc = 1 - e * (1 - lr.width * 1.6 / bw);
      stage.__tx = tx; stage.__ty = ty; stage.__sc = sc;
      stage.style.transform = "translate(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px) scale(" + sc.toFixed(4) + ")";
      stage.style.opacity = String(e < 0.8 ? 1 : Math.max(0, 1 - (e - 0.8) * 5));
      var landed = e > 0.92;
      if (landed !== !!lg.__landed) { lg.__landed = landed; lg.classList.toggle("land", landed); }
    }
    var a = a0 * (1 - Math.min(1, p * 1.4));
    if (HERO && Math.abs(a - lastA) > 0.01) { lastA = a; HERO.h.set({ angle: a }); }
  }, { target: hero, offset: ["start start", "end start"] });

  // manifesto: words light up as you read down the page
  var mf = el("[data-words]", lp);
  if (mf && M.scroll) {
    mf.innerHTML = mf.textContent.split(/\s+/).map(function (w) { return '<span>' + h(w) + '</span>'; }).join(" ");
    var ws = els("span", mf), n = ws.length;
    M.scroll(function (p) {
      var k = p * (n + 6);
      for (var i = 0; i < n; i++) ws[i].style.opacity = String(Math.max(0.14, Math.min(1, k - i)));
    }, { target: mf, offset: ["start 0.85", "end 0.45"] });
  }

  // the notes scene: one feature per step, and the 3D page stack behind it on capable desktops
  var ns = el("#notes-show", lp);
  if (ns && M.scroll && !ns.classList.contains("ns-static")) {
    var stg = el(".ns-stage", ns), nsteps = els(".ns-steps li", ns), nk = -1, NS3 = null;
    M.scroll(function (p) {
      var k = Math.max(0, Math.min(4, Math.floor(p * 5.2)));
      if (NS3) NS3.set({ p: p, k: k });
      stg.style.setProperty("--p", p.toFixed(3));
      if (k === nk) return; nk = k;
      stg.dataset.k = k;
      nsteps.forEach(function (li, i) { li.classList.toggle("on", i === k); li.classList.toggle("past", i < k); });
      if (k === 1) M.animate(els(".ns-sheet .pyq", stg), { transform: ["scale(.6)", "scale(1)"], opacity: [0, 1] }, { delay: M.stagger(0.07, { startDelay: 0.25 }), type: "spring", bounce: 0.35, duration: 0.5 });
      if (k === 4) M.animate(els(".ns-chain > *", stg), { opacity: [0, 1], transform: ["translateX(-8px)", "translateX(0)"] }, { delay: M.stagger(0.06, { startDelay: 0.2 }), duration: 0.35, ease: ease });
    }, { target: ns, offset: ["start start", "end end"] });
    var box = el(".ns-3d", ns);
    if (box && hasGL() && matchMedia("(min-width: 1024px)").matches && !(navigator.connection && navigator.connection.saveData)) {
      var gone = false, go = function () {
        if (gone) return; gone = true;
        HERO_JS = HERO_JS || loadScript("js/compass3d.js?v=" + DATAV);
        HERO_JS.then(function () { if (!window.NotesStack || !document.body.contains(box)) return; NS3 = box.__ns = window.NotesStack.mount(box, { dark: isDark() }); box.classList.add("live"); }).catch(function () {});
      };
      if (M.inView) M.inView(ns, function () { go(); }, { margin: "0px 0px 400px 0px" }); else go();
    }
  }

  // the story: a pinned stage whose four scenes change with scroll
  var st = el("#story", lp);
  if (st && M.scroll && !st.classList.contains("st-flat")) {
    var vs = els(".st-v", st), ss = els(".st-steps li", st), rail = el(".st-rail i", st), cur = 0, done = {};
    function scene(k) {
      var e = { type: "spring", bounce: 0, duration: 0.55 };
      vs.forEach(function (v, i) {
        if (i === k) { v.classList.add("on"); M.animate(v, { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0px)" }, e); }
        else if (v.classList.contains("on") || i !== k) { v.classList.remove("on"); M.animate(v, { opacity: 0, transform: "translateY(" + (i < k ? -28 : 28) + "px) scale(.96)", filter: "blur(6px)" }, e); }
      });
      ss.forEach(function (li, i) { li.classList.toggle("on", i === k); li.classList.toggle("past", i < k); });
      if (done[k]) return; done[k] = 1;
      var v = vs[k];
      if (k === 1) {   // the plan ticks itself off
        var items = els("li", v), bar = el(".lp-dbar span", v);
        items.forEach(function (li) { li.classList.remove("done"); }); bar.style.transform = "scaleX(0)";
        [0, 1, 2].forEach(function (j) { setTimeout(function () {
          items[j].classList.add("done");
          M.animate(items[j].querySelector("i"), { transform: ["scale(.6)", "scale(1)"] }, { type: "spring", bounce: 0.35, duration: 0.45 });
          M.animate(bar, { transform: "scaleX(" + (j + 1) / items.length + ")" }, { type: "spring", bounce: 0, duration: 0.6 });
        }, 250 + j * 420); });
      }
      if (k === 2) M.animate(els(".sv-tl li, .sv-mn", v), { opacity: [0, 1], transform: ["translateX(-12px)", "translateX(0)"] }, { delay: M.stagger(0.12, { startDelay: 0.15 }), duration: 0.5, ease: ease });
      if (k === 3) {
        M.animate(el(".arc", v), { strokeDashoffset: [100, 26] }, { duration: 1.2, ease: ease });
        var sc = el(".sv-ring b", v); M.animate(0, 148, { duration: 1.2, ease: ease, onUpdate: function (x) { sc.textContent = Math.round(x); } });
        els(".sv-bars em", v).forEach(function (e, i) { var to = e.style.transform; M.animate(e, { transform: ["scaleX(0)", to] }, { delay: 0.2 + i * 0.1, duration: 0.8, ease: ease }); });
      }
    }
    vs.forEach(function (v, i) { if (i) { v.style.opacity = 0; v.style.transform = "translateY(28px) scale(.96)"; } });
    // on small screens a tall card is scaled to fit the stage rather than cropped
    var stgBox = el(".st-stage", st), fit = function () {
      var H = stgBox.clientHeight;
      vs.forEach(function (v) { var c = v.firstElementChild; if (!c) return; c.style.setProperty("--fit", 1); var ch = c.offsetHeight; c.style.setProperty("--fit", ch > H && H > 0 ? (H / ch).toFixed(3) : 1); });
    };
    fit(); window.addEventListener("resize", function () { if (document.body.contains(st)) fit(); });
    M.scroll(function (p) {
      rail.style.transform = "scaleY(" + p + ")";
      var k = Math.min(vs.length - 1, Math.floor(p * vs.length * 0.999));
      if (k !== cur) { cur = k; scene(k); }
    }, { target: st, offset: ["start start", "end end"] });
  }


  // ── scroll-linked motion: every section's movement is tied to the scroll position itself,
  // so it is as smooth as the scroll, runs backwards when you scroll back, and can never get stuck half way.
  // Only transform and opacity are written, straight to the element, once per frame.
  var clamp01 = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  var out3 = function (x) { x = clamp01(x); return 1 - Math.pow(1 - x, 3); };
  var scrub = function (target, fn, offset) { if (target) M.scroll(fn, { target: target, offset: offset || ["start end", "start 0.62"] }); };
  var wide = matchMedia("(min-width: 861px)").matches;

  // ── phones: the story and the notes scene keep their motion, in the reading flow with nothing pinned.
  // Every effect is tied to the scroll position, so it plays backwards too and can never stick half way.
  var imp = function (x, k, v) { x.style.setProperty(k, v, "important"); };
  var sf = el("#story.st-flat", lp);
  if (sf) {
    var sol = el(".st-steps", sf), sline = document.createElement("i");
    sline.className = "st-line"; sol.appendChild(sline);
    scrub(sol, function (p) { sline.style.transform = "scaleY(" + p.toFixed(4) + ")"; }, ["start 0.7", "end 0.7"]);
    els(".st-steps > li", sf).forEach(function (li, i) {
      scrub(li, function (p) { var on = p > 0.5; if (on !== !!li.__lit) { li.__lit = on; li.classList.toggle("lit", on); } }, ["start 0.74", "start 0.66"]);
      var card = el(".st-v > *", li);
      if (!card) return;
      // the card swings up out of the page as it arrives
      scrub(card, function (p) { var e = out3(p);
        card.style.opacity = (0.1 + e * 0.9).toFixed(3);
        card.style.transform = "perspective(900px) translate3d(0," + ((1 - e) * 56).toFixed(1) + "px,0) rotateX(" + ((1 - e) * 16).toFixed(2) + "deg) scale(" + (0.92 + e * 0.08).toFixed(4) + ")";
      }, ["start end", "start 0.6"]);
      var live = ["start 0.8", "end 0.75"];
      if (i === 0) {   // the days count down to the exam
        var days = els(".cal span", card).slice(0, 10), dl = -1;
        days.forEach(function (d) { d.classList.remove("soon", "x"); });
        scrub(card, function (p) { var n = Math.round(clamp01(p * 1.25) * 10); if (n === dl) return; dl = n;
          days.forEach(function (d, j) { d.classList.toggle("soon", j < n && j < 9); d.classList.toggle("x", j === 9 && n === 10); }); }, live);
      }
      if (i === 1) {   // the plan ticks itself off
        var its = els(".lp-day li", card), bar = el(".lp-dbar span", card), tl = -1;
        scrub(card, function (p) { var n = Math.min(3, Math.floor(clamp01(p * 1.2) * 4)); if (n === tl) return;
          its.forEach(function (x, j) { var was = x.classList.contains("done"), now = j < n; x.classList.toggle("done", now);
            if (now && !was) M.animate(x.querySelector("i"), { transform: ["scale(.5)", "scale(1)"] }, { type: "spring", bounce: 0.4, duration: 0.45 }); });
          tl = n; M.animate(bar, { transform: "scaleX(" + (n / its.length) + ")" }, { type: "spring", bounce: 0, duration: 0.5 }); }, live);
      }
      if (i === 2) {   // the chapter writes itself in, line by line
        var rows = els(".sv-tl li, .sv-mn", card);
        scrub(card, function (p) { rows.forEach(function (r, j) { var e = out3(p * 1.5 - j * 0.16);
          r.style.opacity = e.toFixed(3); r.style.transform = "translate3d(" + ((1 - e) * -18).toFixed(1) + "px,0,0)"; }); }, live);
      }
      if (i === 3) {   // the score fills in
        var arc = el(".arc", card), sc = el(".sv-ring b", card), bars = els(".sv-bars em", card).map(function (b) { return [b, parseFloat((b.style.transform.match(/[\d.]+/) || [1])[0])]; }), sl = -1;
        scrub(card, function (p) { var e = out3(p * 1.3);
          arc.style.strokeDashoffset = (100 - 74 * e).toFixed(2);
          var v = Math.round(148 * e); if (v !== sl) { sl = v; sc.textContent = v; }
          bars.forEach(function (b, j) { b[0].style.transform = "scaleX(" + (b[1] * out3(p * 1.4 - 0.1 - j * 0.08)).toFixed(4) + ")"; }); }, live);
      }
    });
  }

  var nf = el("#notes-show.ns-flat", lp);
  if (nf) {
    var nstg = el(".ns-stage", nf), nsh = el(".ns-sheet", nf), nc2 = el(".ns-card2", nf), ncap = document.createElement("div"), nkk = -1;
    var NST = els(".ns-steps li", nf).map(function (li) { return [el(".st-n", li).textContent, el("h3", li).textContent]; });
    ncap.className = "ns-cap"; ncap.setAttribute("aria-hidden", "true"); nstg.insertBefore(ncap, nstg.firstChild);
    // the sheet goes through the same four states as on desktop; a small label pinned above it names each one
    var setK = function (k) {
      if (k === nkk) return; var first = nkk < 0; nkk = k; nstg.dataset.k = k;
      ncap.innerHTML = '<span class="st-n">' + NST[k][0] + '</span><b>' + h(NST[k][1]) + '</b>';
      if (first) return;
      M.animate(ncap.children, { opacity: [0, 1], transform: ["translateY(6px)", "translateY(0)"] }, { duration: 0.3, ease: ease });
      if (k === 1) M.animate(els(".pyq", nsh), { transform: ["scale(.6)", "scale(1)"], opacity: [0, 1] }, { delay: M.stagger(0.07), type: "spring", bounce: 0.35, duration: 0.5 });
    };
    setK(0);
    scrub(nsh, function (p) { setK(p < 0.2 ? 0 : p < 0.45 ? 1 : p < 0.7 ? 2 : 3);
      var e = out3(p * 3);
      imp(nsh, "transform", "perspective(1000px) rotateX(" + ((1 - e) * 12).toFixed(2) + "deg) scale(" + (0.93 + e * 0.07).toFixed(4) + ")");
    }, ["start 0.85", "end 0.8"]);
    // the names-and-dates card comes up last and its chain links one by one
    if (nc2) { var ch = els(".ns-chain > *", nc2), tli = els(".ns-tl li", nc2);
      scrub(nc2, function (p) { var e = out3(p * 1.6);
        nc2.style.opacity = (0.1 + e * 0.9).toFixed(3);
        nc2.style.transform = "perspective(900px) translate3d(0," + ((1 - e) * 50).toFixed(1) + "px,0) rotateX(" + ((1 - e) * 14).toFixed(2) + "deg)";
        tli.forEach(function (x, j) { var f = out3(p * 2 - 0.3 - j * 0.2); x.style.opacity = f.toFixed(3); x.style.transform = "translate3d(" + ((1 - f) * -16).toFixed(1) + "px,0,0)"; });
        ch.forEach(function (x, j) { var f = out3(p * 2.2 - 0.9 - j * 0.12); x.style.opacity = f.toFixed(3); x.style.transform = "translate3d(" + ((1 - f) * -10).toFixed(1) + "px,0,0)"; });
      }, ["start end", "end 0.8"]); }
    // the five feature cards slide in from alternate sides
    els(".ns-steps li", nf).forEach(function (li, i) {
      scrub(li, function (p) { var e = out3(p);
        li.style.opacity = (0.15 + e * 0.85).toFixed(3);
        li.style.transform = "translate3d(" + ((1 - e) * (i % 2 ? 28 : -28)).toFixed(1) + "px," + ((1 - e) * 14).toFixed(1) + "px,0)";
      }, ["start end", "start 0.78"]);
    });
  }

  // section titles: words rise out of their masks one after another as the title scrolls up
  els(".lp-bh", lp).forEach(function (bh) {
    var h2 = el(".lp-h2", bh), kick = el(".kicker", bh), sub = el(".lp-sub", bh);
    if (!h2) return;
    if (!el(".wm", h2)) h2.innerHTML = h2.textContent.split(/\s+/).map(function (w) { return '<span class="wm"><span>' + h(w) + '</span></span>'; }).join(" ");
    var ws = els(".wm > span", h2), n = ws.length;
    scrub(bh, function (p) {
      ws.forEach(function (w, i) { var e = out3(p * 1.6 - i * (0.6 / Math.max(1, n))); w.style.transform = "translate3d(0," + ((1 - e) * 105).toFixed(2) + "%,0)"; });
      if (kick) kick.style.opacity = out3(p * 2).toFixed(3);
      if (sub) { var e = out3(p * 1.4 - 0.35); sub.style.opacity = e.toFixed(3); sub.style.transform = "translate3d(0," + ((1 - e) * 18).toFixed(1) + "px,0)"; }
    }, ["start 0.98", "start 0.6"]);
  });

  // stats: the numbers roll with the scroll and the dividers draw down
  var stats = el(".lp-stats", lp), sbs = els(".lp-stats b", lp).map(function (b) { return { b: b, to: parseInt(b.textContent.replace(/\D/g, ""), 10), last: -1 }; });
  if (stats) { stats.classList.add("st-draw", "go"); var divs = els(".lp-stats > div + div", lp);
    scrub(stats, function (p) {
      sbs.forEach(function (x, i) { if (!isFinite(x.to)) return; var v = Math.round(x.to * out3(p * 1.25 - i * 0.06)); if (v !== x.last) { x.last = v; x.b.textContent = v.toLocaleString("en-IN"); } });
      divs.forEach(function (d, i) { d.style.setProperty("--dv", out3(p * 1.4 - i * 0.1).toFixed(3)); });
    }, ["start end", "start 0.45"]); }

  // topic rows slide in from alternate sides
  var trows = els(".tp-row", lp);
  scrub(el(".tp-rows", lp), function (p) {
    trows.forEach(function (r, i) { var e = out3(p * 1.3 - i * 0.07); r.style.opacity = (0.15 + e * 0.85).toFixed(3); r.style.transform = "translate3d(" + ((1 - e) * (i % 2 ? 18 : -18)).toFixed(2) + "vw,0,0)"; });
  }, ["start end", "start 0.5"]);

  // feature tiles: each rises and settles on its own as it comes up the screen
  els(".lp-bento > *", lp).forEach(function (x, i) {
    scrub(x, function (p) { var e = out3(p); x.style.opacity = (e * e).toFixed(3); x.style.transform = "translate3d(0," + ((1 - e) * 70).toFixed(1) + "px,0) scale(" + (0.95 + e * 0.05).toFixed(4) + ")"; },
      ["start end", "start " + (wide ? 0.72 : 0.8)]);
  });

  // Tier 1 / Tier 2 cards: dealt from under one another
  var t2 = els(".lp-t2 > *", lp);
  scrub(el(".lp-t2", lp), function (p) {
    t2.forEach(function (x, i) { var e = out3(p * 1.35 - i * 0.12);
      x.style.opacity = (e * e).toFixed(3);
      x.style.transform = wide ? "translate3d(" + ((1 - e) * (1 - i) * 40).toFixed(1) + "%," + ((1 - e) * 40).toFixed(1) + "px,0) scale(" + (0.94 + e * 0.06).toFixed(4) + ")"
        : "translate3d(0," + ((1 - e) * 60).toFixed(1) + "px,0) scale(" + (0.95 + e * 0.05).toFixed(4) + ")"; });
  }, ["start end", "start 0.55"]);

  // pricing: the two cards glide together from either side and settle level
  var tiers = els(".lp-tiers > .tier", lp);
  scrub(el(".lp-tiers", lp), function (p) {
    tiers.forEach(function (x, i) { var e = out3(p * 1.25 - i * 0.1), dx = wide ? (i ? 1 : -1) * (1 - e) * 60 : 0;
      x.style.opacity = (0.1 + e * 0.9).toFixed(3);
      x.style.transform = "translate3d(" + dx.toFixed(1) + "px," + ((1 - e) * 50).toFixed(1) + "px,0) scale(" + (0.96 + e * 0.04).toFixed(4) + ")"; });
  }, ["start end", "start 0.5"]);

  // questions: each lifts into place as it arrives
  els(".lp-qs > *", lp).forEach(function (x) {
    scrub(x, function (p) { var e = out3(p); x.style.opacity = (0.2 + e * 0.8).toFixed(3); x.style.transform = "translate3d(0," + ((1 - e) * 26).toFixed(1) + "px,0)"; }, ["start end", "start 0.85"]);
  });

  // the closing card opens out of a narrow slit as you reach it and closes as you leave
  var finc = el(".lp-fin", lp);
  scrub(finc, function (p) {
    var e = out3(p), ix = (1 - e) * 10, iy = (1 - e) * 22;
    finc.style.clipPath = "inset(" + iy.toFixed(2) + "% " + ix.toFixed(2) + "% round " + (32 + (1 - e) * 60).toFixed(1) + "px)";
    finc.style.transform = "scale(" + (0.95 + e * 0.05).toFixed(4) + ")";
  }, ["start end", "start 0.3"]);

  // the closing number counts down to your days as the card opens
  var fd = el(".lp-fd", lp), fdTo = fd ? +fd.textContent : 0, fdLast = -1;
  scrub(fd, function (p) { var v = Math.round(fdTo + (1 - out3(p)) * 30); if (v !== fdLast) { fdLast = v; fd.textContent = v; } }, ["start end", "start 0.45"]);

  })();

  // a mock is a clock: count down while the tile is on screen
  var clock = el("[data-clock]", lp);
  if (clock && !still) {
    var sec = 14 * 60 + 59, iv = null;
    var io = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting && !iv) iv = setInterval(function () {
        if (!document.body.contains(clock)) { clearInterval(iv); io.disconnect(); return; }
        sec = sec > 0 ? sec - 1 : 15 * 60;
        clock.textContent = Math.floor(sec / 60) + ":" + ("0" + sec % 60).slice(-2);
      }, 1000);
      else if (!e[0].isIntersecting && iv) { clearInterval(iv); iv = null; }
    });
    io.observe(clock);
  }

  // tiles: a soft light that follows the pointer (fine pointers only)
  if (matchMedia("(pointer:fine)").matches) els(".lp-bento article, .lp-tiers > div", lp).forEach(function (a) {
    a.addEventListener("pointermove", function (e) {
      var r = a.getBoundingClientRect();
      a.style.setProperty("--mx", (e.clientX - r.left) + "px"); a.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });
}

/* top bar: a glass pill slides to the link under the pointer, on a critically
   damped spring, so moving across the links reads as one continuous motion */
function wirePubnav() {
  var nav = el(".pubnav");
  if (!nav || nav.dataset.wired) return;
  nav.dataset.wired = "1";
  var M = window.Motion, still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var links = els(".pn-l a", nav), pill = document.createElement("span");
  pill.className = "pn-pill"; pill.setAttribute("aria-hidden", "true");
  var host = el(".pn-l", nav); host.appendChild(pill);
  var shown = false;
  function to(a) {
    var x = a.offsetLeft, w = a.offsetWidth;
    if (!M || still || !shown) { pill.style.transform = "translateX(" + x + "px)"; pill.style.width = w + "px"; }
    else M.animate(pill, { transform: "translateX(" + x + "px)", width: w + "px" }, { type: "spring", bounce: 0, duration: 0.35 });
    if (!shown) { shown = true; if (M && !still) M.animate(pill, { opacity: [0, 1] }, { duration: 0.18 }); else pill.style.opacity = 1; }
  }
  links.forEach(function (a) { a.addEventListener("pointerenter", function () { to(a); }); a.addEventListener("focus", function () { to(a); }); });
  host.addEventListener("pointerleave", function () {
    shown = false;
    if (M && !still) M.animate(pill, { opacity: 0 }, { duration: 0.18 }); else pill.style.opacity = 0;
  });
  // the bar only draws its edge once content is scrolling under it
  function edge() { nav.classList.toggle("scrolled", scrollY > 4); }
  addEventListener("scroll", edge, { passive: true }); edge();
}

/* ══════════ notes, v4: a recap and complete chapters ══════════
   Content arrives as typed blocks, so each idea is drawn in the form that
   makes it easiest to remember: chronology as a timeline, parallel lists as
   tables, matching lists as pairs, confusable things side by side. */
var noteMode = (function () { try { return localStorage.getItem("cgl-note-mode") || "full"; } catch (e) { return "full"; } })();
/* exam marks inside note text: a trailing "{PYQ 2023, 2024}" becomes a year badge and the
   line is highlighted as asked in SSC CGL */
var PYQ_RE = /\s*((?:\{(?:PYQ|T2)(?: [\d, ]+)?\}\s*)+)$/;
/* "Asked 2026": with the questions behind it, the chip opens them (answer and solution shown) */
var Q26 = {};
function chip26(ids) {
  ids = (ids || []).filter(function (id) { return qById(id); });
  if (!ids.length) return '<span class="pyq y26" title="Asked in SSC CGL 2026 Tier 1 (recalled by candidates)">Asked 2026</span>';
  return '<span class="pyq y26 q26" role="button" tabindex="0" data-q26="' + h(ids.join(",")) + '" title="See the 2026 question' + (ids.length > 1 ? 's' : '') + ' with the answer">Asked 2026' + (ids.length > 1 ? ' · ' + ids.length : '') + ' <i aria-hidden="true">›</i></span>';
}
function q26Sheet(ids) {
  var qs = ids.map(qById).filter(Boolean); if (!qs.length) return;
  var box = document.createElement("div"); box.className = "q26-sheet";
  box.innerHTML = '<div class="q26-bg"></div><div class="q26-in" role="dialog" aria-modal="true" aria-label="Asked in SSC CGL 2026">' +
    '<div class="q26-h"><b><span class="pyq y26">Asked 2026</span> ' + (qs.length > 1 ? qs.length + ' questions' : 'The question') + '</b><button class="q26-x" aria-label="Close">&#215;</button></div>' +
    qs.map(function (q) {
      var p = paperOf(q) || {};
      return '<article class="kp-q"><div class="qbar"><span class="c">' + h(p.label || "") + (q.t ? ' · ' + h(q.t) : '') + repChip(q) + '</span></div>' +
        '<div class="qstem">' + stemHTML(q) + '</div>' +
        '<div class="opts kp-o">' + q.o.map(function (o, k) { return '<div class="opt' + (k === q.a ? ' ok' : '') + '"><em>' + "ABCDE"[k] + '</em><span>' + optHTML(o) + '</span>' + (k === q.a ? '<b class="mk ok" aria-label="Correct answer">✓</b>' : '') + '</div>'; }).join("") + '</div>' +
        '<div class="why ok"><span class="t">Answer ' + "ABCDE"[q.a] + '</span><p>' + (q.e ? h(q.e).replace(/\n/g, "<br>") : optHTML(q.o[q.a])) + '</p></div>' +
        (p.id ? '<a class="q26-go" href="#/mock/' + encodeURIComponent(p.id) + '/paper">The whole paper with answers' + arr() + '</a>' : '') + '</article>';
    }).join("") + '</div>';
  document.body.appendChild(box); document.body.style.overflow = "hidden";
  var close = function () { document.body.style.overflow = ""; box.remove(); document.removeEventListener("keydown", esc); };
  var esc = function (e) { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", esc);
  el(".q26-bg", box).addEventListener("click", close); el(".q26-x", box).addEventListener("click", close);
  els(".q26-go", box).forEach(function (a) { a.addEventListener("click", close); });
  el(".q26-x", box).focus();
}
document.addEventListener("click", function (e) {
  var c = e.target.closest && e.target.closest("[data-q26]"); if (!c) return;
  e.preventDefault(); e.stopPropagation(); q26Sheet(c.dataset.q26.split(","));
}, true);
document.addEventListener("keydown", function (e) {
  if ((e.key === "Enter" || e.key === " ") && e.target.dataset && e.target.dataset.q26) { e.preventDefault(); q26Sheet(e.target.dataset.q26.split(",")); }
});
function hx(s) {
  s = s == null ? "" : String(s);
  var m = s.match(PYQ_RE);
  if (!m) return { t: h(s), hot: false };
  // one or more trailing tags: {PYQ 2023} is a Tier 1 question (yellow), {T2 2024} a Tier 2 one (violet)
  var tags = "", t2 = false, t1 = false, re = /\{(PYQ|T2)(?: ([\d, ]+))?\}/g, x;
  while ((x = re.exec(m[1]))) {
    var ys = x[2] ? x[2].split(/,\s*/).filter(Boolean) : [], two = x[1] === "T2", yr = ys.map(function (y) { return "’" + y.slice(2); }).join(" ");
    if (two) t2 = true; else t1 = true;
    // this year's exam gets its own chip, so a line asked in 2026 stands out from the older years
    var now26 = !two && ys.indexOf("2026") >= 0;
    if (now26) { ys = ys.filter(function (y) { return y !== "2026"; }); yr = ys.map(function (y) { return "’" + y.slice(2); }).join(" "); }
    if (two || ys.length || !now26)
      tags += ' <span class="pyq' + (two ? ' t2' : '') + '" title="Asked in SSC CGL Tier ' + (two ? '2' : '1') + (ys.length ? ": " + ys.join(", ") : "") + '">' +
        (two ? "Tier 2" + (yr ? " " + yr : "") : ys.length ? "Asked " + yr : "Asked") + '</span>';
    if (now26) tags += ' ' + chip26(Q26[s.replace(PYQ_RE, "").trim()]);
  }
  // "only" marks a line asked in Tier 2 but never in Tier 1, which gets the Tier 2 colour
  return { t: h(s.replace(PYQ_RE, "")) + tags, hot: true, t2: t2, only: t2 && !t1 };
}
function nb(b) {
  var t = b.title || b.imp ? '<h4 class="nb-t">' + (b.imp ? '<span class="mr">Must read</span>' : '') + h(b.title || "") + '</h4>' : '';
  var any = false;
  function hc(r) { return r.hot ? (r.only ? 'hot t2' : 'hot') : ''; }
  function li(x) { var r = hx(x); any = any || r.hot; return '<li' + (r.hot ? ' class="' + hc(r) + '"' : '') + '>' + r.t + '</li>'; }
  var out = "";
  switch (b.type) {
    case "points": out = '<ul class="pts">' + (b.items || []).map(li).join("") + '</ul>'; break;
    case "table": out = '<div class="nt-scroll"><table><thead><tr>' + (b.cols || []).map(function (c) { return '<th>' + h(c) + '</th>'; }).join("") + '</tr></thead><tbody>' +
      (b.rows || []).map(function (r) {
        var hot = false, one = false, cells = r.map(function (c, i) { var x = hx(c); hot = hot || x.hot; one = one || (x.hot && !x.only); return i ? '<td>' + x.t + '</td>' : '<th scope="row">' + x.t + '</th>'; }).join("");
        any = any || hot; return '<tr' + (hot ? ' class="hot' + (one ? '' : ' t2') + '"' : '') + '>' + cells + '</tr>'; }).join("") + '</tbody></table></div>'; break;
    case "timeline": out = '<ol>' + (b.items || []).map(function (x) { var r = hx(x.what); any = any || r.hot;
      return '<li' + (r.hot ? ' class="' + hc(r) + '"' : '') + '><b>' + h(x.when) + '</b><span>' + r.t +
        ((x.who || []).length ? '<div class="tlw">' + x.who.map(function (w) { return '<i>' + h(w) + '</i>'; }).join("") + '</div>' : '') + '</span></li>'; }).join("") + '</ol>'; break;
    case "pairs": out = '<div class="np">' + (b.items || []).map(function (x) { var r = hx(x.b); any = any || r.hot;
      return '<div' + (r.hot ? ' class="' + hc(r) + '"' : '') + '><b>' + h(x.a) + '</b><i aria-hidden="true"></i><span>' + r.t + '</span></div>'; }).join("") + '</div>'; break;
    case "compare": out = '<div class="nc" style="--n:' + (b.items || []).length + '">' + (b.items || []).map(function (x) { return '<div><h5>' + h(x.title) + '</h5><ul class="pts">' + (x.points || []).map(li).join("") + '</ul></div>'; }).join("") + '</div>'; break;
    case "chain": out = '<div class="chn">' + (b.items || []).map(function (x) {
      var r = hx(x.note || ""), nodes = (x.nodes || []).slice(), last = hx(nodes.pop()); any = any || r.hot || last.hot;
      return '<div class="chn-r' + (r.hot || last.hot ? ' hot' + ((r.hot ? r.only : true) && (last.hot ? last.only : true) ? ' t2' : '') : '') + '"><div class="chn-n">' + nodes.map(function (n) { return '<span>' + h(n) + '</span>'; }).join('<i aria-hidden="true"></i>') +
        (nodes.length ? '<i aria-hidden="true"></i>' : '') + '<span>' + last.t + '</span></div>' + (x.note ? '<p>' + r.t + '</p>' : '') + '</div>'; }).join("") + '</div>'; break;
    case "flow": out = '<ol>' + (b.steps || []).map(function (x) { return '<li><span>' + h(x) + '</span></li>'; }).join("") + '</ol>'; break;
    case "mnemonic": return '<div class="nb nb-mn' + (b.imp ? ' imp' : '') + '">' + (b.title ? '<h4 class="nb-t">' + h(b.title) + '</h4>' : '<h4 class="nb-t">Mnemonic</h4>') + '<div class="mn-k">' + h(b.key) + '</div><div class="mn-l' + ((b.lines || []).some(function (x) { return String(x.l).length > 2; }) ? ' mn-w' : '') + '">' +
      (b.lines || []).map(function (x) { return '<div><b>' + h(x.l) + '</b><span>' + h(x.t) + '</span></div>'; }).join("") + '</div>' + (b.note ? '<p class="mn-n">' + h(b.note) + '</p>' : '') + '</div>';
    case "callout": var tone = { remember: "Remember", tip: "Tip", trap: "Trap", story: "The story" }[b.tone] || "Note", cb = hx(b.body);
      return '<div class="nb nb-co co-' + h(b.tone || "remember") + (cb.hot ? ' has-hot' + (cb.only ? ' t2' : '') : '') + '"><span class="co-k">' + h(b.title || tone) + '</span><p>' + cb.t + '</p></div>';
    case "formula": out = '<div class="fxg">' + (b.items || []).map(function (f) { return '<div class="fxc"><code>' + h(f.f) + '</code>' + (f.note ? '<span>' + h(f.note) + '</span>' : '') + '</div>'; }).join("") + '</div>'; break;
    case "fig": return '<figure class="nb nb-fig">' + (b.title ? '<h4 class="nb-t">' + h(b.title) + '</h4>' : '') + '<div class="fig-s">' + svgSafe(b.svg) + '</div>' +
      (b.cap ? '<figcaption>' + hx(b.cap).t + '</figcaption>' : '') + '</figure>';
    case "solve": return solveHTML(b);
    default: return "";
  }
  var cls = { points: "nb-pts", table: "nb-tab", timeline: "nb-tl", pairs: "nb-pairs", compare: "nb-cmp", chain: "nb-chain", flow: "nb-flow", formula: "nb-fx" }[b.type];
  return '<div class="nb ' + cls + (b.imp ? ' imp' : '') + (any ? ' has-hot' : '') + '">' + t + out + '</div>';
}
/* diagrams in the maths notes: plain SVG from our own data, still reduced to a small
   whitelist before it is shown, and styled only through theme classes */
var SVG_EL = /^(svg|g|line|path|circle|ellipse|rect|polygon|polyline|text|tspan|title)$/,
  SVG_AT = /^(viewBox|class|d|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|points|transform|text-anchor|dominant-baseline|dx|dy|stroke-dasharray|role|aria-label)$/;
function svgSafe(src) {
  if (!src || typeof DOMParser === "undefined") return "";
  try {
    var doc = new DOMParser().parseFromString(String(src), "image/svg+xml"), root = doc.documentElement;
    if (!root || root.nodeName !== "svg" || doc.getElementsByTagName("parsererror").length) return "";
    (function clean(n) {
      Array.prototype.slice.call(n.children).forEach(function (c) { if (!SVG_EL.test(c.nodeName)) n.removeChild(c); else clean(c); });
      Array.prototype.slice.call(n.attributes).forEach(function (a) { if (!SVG_AT.test(a.name)) n.removeAttribute(a.name); });
      // chart bars get their own names so page-wide classes (the tab bar is ".bar") never touch them
      var c = n.getAttribute && n.getAttribute("class"); if (c) n.setAttribute("class", c.replace(/\bbar(2?)\b/g, "cbar$1"));
    })(root);
    root.setAttribute("xmlns", "http://www.w3.org/2000/svg"); root.setAttribute("role", "img");
    root.removeAttribute("width"); root.removeAttribute("height");
    return new XMLSerializer().serializeToString(root);
  } catch (e) { return ""; }
}
document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-print]")) window.print(); });
/* tap a diagram to see it large: the same SVG, full width, panned by hand */
document.addEventListener("click", function (e) {
  var s = e.target.closest ? e.target.closest(".fig-s") : null;
  if (!s || s.closest(".figzoom") || e.target.closest("a,button")) return;
  var svg = s.querySelector("svg"); if (!svg) return;
  var z = document.createElement("div"); z.className = "figzoom"; z.setAttribute("role", "dialog"); z.setAttribute("aria-label", "Diagram, enlarged");
  var wrap = s.closest("figure, .nb-sol"), cap = wrap && (wrap.querySelector("figcaption") || wrap.querySelector(".nb-t") || wrap.querySelector(".sol-q"));
  z.innerHTML = '<button class="fz-x" type="button">Close</button><div class="fz-in fig-s"></div><p class="fz-c"></p>';
  z.querySelector(".fz-in").appendChild(svg.cloneNode(true));
  if (cap) z.querySelector(".fz-c").textContent = cap.textContent;
  function close() { z.remove(); document.removeEventListener("keydown", onk); }
  function onk(ev) { if (ev.key === "Escape") close(); }
  z.addEventListener("click", function (ev) { if (ev.target === z || ev.target.classList.contains("fz-x") || ev.target.classList.contains("fz-c")) close(); });
  document.addEventListener("keydown", onk);
  document.body.appendChild(z); z.querySelector(".fz-x").focus();
});
/* a past question worked in full: try it first, then open the steps */
function solveHTML(b) {
  var L = "ABCD", a = String(b.a || "").trim(), o = b.o || [];
  var ok = o.findIndex ? o.findIndex(function (x) { return String(x).trim() === a; }) : -1;
  return (b.title ? '<h4 class="nb-t sol-g">' + h(b.title) + '</h4>' : '') + '<div class="nb nb-sol has-hot">' +
    '<div class="sol-h"><span class="sol-k">' + (/^practice/i.test(b.src || "") ? "Worked example" : "Solved PYQ") + '</span>' + (b.src && !/^practice/i.test(b.src) ? '<span class="pyq' + (/2026/.test(b.src) ? ' y26' : '') + '">' + h(b.src) + '</span>' : '') + '</div>' +
    '<p class="sol-q">' + h(b.q) + '</p>' +
    (b.svg ? '<div class="fig-s sol-fig">' + svgSafe(b.svg) + '</div>' : '') +
    (o.length ? '<ol class="sol-o">' + o.map(function (x, i) { return '<li' + (i === ok ? ' class="ok"' : '') + '><b>' + L[i] + '</b><span>' + h(x) + '</span></li>'; }).join("") + '</ol>' : '') +
    '<details class="sol-d"><summary><span>Show the full solution</span></summary>' +
      '<ol class="sol-st">' + (b.steps || []).map(function (x) { return '<li>' + h(x) + '</li>'; }).join("") + '</ol>' +
      '<p class="sol-a"><span>Answer</span><b>' + h(a) + '</b></p>' +
      (b.trick ? '<p class="sol-tr"><span>Shortcut</span>' + h(b.trick) + '</p>' : '') +
      '<button class="sol-sh" data-solsh><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0-4 4m4-4 4 4"/><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg>Share this question</button>' +
    '</details></div>';
}
/* send a worked question to a friend: the question, its answer and a link to the topic's notes */
function wireShareSol(root) {
  els("[data-solsh]", root).forEach(function (b) { b.addEventListener("click", function () {
    var box = b.closest(".nb-sol"), q = el(".sol-q", box).textContent, a = (el(".sol-a b", box) || {}).textContent || "";
    var m = /^#\/learn\/[A-Z]\/([^/?]+)/.exec(location.hash), t = m ? decodeURIComponent(m[1]) : "";
    var slug = t.toLowerCase().replace(/[&+]/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    var url = "https://cglcompass.in/" + (slug ? "ssc-cgl-notes/" + slug : "") + (AU && AU.ref ? "?r=" + AU.ref : "");
    shareOut("SSC CGL " + (t ? t + " " : "") + "question: " + q + "\nAnswer: " + a + "\nThe full step-by-step solution is on CGL Compass: ", url);
  }); });
}
/* History "Timeline and links": eras on one line, dates with their era, name chains */
function tlYear(x) {
  var y = String(x.y || "").replace(/^About /, "c. ").replace(/^From about /, "from c. ").replace(/(\d)-(\d)/g, "$1–$2");
  return '<b>' + h(y) + '</b>' + (x.e ? '<small>' + h(x.e) + '</small>' : '');
}
function timelineHTML(T) {
  var E = T.eras || [], L = T.links || [], M = T.mixups || [];
  var rib = '<nav class="tl-rib" aria-label="Eras">' + E.map(function (e, i) {
    return '<button data-era="' + i + '" style="--i:' + i + '"><span class="tl-rn">' + (i + 1 < 10 ? "0" : "") + (i + 1) + '</span><b>' + h(e.name) + '</b><em>' + h(e.span) + '</em>' +
      (i === 2 ? '<i class="tl-zero" aria-hidden="true"><span>0</span></i>' : '') + '</button>'; }).join("") +
    '</nav><p class="tl-key"><span><b>BCE</b> before the common era, counts down to 0</span><span><b>CE</b> after it, counts up; plain years from 1206 on are CE</span><span><span class="pyq">Asked</span> SSC has asked it</span></p>';
  var story = (T.lines || []).length ? '<details class="tl-story"><summary>The whole story in ' + T.lines.length + ' lines</summary><ol>' +
    T.lines.map(function (x) { var r = hx(x); return '<li>' + r.t + '</li>'; }).join("") + '</ol></details>' : '';
  var eras = E.map(function (e, i) {
    return '<section class="tl-era" id="tle-' + i + '" style="--i:' + i + '"><header><span class="tl-n">Era ' + (i + 1) + '</span><h4>' + h(e.name) + '</h4><span class="tl-sp">' + h(e.span) + '</span></header>' +
      '<ol class="tl-list">' + (e.items || []).map(function (x) { var r = hx(x.what);
        return '<li' + (r.hot ? ' class="hot"' : '') + '><div class="tl-y">' + tlYear(x) + '</div><div class="tl-w"><p>' + r.t + '</p>' +
          ((x.who || []).length ? '<div class="tlw">' + x.who.map(function (w) { return '<i>' + h(w) + '</i>'; }).join("") + '</div>' : '') + '</div></li>'; }).join("") + '</ol></section>';
  }).join("");
  var links = L.length ? '<section class="tl-links" id="tl-links"><header><span class="tl-n">Links</span><h4>Who links to whom</h4><p>Read each chain left to right: the first name leads to the next.</p></header>' +
    '<div class="tl-lf" role="tablist">' + L.map(function (g, i) { return '<button role="tab" data-lg="' + i + '" aria-selected="' + (i === 0) + '">' + h(g.title.split(":")[0]) + '</button>'; }).join("") + '</div>' +
    L.map(function (g, i) { return '<div class="tl-lg" data-lgp="' + i + '"' + (i ? ' hidden' : '') + '><h5>' + h(g.title) + '</h5>' + nb({ type: "chain", items: g.items }) + '</div>'; }).join("") + '</section>' : '';
  var mix = M.length ? '<section class="tl-mix"><header><span class="tl-n">Mix-ups</span><h4>Names SSC loves to swap</h4></header><div class="tl-mg">' +
    M.map(function (m) { return '<div class="tl-mc' + (m.tone && m.tone !== "trap" ? ' soft' : '') + '"><b>' + h(m.title) + '</b><p>' + hx(m.body).t + '</p></div>'; }).join("") + '</div></section>' : '';
  return '<div class="nv-time">' + rib + story + '<div class="tl-eras">' + eras + '</div>' + links + mix + '</div>';
}
function wireTimeline(nv) {
  var box = el(".nv-time", nv); if (!box) return;
  var btns = els(".tl-rib button", box), secs = els(".tl-era", box);
  btns.forEach(function (b) { b.addEventListener("click", function () { var t = el("#tle-" + b.dataset.era, box); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }); });
  if (secs.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { var k = secs.indexOf(x.target); btns.forEach(function (b, j) { b.classList.toggle("on", j === k); }); } }); }, { rootMargin: "-35% 0px -55% 0px" });
    secs.forEach(function (s) { io.observe(s); });
  }
  els("[data-lg]", box).forEach(function (b) { b.addEventListener("click", function () {
    els("[data-lg]", box).forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
    els("[data-lgp]", box).forEach(function (p) { p.hidden = p.dataset.lgp !== b.dataset.lg; });
    var M = window.Motion, p = el('[data-lgp="' + b.dataset.lg + '"]', box);
    if (M && p && !matchMedia("(prefers-reduced-motion: reduce)").matches) M.animate(els(".chn-r", p), { opacity: [0, 1], transform: ["translateY(6px)", "translateY(0)"] }, { duration: 0.28, delay: M.stagger(0.025), ease: [0.23, 1, 0.32, 1] });
  }); });
}
/* the History timeline tab (signed off 2026-09-29) */
var TL_LIVE = true;
var YLD = { high: "Asked often", medium: "Asked sometimes" };
var noteLens = "", tocOff = false;
try { tocOff = localStorage.getItem("cgl-toc") === "off"; } catch (e) {}
try { noteLens = localStorage.getItem("cgl-note-lens") || ""; if (noteLens === "1") noteLens = "asked"; if (noteLens === "0") noteLens = ""; } catch (e) {}
function notesV4(N) {
  var R = N.recap || {}, C = N.chapters || [];
  Q26 = N.q26 || {};
  var recap = '<div class="nv-recap">' +
    '<ol class="rc-lines">' + (R.lines || []).map(function (x) { var r = hx(x); return '<li' + (r.hot ? ' class="hot"' : '') + '>' + r.t + '</li>'; }).join("") + '</ol>' +
    ((R.numbers || []).length ? '<div class="rc-nums">' + R.numbers.map(function (x) { return '<div><b>' + h(x.n) + '</b><span>' + h(x.label) + '</span></div>'; }).join("") + '</div>' : '') +
    ((R.mnemonics || []).length ? '<div class="rc-mns">' + R.mnemonics.map(function (m) {
      return '<div class="rc-mn"><span class="co-k">' + h(m.for || "Mnemonic") + '</span><div class="mn-k">' + h(m.key) + '</div><ul>' + (m.expand || []).map(function (x) { return '<li>' + h(x) + '</li>'; }).join("") + '</ul></div>'; }).join("") + '</div>' : '') +
  '</div>';
  var full = '<div class="nv-full">' +
    // phones: one sticky picker instead of a row of clipped chips
    '<div class="nv-pick"><button class="nv-prev" aria-label="Previous chapter">&#8249;</button>' +
      '<button class="nv-pk" aria-haspopup="dialog"><span class="nv-pn">Chapter 1 of ' + C.length + '</span><b class="nv-pt">' + h((C[0] || {}).h || "") + '</b><i aria-hidden="true">&#9662;</i></button>' +
      '<button class="nv-next" aria-label="Next chapter">&#8250;</button></div>' +
    '<div class="nv-sheet" hidden><div class="nv-sh-bg"></div><div class="nv-sh-in" role="dialog" aria-label="Chapters"><div class="nv-sh-h"><b>Chapters</b><button class="nv-sh-x" aria-label="Close">&#215;</button></div>' +
      C.map(function (c, i) { return '<button data-go="' + i + '"><span>' + (i + 1) + '</span>' + h(c.h) + '</button>'; }).join("") + '</div></div>' +
    '<button class="nv-tocb" data-toct aria-label="Show chapters" title="Show chapters"><span aria-hidden="true">&#9776;</span> Chapters</button>' +
    '<nav class="nv-toc" aria-label="Chapters"><div class="nv-toch"><b>Chapters</b><button data-toct aria-label="Hide chapters" title="Hide chapters">&#8249;</button></div>' + C.map(function (c, i) { return '<a href="#nch-' + i + '" data-nch="' + i + '"' + (c.yield === "high" ? ' class="hy" title="Asked often"' : '') + '><span>' + (i + 1) + '</span>' + h(c.h) + '</a>'; }).join("") + '</nav>' +
    '<div class="nv-chs">' + C.map(function (c, i) {
      return '<article class="nch' + (/\{(PYQ|T2)|"type":"solve"/.test(JSON.stringify(c.blocks || [])) ? ' has-hot' : '') + '" id="nch-' + i + '"><header><span class="nch-n">Chapter ' + (i + 1) + (YLD[c.yield] ? '<em class="yl yl-' + c.yield + '">' + YLD[c.yield] + '</em>' : '') + '</span><h3>' + h(c.h) + '</h3></header>' +
        (c.intro ? '<p class="nch-in">' + h(c.intro) + '</p>' : '') + (c.blocks || []).map(nb).join("") + '</article>'; }).join("") + '</div>' +
  '</div>';
  var CS = JSON.stringify(C), hot1 = (CS.match(/\{PYQ/g) || []).length, hot2 = (CS.match(/\{T2/g) || []).length, hot = hot1 + hot2 + (CS.match(/"type":"solve"/g) || []).length;
  var hasT = TL_LIVE && !!(N.timeline && (N.timeline.eras || []).length), mode = noteMode === "time" && !hasT ? "full" : noteMode;
  // what the reader can narrow the notes to: every asked line, this year's exam only, or the must-read blocks
  var n26 = (CS.match(/\{PYQ [\d, ]*2026/g) || []).length + (CS.match(/"src":"CGL 2026"/g) || []).length, nimp = (CS.match(/"imp":true/g) || []).length;
  var L = [["", "All notes"]].concat(hot ? [["asked", "Asked by SSC"]] : [], n26 ? [["y26", "Asked in 2026 · " + n26]] : [], nimp ? [["imp", "Must read · " + nimp]] : []);
  var lens = L.some(function (x) { return x[0] === noteLens; }) ? noteLens : "";
  return '<div class="nv" data-mode="' + mode + '" data-lens="' + lens + '" data-toc="' + (tocOff ? "off" : "on") + '">' +
    (L.length > 1 ? '<div class="nv-lens"><span class="nv-lk">' + (hot1 ? '<span class="pyq">Asked</span> ' + hot1 + ' lines asked in Tier 1' : '') +
      (n26 ? (hot1 ? '<i class="nv-lsep"></i>' : '') + '<span class="pyq y26">Asked 2026</span> ' + n26 + ' from this year' : '') +
      (hot2 ? (hot1 || n26 ? '<i class="nv-lsep"></i>' : '') + '<span class="pyq t2">Tier 2</span> ' + hot2 + ' asked in Tier 2' : '') + (!hot1 && !hot2 && !n26 && hot ? 'Solved past questions in every chapter' : '') + '</span>' +
      '<div class="nv-lseg" role="radiogroup" aria-label="Show">' + L.map(function (x) { return '<button role="radio" data-lens="' + x[0] + '" aria-checked="' + (x[0] === lens) + '"' + (x[0] === "y26" ? ' class="l26"' : x[0] === "imp" ? ' class="limp"' : '') + '>' + h(x[1]) + '</button>'; }).join("") + '</div></div>' : '') +
    '<div class="nv-seg" role="tablist" aria-label="Notes view" style="--n:' + (hasT ? 3 : 2) + '"><button role="tab" data-nm="recap" aria-selected="' + (mode === "recap") + '">Recap <small>' + (R.lines || []).length + ' lines</small></button>' +
      '<button role="tab" data-nm="full" aria-selected="' + (mode === "full") + '">Complete notes <small>' + C.length + ' chapters</small></button>' +
      (hasT ? '<button role="tab" data-nm="time" aria-selected="' + (mode === "time") + '">Timeline <small>and links</small></button>' : '') + '<i aria-hidden="true"></i></div>' +
    '<div class="nv-body">' + recap + full + (hasT ? timelineHTML(N.timeline) : '') + '</div></div>';
}
function wireNotes() {
  var nv = el(".nv");
  if (!nv) return;
  wireTimeline(nv);
  els("[data-toct]", nv).forEach(function (b) { b.addEventListener("click", function () {
    tocOff = !tocOff; nv.dataset.toc = tocOff ? "off" : "on";
    try { localStorage.setItem("cgl-toc", tocOff ? "off" : "on"); } catch (e) {}
  }); });
  // mark what came from this year's exam, so the "Asked in 2026" view can keep just those lines and blocks
  els(".nv-chs .pyq.y26", nv).forEach(function (p) {
    var line = p.closest(".pts li, tr, .np > div, .nb-tl li, .chn-r, .nb-co, .nb-sol"); if (line) line.classList.add("y26");
    var b = p.closest(".nb"); if (b) b.classList.add("has26");
    var c = p.closest(".nch"); if (c) c.classList.add("has26");
  });
  els(".nv-chs .nb.imp", nv).forEach(function (b) { var c = b.closest(".nch"); if (c) c.classList.add("hasimp"); });
  els("[data-lens]", el(".nv-lens", nv) || nv).forEach(function (b) { if (b === nv) return; b.addEventListener("click", function () {
    noteLens = b.dataset.lens; nv.dataset.lens = noteLens;
    els(".nv-lseg [data-lens]", nv).forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
    try { localStorage.setItem("cgl-note-lens", noteLens); } catch (e) {}
    if (noteLens && noteMode !== "full") { var fb = el('[data-nm="full"]', nv); if (fb) fb.click(); }
    refreshPicker();
  }); });
  els("[data-nm]", nv).forEach(function (b) {
    b.addEventListener("click", function () {
      noteMode = b.dataset.nm; nv.dataset.mode = noteMode;
      try { localStorage.setItem("cgl-note-mode", noteMode); } catch (e) {}
      els("[data-nm]", nv).forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
      var M = window.Motion, body = el({ recap: ".nv-recap", full: ".nv-full", time: ".nv-time" }[noteMode] || ".nv-full", nv);
      if (M && !matchMedia("(prefers-reduced-motion: reduce)").matches) M.animate(body, { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0)"] }, { duration: 0.3, ease: [0.23, 1, 0.32, 1] });
    });
  });
  // chapter list: jump without touching the hash router, and follow the reading position
  var links = els("[data-nch]", nv);
  links.forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); var t = document.getElementById("nch-" + a.dataset.nch); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }); });
  var chs = els(".nch", nv), cur = 0;
  var pn = el(".nv-pn", nv), pt = el(".nv-pt", nv), sheet = el(".nv-sheet", nv);
  // a lens can hide whole chapters: the picker counts and steps through only the ones on screen
  function shown() { return chs.filter(function (c) { return getComputedStyle(c).display !== "none"; }); }
  function go(i) { var t = chs[Math.max(0, Math.min(chs.length - 1, i))]; if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function step(d) {
    var v = shown(), k = v.indexOf(chs[cur]);
    if (k < 0) { k = v.findIndex(function (c) { return chs.indexOf(c) > cur; }); k = k < 0 ? v.length - 1 : d > 0 ? k - 1 : k; }
    var t = v[Math.max(0, Math.min(v.length - 1, k + d))]; if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function mark(i) {
    cur = i;
    var v = shown(), k = v.indexOf(chs[i]);
    links.forEach(function (a) { a.classList.toggle("on", +a.dataset.nch === i); });
    if (pn) {
      pn.textContent = "Chapter " + (i + 1) + (v.length < chs.length && k >= 0 ? " · " + (k + 1) + " of " + v.length + " shown" : " of " + chs.length);
      pt.textContent = (el("h3", chs[i]) || {}).textContent || "";
    }
    els("[data-go]", nv).forEach(function (b) { b.classList.toggle("on", +b.dataset.go === i); });
    var pv = el(".nv-prev", nv), nx = el(".nv-next", nv);
    if (pv) pv.disabled = k <= 0; if (nx) nx.disabled = k < 0 || k >= v.length - 1;
  }
  function refreshPicker() {
    if (!chs) return;
    var v = shown();
    links.forEach(function (a) { var c = chs[+a.dataset.nch]; a.hidden = v.indexOf(c) < 0; });
    els("[data-go]", nv).forEach(function (b) { b.hidden = v.indexOf(chs[+b.dataset.go]) < 0; });
    mark(v.indexOf(chs[cur]) >= 0 || !v.length ? cur : chs.indexOf(v[0]));
  }
  function openSheet(on) {
    if (!sheet) return;
    var M = window.Motion, still = matchMedia("(prefers-reduced-motion: reduce)").matches, box = el(".nv-sh-in", sheet);
    if (on) {
      sheet.hidden = false; document.body.style.overflow = "hidden";
      var cb = el('[data-go="' + cur + '"]', sheet); if (cb) cb.scrollIntoView({ block: "center" });
      if (M && !still) { M.animate(box, { transform: ["translateY(100%)", "translateY(0)"] }, { type: "spring", bounce: 0, duration: 0.4 }); M.animate(el(".nv-sh-bg", sheet), { opacity: [0, 1] }, { duration: 0.2 }); }
    } else {
      document.body.style.overflow = "";
      if (M && !still) M.animate(box, { transform: "translateY(100%)" }, { duration: 0.22, ease: [0.23, 1, 0.32, 1] }).then(function () { sheet.hidden = true; });
      else sheet.hidden = true;
    }
  }
  var pk = el(".nv-pk", nv);
  if (pk) {
    pk.addEventListener("click", function () { openSheet(true); });
    el(".nv-prev", nv).addEventListener("click", function () { step(-1); });
    el(".nv-next", nv).addEventListener("click", function () { step(1); });
    el(".nv-sh-bg", nv).addEventListener("click", function () { openSheet(false); });
    el(".nv-sh-x", nv).addEventListener("click", function () { openSheet(false); });
    els("[data-go]", nv).forEach(function (b) { b.addEventListener("click", function () { openSheet(false); go(+b.dataset.go); }); });
    document.addEventListener("keydown", function esc(e) { if (!document.body.contains(nv)) return document.removeEventListener("keydown", esc); if (e.key === "Escape" && !sheet.hidden) openSheet(false); });
  }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (x) { if (x.isIntersecting) mark(chs.indexOf(x.target)); });
  }, { rootMargin: "-30% 0px -60% 0px" });
  chs.forEach(function (c) { io.observe(c); });
  refreshPicker();
}

/* ══════════ cut-offs: every year SSC has published ══════════
   Public page. Data: data/cutoffs.json, researched from SSC's result notices
   and cross-checked; values that could not be verified are left out. */
var CUT = null, cutCat = "UR", cutGroup = 0;
var CUT_CATS = ["UR", "OBC", "EWS", "SC", "ST", "ESM", "OH", "HH", "VH", "PwD-Others"];
function cutLine(rows, cat) {
  var pts = rows.filter(function (r) { return r.cutoffs && r.cutoffs[cat] != null; }).map(function (r) { return { x: r.year, y: +r.cutoffs[cat], max: r.max || 200 }; });
  if (pts.length < 2) return '<p class="cut-none">Not enough verified years for this category to draw a trend.</p>';
  var W = 760, H = 280, L = 44, R = 20, T = 20, B = 36;
  var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  var y0 = Math.floor((Math.min.apply(null, ys) - 10) / 10) * 10, y1 = Math.ceil((Math.max.apply(null, ys) + 10) / 10) * 10;
  var X = function (v) { return L + (x1 === x0 ? 0 : (v - x0) / (x1 - x0)) * (W - L - R); };
  var Y = function (v) { return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); };
  var grid = "", tk = [];
  for (var g = y0; g <= y1; g += (y1 - y0 > 60 ? 20 : 10)) tk.push(g);
  tk.forEach(function (g) { grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text x="' + (L - 8) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g + '</text>'; });
  var d = pts.map(function (p, i) { return (i ? "L" : "M") + X(p.x).toFixed(1) + " " + Y(p.y).toFixed(1); }).join(" ");
  var area = d + " L" + X(pts[pts.length - 1].x).toFixed(1) + " " + (H - B) + " L" + X(pts[0].x).toFixed(1) + " " + (H - B) + " Z";
  return '<svg class="cut-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + h(cat) + ' Tier 1 cut-off by year">' +
    '<g class="cg">' + grid + '</g><path class="ca" d="' + area + '"/><path class="cl" d="' + d + '" pathLength="1"/>' +
    pts.map(function (p) { return '<g class="cp"><circle cx="' + X(p.x) + '" cy="' + Y(p.y) + '" r="5"/><text x="' + X(p.x) + '" y="' + (Y(p.y) - 12) + '" text-anchor="middle">' + (+p.y).toFixed(p.y % 1 ? 1 : 0) + '</text>' +
      '<text class="cx" x="' + X(p.x) + '" y="' + (H - 12) + '" text-anchor="middle">' + p.x + '</text></g>'; }).join("") + '</svg>';
}
V["cutoffs"] = function () {
  if (!CUT) {
    fetch("data/cutoffs.json?v=" + DATAV).then(function (r) { return r.json(); }).then(function (j) { CUT = j; route(); }).catch(function () { CUT = { tier1: [], final: [], stats: [] }; route(); });
    return '<div class="boot" style="padding-top:60px"><div class="skel"></div><div class="skel"></div></div>';
  }
  var T1 = CUT.tier1 || [];
  var groups = []; T1.forEach(function (r) { var g = r.group || "All posts"; if (groups.indexOf(g) < 0) groups.push(g); });
  // the group most years report in comes first
  var ORD = ["All other posts", "JSO", "SI Gr. II", "AAO"];
  groups.sort(function (a, b) { return (ORD.indexOf(a) + 1 || 99) - (ORD.indexOf(b) + 1 || 99); });
  if (cutGroup >= groups.length) cutGroup = 0;
  var G = groups[cutGroup], rows = T1.filter(function (r) { return (r.group || "All posts") === G; }).sort(function (a, b) { return a.year - b.year; });
  var cats = CUT_CATS.filter(function (c) { return rows.some(function (r) { return r.cutoffs && r.cutoffs[c] != null; }); });
  if (cats.indexOf(cutCat) < 0) cutCat = cats[0] || "UR";
  var vals = rows.filter(function (r) { return r.cutoffs[cutCat] != null; }).map(function (r) { return { y: r.year, v: +r.cutoffs[cutCat] }; });
  var last3 = vals.slice(-3), hi = vals.slice().sort(function (a, b) { return b.v - a.v; })[0], lo = vals.slice().sort(function (a, b) { return a.v - b.v; })[0];
  var avg3 = last3.length ? last3.reduce(function (a, x) { return a + x.v; }, 0) / last3.length : 0;
  var FC = G === "All other posts" ? cutForecast(cutCat) : null;
  var target = FC ? Math.ceil(FC.hi + 5) : last3.length ? Math.ceil(Math.max.apply(null, last3.map(function (x) { return x.v; })) + 10) : null;
  var latest = vals[vals.length - 1], prev = vals[vals.length - 2];
  var fmt = function (v) { return v == null ? "–" : (+v).toFixed(+v % 1 ? 2 : 0); };
  var GL = { "All other posts": "All other posts (ASO, Inspectors, Auditors and the rest)", JSO: "JSO", "SI Gr. II": "Statistical Investigator Gr. II", AAO: "AAO (until CGL 2023)" };
  return '<section class="head"><span class="kicker">Cut-off analysis</span>' +
      '<h1 class="page-h">SSC CGL cut-offs, Tier 1 and final.</h1>' +
      '<p class="lede">Two different cut-offs decide your result: the Tier 1 mark that gets you into Tier 2, and the final Tier 2 mark that gets you the post. Both, for every year since 2017, with a 2026 estimate.</p>' +
      '<nav class="cut-jump"><a href="#cut-how">How it works</a><a href="#cut-t1">Tier 1 by year</a><a href="#cut-26">2026 estimate</a><a href="#cut-final">Final, by post</a><a href="#cut-marks">Where the marks come from</a></nav></section>' +
    cutIntroHTML() +
    '<section class="band" id="cut-t1"><span class="kicker">Step 1 · out of 200</span><h2 class="sec-h" style="margin-top:6px">Tier 1 cut-off, by year</h2>' +
    '<p class="cut-note" style="margin:8px 0 12px">The marks of the last candidate shortlisted for Tier 2. SSC sets one per post list: pick the list your post is in, then your category.</p>' +
    (groups.length > 1 ? '<div class="cut-groups" role="tablist" aria-label="Post list">' + groups.map(function (g, i) { return '<button data-cg="' + i + '" aria-selected="' + (i === cutGroup) + '">' + h(GL[g] || g) + '</button>'; }).join("") + '</div>' : '') +
    '<div class="cut-cats" role="tablist" aria-label="Category">' + cats.map(function (c) { return '<button data-cc="' + h(c) + '" aria-selected="' + (c === cutCat) + '">' + h(c) + '</button>'; }).join("") + '</div>' +
    '<section class="cut-top">' +
      '<div class="cut-chart"><div class="cut-ch"><b>' + h(cutCat) + '</b><span>' + h(G) + ' · out of ' + ((rows[0] && rows[0].max) || 200) + '</span></div>' + cutLine(rows, cutCat) + '</div>' +
      '<div class="cut-ins">' +
        (target ? '<div class="ci ci-t"><span>Aim for</span><b>' + target + '+</b><p>Ten marks above the highest ' + h(cutCat) + ' cut-off of the last three years. Normalised scores move from year to year, so a margin matters.</p></div>' : '') +
        (latest ? '<div class="ci"><span>Latest, ' + latest.y + '</span><b>' + fmt(latest.v) + '</b><p>' + (prev ? (latest.v >= prev.v ? 'Up ' : 'Down ') + Math.abs(latest.v - prev.v).toFixed(1) + ' from ' + prev.y + '.' : '') + '</p></div>' : '') +
        (avg3 ? '<div class="ci"><span>Last three years, average</span><b>' + avg3.toFixed(1) + '</b><p>' + last3.map(function (x) { return x.y + ': ' + fmt(x.v); }).join(" · ") + '</p></div>' : '') +
        (hi && lo ? '<div class="ci"><span>Range</span><b>' + fmt(lo.v) + '–' + fmt(hi.v) + '</b><p>Lowest ' + lo.y + ', highest ' + hi.y + '.</p></div>' : '') +
      '</div>' +
    '</section>' +
    '<h3 class="sec-h" style="font-size:21px;margin-top:26px">All categories, all years</h3>' +
      '<div class="nt-scroll cut-table"><table><thead><tr><th>Year</th>' + cats.map(function (c) { return '<th' + (c === cutCat ? ' class="on"' : '') + '>' + h(c) + '</th>'; }).join("") + '</tr></thead><tbody>' +
        rows.slice().reverse().map(function (r) { var fix = /revised|corrected/i.test(r.label || "") ? ' <small class="cut-fix" title="' + h(r.label) + '">revised</small>' : ''; return '<tr><th scope="row">' + h(r.exam || ("CGL " + r.year)) + fix + '</th>' + cats.map(function (c) { return '<td' + (c === cutCat ? ' class="on"' : '') + '>' + fmt(r.cutoffs[c]) + '</td>'; }).join("") + '</tr>'; }).join("") +
      '</tbody></table></div>' +
      '<details class="cut-about"><summary>About these numbers</summary><p class="cut-note">' + h(CUT.note || "") + '</p></details>' +
    '</section>' +
    '<div id="cut-26">' + forecastHTML(cutCat, G) + '</div>' +
    ((CUT.stats || []).length ? '<section class="band"><h2 class="sec-h">How competitive each year was</h2><div class="nt-scroll cut-table"><table><thead><tr><th>Exam</th><th>Vacancies</th><th>Appeared in Tier 1</th><th>Shortlisted from Tier 1</th><th>Shortlisted per vacancy</th><th>Finally selected</th></tr></thead><tbody>' +
      CUT.stats.slice().sort(function (a, b) { return b.year - a.year; }).map(function (x) {
        var n = function (v) { return v ? (+v).toLocaleString("en-IN") : "–"; };
        return '<tr><th scope="row">CGL ' + x.year + '</th><td>' + n(x.vacancies) + '</td><td>' + n(x.appeared_t1) + '</td><td>' + n(x.qualified_total) + '</td><td>' + (x.vacancies && x.qualified_total ? (x.qualified_total / x.vacancies).toFixed(1) + ' : 1' : '–') + '</td><td>' + n(x.recommended) + '</td></tr>'; }).join("") +
      '</tbody></table></div><p class="cut-note">Appeared figures are shown only where SSC published them.</p></section>' : '') +
    finalHTML() + cutMarksHTML() +
    '<p class="cut-src">Sources: ' + T1.concat(CUT.final || []).map(function (r) { return r.source; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).slice(0, 12).map(function (u, i) { return '<a href="' + h(u) + '" target="_blank" rel="noopener">[' + (i + 1) + ']</a>'; }).join(" ") + '</p>' +
    foot();
};
/* CGL 2026 forecast for "All other posts": anchor on 2025 (the first year of
   SSC's current normalisation), move it by the historical relationship between
   vacancies and cut-off (least squares on ln vacancies, normalised years
   2018 onward), and widen by the spread that relationship leaves unexplained. */
function cutForecast(cat) {
  var Y = CUT.y2026, S = CUT.stats || [];
  if (!Y) return null;
  var vac = {}; S.forEach(function (x) { vac[x.year] = x.vacancies; });
  var rows = (CUT.tier1 || []).filter(function (r) { return r.group === "All other posts" && r.year >= 2018 && r.cutoffs[cat] != null && vac[r.year]; });
  if (rows.length < 5) return null;
  var pts = rows.map(function (r) { return { x: Math.log(vac[r.year]), y: +r.cutoffs[cat], year: r.year, v: vac[r.year] }; });
  var n = pts.length, mx = 0, my = 0; pts.forEach(function (p) { mx += p.x / n; my += p.y / n; });
  var sxx = 0, sxy = 0, sst = 0; pts.forEach(function (p) { sxx += (p.x - mx) * (p.x - mx); sxy += (p.x - mx) * (p.y - my); sst += (p.y - my) * (p.y - my); });
  var b = sxy / sxx, a = my - b * mx, sse = 0;
  pts.forEach(function (p) { var e = p.y - (a + b * p.x); sse += e * e; });
  var sd = Math.sqrt(sse / (n - 2)), r2 = 1 - sse / sst;
  var last = pts.filter(function (p) { return p.year === 2025; })[0] || pts[pts.length - 1];
  var x26 = Math.log(Y.vacancies);
  var anchor = last.y + b * (x26 - last.x), reg = a + b * x26;
  var lo = Math.min(anchor, reg) - sd * 0.5, hi = Math.max(anchor, reg) + sd * 0.5;
  // shortlist size: vacancies times the recent shortlist-per-vacancy ratio
  var recent = S.filter(function (x) { return x.year >= 2023 && x.vacancies && x.qualified_total; });
  var ratio = recent.reduce(function (s2, x) { return s2 + x.qualified_total / x.vacancies; }, 0) / (recent.length || 1);
  var s25 = S.filter(function (x) { return x.year === 2025; })[0] || {};
  return { est: anchor, lo: lo, hi: hi, b: b, r2: r2, sd: sd, n: n, pts: pts, last: last, ratio: ratio,
    shortlist: Math.round(Y.vacancies * ratio / 1000) * 1000, s25: s25, Y: Y };
}
function forecastHTML(cat, group) {
  if (group !== "All other posts") return "";
  var F = cutForecast(cat);
  if (!F) return '<section class="band fc"><h2 class="sec-h">CGL 2026: what to expect</h2><p class="cut-note">Not enough verified years in this category for a vacancy-based estimate.</p></section>';
  var Y = F.Y, v25 = F.s25.vacancies, dv = v25 ? Math.round((Y.vacancies - v25) / v25 * 100) : 0;
  var n = function (v) { return (+v).toLocaleString("en-IN"); };
  // scatter: vacancies (log) against cut-off, with 2026 as a range bar
  var W = 760, H = 300, L = 48, R = 24, T = 24, B = 40;
  var xs = F.pts.map(function (p) { return p.x; }).concat([Math.log(Y.vacancies)]), ys = F.pts.map(function (p) { return p.y; }).concat([F.lo, F.hi]);
  var x0 = Math.min.apply(null, xs) - 0.1, x1 = Math.max.apply(null, xs) + 0.1, y0 = Math.floor((Math.min.apply(null, ys) - 6) / 10) * 10, y1 = Math.ceil((Math.max.apply(null, ys) + 6) / 10) * 10;
  var X = function (v) { return L + (v - x0) / (x1 - x0) * (W - L - R); }, Yp = function (v) { return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); };
  var grid = ""; for (var g = y0; g <= y1; g += 10) grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Yp(g) + '" y2="' + Yp(g) + '"/><text x="' + (L - 8) + '" y="' + (Yp(g) + 4) + '" text-anchor="end">' + g + '</text>';
  [5000, 10000, 20000, 40000].forEach(function (v) { var lx = Math.log(v); if (lx > x0 && lx < x1) grid += '<text x="' + X(lx) + '" y="' + (H - 10) + '" text-anchor="middle">' + (v / 1000) + 'k</text>'; });
  var fit = '<line class="fc-fit" x1="' + X(x0) + '" y1="' + Yp(F.b * x0 + (F.est - F.b * Math.log(Y.vacancies))) + '" x2="' + X(x1) + '" y2="' + Yp(F.b * x1 + (F.est - F.b * Math.log(Y.vacancies))) + '"/>';
  var x26 = X(Math.log(Y.vacancies));
  var dots = F.pts.map(function (p) {
    var near = Math.abs(X(p.x) - x26) < 40;   // keep clear of the 2026 marker
    return '<g class="fc-p"><circle cx="' + X(p.x) + '" cy="' + Yp(p.y) + '" r="5.5"/><text x="' + (X(p.x) + (near ? 10 : 0)) + '" y="' + (Yp(p.y) + (near ? 20 : -11)) + '" text-anchor="' + (near ? 'start' : 'middle') + '">' + p.year + '</text></g>'; }).join("");
  var bar = '<g class="fc-26"><rect x="' + (x26 - 9) + '" y="' + Yp(F.hi) + '" width="18" height="' + (Yp(F.lo) - Yp(F.hi)) + '" rx="9"/><circle cx="' + x26 + '" cy="' + Yp(F.est) + '" r="6"/><text x="' + (x26 + 16) + '" y="' + (Yp(F.est) + 4) + '">2026</text></g>';
  return '<section class="band fc"><span class="kicker">Vacancy-based analysis</span><h2 class="sec-h" style="margin-top:6px">CGL 2026: what to expect</h2>' +
    '<div class="fc-cards">' +
      '<div class="ci"><span>2026 vacancies</span><b>' + n(Y.vacancies) + '</b><p>' + (dv ? (dv < 0 ? Math.abs(dv) + '% fewer' : dv + '% more') + ' than 2025 (' + n(v25) + '). The notification said about ' + n(Y.notified) + '; SSC\'s list of 24.09.2026 is the later figure.' : '') + '</p></div>' +
      (Y.byCat && Y.byCat[cat] ? '<div class="ci"><span>' + h(cat) + ' vacancies</span><b>' + n(Y.byCat[cat]) + '</b><p>Of the 2026 total, as on 24.09.2026.</p></div>' : '') +
      '<div class="ci"><span>Likely Tier 2 shortlist</span><b>~' + n(F.shortlist) + '</b><p>At about ' + F.ratio.toFixed(1) + ' candidates per vacancy, SSC\'s ratio in 2023 to 2025. It was ' + n(F.s25.qualified_total || 0) + ' in 2025: fewer seats means a higher bar.</p></div>' +
      '<div class="ci ci-t"><span>Expected ' + h(cat) + ' cut-off, all other posts</span><b>~' + F.est.toFixed(0) + '</b><p>Likely range ' + F.lo.toFixed(0) + ' to ' + F.hi.toFixed(0) + '. Aim for ' + Math.ceil(F.hi + 5) + '+ to be safe.</p></div>' +
    '</div>' +
    '<div class="cut-chart fc-chart"><div class="cut-ch"><b>Vacancies and the ' + h(cat) + ' cut-off</b><span>each dot is a year, 2018 to 2025</span></div>' +
      '<svg class="cut-svg fc-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Vacancies against cut-off"><g class="cg">' + grid + '</g>' + fit + dots + bar + '</svg></div>' +
    '<details class="cut-about"><summary>How this is estimated, and how far to trust it</summary><div class="cut-note">' +
      '<p>We start from the 2025 cut-off (' + F.last.y.toFixed(2) + '), because 2025 was the first year of SSC\'s current normalisation method, which 2026 will also use. We then move it by how cut-offs have responded to vacancies since 2018: roughly ' + Math.abs(F.b * Math.log(1.3)).toFixed(1) + ' marks for every 30% change in vacancies, fewer vacancies meaning a higher cut-off.</p>' +
      '<p>Vacancies explain only about ' + Math.round(Math.max(0, F.r2) * 100) + '% of the year-to-year movement in this category. The rest comes from how hard the paper was and from changes in normalisation, which no one can know in advance. The range is widened by half the spread the vacancy relationship leaves unexplained (±' + (F.sd / 2).toFixed(0) + ' marks).</p>' +
      '<p>2026 also brings the new 15-minute sectional timing, which may lower raw scores. Treat this as a planning estimate, not a prediction. Vacancy source: <a href="' + h(Y.source) + '" target="_blank" rel="noopener">SSC tentative vacancies, 24.09.2026</a>.</p>' +
    '</div></details>' +
  '</section>';
}
var cutPost = 0;
function postOf(p) {
  if (/Section Officer/i.test(p)) return "Assistant Section Officer";
  if (/Income Tax/i.test(p)) return "Income Tax Inspector";
  if (/Excise|CGST/i.test(p)) return "Excise / CGST Inspector";
  if (/Junior Statistical/i.test(p)) return "JSO";
  if (/Statistical Investigator/i.test(p) && /post code/i.test(p)) return "SI Gr. II";
  return null;
}
function finalHTML() {
  var F = CUT.final || [], cats = ["UR", "OBC", "EWS", "SC", "ST"];
  var fmt = function (v) { return v == null ? "–" : (+v).toFixed(+v % 1 ? 2 : 0); };
  var posts = [];
  F.forEach(function (r) { var k = postOf(r.post || ""); if (k && posts.indexOf(k) < 0) posts.push(k); });
  if (cutPost >= posts.length) cutPost = 0;
  var P = posts[cutPost];
  var sel = F.filter(function (r) { return postOf(r.post || "") === P; }).sort(function (a, b) { return b.year - a.year; });
  var stage = F.filter(function (r) { return !postOf(r.post || ""); }).sort(function (a, b) { return b.year - a.year || String(a.post).localeCompare(String(b.post)); });
  function table(rows, withPost) {
    return '<div class="nt-scroll cut-table"><table><thead><tr><th>Exam</th>' + (withPost ? '<th>Stage and posts</th>' : '') + '<th>Out of</th>' + cats.map(function (c) { return '<th>' + c + '</th>'; }).join("") + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><th scope="row">' + h(r.exam || ("CGL " + r.year)) + '</th>' + (withPost ? '<td class="cut-l">' + h(r.post || "") + '</td>' : '') + '<td>' + (r.max || "–") + '</td>' +
        cats.map(function (c) { return '<td>' + fmt((r.cutoffs || {})[c]) + '</td>'; }).join("") + '</tr>'; }).join("") + '</tbody></table></div>';
  }
  return (posts.length ? '<section class="band" id="cut-final"><span class="kicker">Step 2 · out of 390, or 590 with Paper II</span><h2 class="sec-h" style="margin-top:6px">Final cut-off, post by post</h2><p class="cut-note" style="margin:8px 0 14px">Marks of the last candidate selected for the post. Since CGL 2022 this is Tier 2 alone; Tier 1 marks no longer count. The total changed from 700 to 390 (590 for JSO and SI) when the pattern changed in 2022.</p>' +
      '<div class="cut-groups" role="tablist">' + posts.map(function (x, i) { return '<button data-cp="' + i + '" aria-selected="' + (i === cutPost) + '">' + h(x) + '</button>'; }).join("") + '</div>' + table(sel, false) + '</section>' : '') +
    (stage.length ? '<section class="band"><h2 class="sec-h">Tier 2 stage and qualifying cut-offs</h2><p class="cut-note" style="margin:8px 0 14px">Before posts are allotted, SSC applies a Tier 2 cut-off to every candidate (and, from CGL 2025, a minimum in each section). Until CGL 2021 this stage was scored on Tier 1 plus Tier 2 together.</p>' + table(stage, true) + '</section>' : '');
}
/* which cut-off applies to which post, in one card row and one table */
function cutIntroHTML() {
  var F = CUT.final || [], T1 = CUT.tier1 || [];
  var fmt = function (v) { return v == null ? "–" : (+v).toFixed(+v % 1 ? 2 : 0); };
  var t1 = function (g) { var r = T1.filter(function (x) { return x.group === g && x.year === 2025; })[0]; return r ? fmt(r.cutoffs.UR) : "–"; };
  var fin = function (re) { var r = F.filter(function (x) { return x.year === 2025 && re.test(x.post || ""); })[0]; return r ? fmt((r.cutoffs || {}).UR) : "–"; };
  var POSTS = [
    ["Assistant Section Officer (CSS, MEA, Railways, IB and others)", "All other posts", "Paper I", "390", t1("All other posts"), fin(/Section Officer/)],
    ["Inspector of Income Tax", "All other posts", "Paper I", "390", t1("All other posts"), fin(/Income Tax/)],
    ["Inspector, Central Excise / CGST / Preventive / Examiner", "All other posts", "Paper I", "390", t1("All other posts"), fin(/Excise/)],
    ["Auditor, Accountant, Tax Assistant, UDC, SSA and other Group C posts", "All other posts", "Paper I", "390", t1("All other posts"), "post-wise, below the Inspector posts"],
    ["Junior Statistical Officer (JSO)", "JSO", "Paper I + Paper II (Statistics)", "590", t1("JSO"), fin(/Junior Statistical/)],
    ["Statistical Investigator Gr. II", "SI Gr. II", "Paper I + Paper II (Statistics)", "590", t1("SI Gr. II"), fin(/Statistical Investigator/)],
    ["Assistant Audit / Accounts Officer (AAO, AAcO)", "All other posts", "Paper I + Paper III (Finance)", "590", t1("All other posts"), "no AAO vacancy since CGL 2023"]
  ];
  return '<section class="band" id="cut-how"><h2 class="sec-h">How the two cut-offs work</h2>' +
    '<div class="cut-how">' +
      '<div class="ci"><span>Step 1 · Tier 1 cut-off</span><b>out of 200</b><p>Decides who sits Tier 2. SSC sets a separate one for each post list (JSO, SI Gr. II, all other posts) and each category. Since 2022 these marks count for nothing else.</p></div>' +
      '<div class="ci"><span>Step 2 · Final cut-off</span><b>out of 390 or 590</b><p>Decides the post. It is the Tier 2 total of the last candidate selected for that post: 390 from Paper I, plus 200 from Paper II (JSO, SI) or Paper III (AAO).</p></div>' +
      '<div class="ci"><span>Also · Section minimums</span><b>30% · 25% · 20%</b><p>UR, OBC/EWS and other categories must clear a minimum in every Tier 2 section, and Computer Knowledge and typing are qualifying. Miss one and the total does not matter.</p></div>' +
    '</div>' +
    '<h3 class="sec-h" style="font-size:21px;margin-top:26px">Which cut-off applies to your post</h3>' +
    '<div class="nt-scroll cut-table"><table><thead><tr><th>Post</th><th>Tier 1 list</th><th>Tier 2 papers</th><th>Final total</th><th>Tier 1 UR 2025</th><th>Final UR 2025</th></tr></thead><tbody>' +
      POSTS.map(function (r) { return '<tr><th scope="row" class="cut-l">' + h(r[0]) + '</th><td class="cut-l">' + h(r[1]) + '</td><td class="cut-l">' + h(r[2]) + '</td><td>' + r[3] + '</td><td>' + h(r[4]) + '</td><td class="cut-l">' + h(r[5]) + '</td></tr>'; }).join("") +
    '</tbody></table></div><p class="cut-note">Tier 1 figures are the "all other posts" list unless the post has its own; final figures are the last UR candidate selected in CGL 2025 (result of 14.05.2026).</p></section>';
}
function cutMarksHTML() {
  var rows = [
    ["Tier 1 (qualifying)", "Reasoning 50 · GA 50 · Quant 50 · English 50", "200", "Shortlist only"],
    ["Tier 2 Paper I, Section I", "Maths 90 · Reasoning 90", "180", "Merit"],
    ["Tier 2 Paper I, Section II", "English 135 · General Awareness 75", "210", "Merit"],
    ["Tier 2 Paper I, Section III", "Computer Knowledge 60 · Typing test", "60", "Qualifying"],
    ["Tier 2 Paper II (JSO, SI)", "Statistics 100 questions", "200", "Merit for those posts"],
    ["Tier 2 Paper III (AAO)", "Finance and Economics 100 questions", "200", "Merit for those posts"]
  ];
  return '<section class="band" id="cut-marks"><h2 class="sec-h">Where the marks come from</h2>' +
    '<p class="cut-note" style="margin:8px 0 14px">English alone is 135 of the 390 merit marks, more than a third. Maths and Reasoning are 90 each and GA 75. In Tier 1 the four sections weigh the same, 50 each.</p>' +
    '<div class="nt-scroll cut-table"><table><thead><tr><th>Stage</th><th>Modules and marks</th><th>Total</th><th>Counts for</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><th scope="row" class="cut-l">' + r[0] + '</th><td class="cut-l">' + r[1] + '</td><td>' + r[2] + '</td><td class="cut-l">' + r[3] + '</td></tr>'; }).join("") +
    '</tbody></table></div><p class="cut-note">Tier 1: +2 per right answer, −0.50 per wrong. Paper I: +3 / −1. Papers II and III: +2 / −0.50. Topic-wise weightage inside each section is on the <a href="#/analysis">analysis page</a> and, for Tier 2, under <a href="#/tier2">Tier 2</a>.</p></section>';
}
function wireCutoffs() {
  els(".cut-jump a").forEach(function (a) { a.addEventListener("click", function (e) { var t = document.getElementById(a.getAttribute("href").slice(1)); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: "smooth", block: "start" }); } }); });
  els("[data-cc]").forEach(function (b) { b.addEventListener("click", function () { var y = scrollY; cutCat = b.dataset.cc; route(); scrollTo(0, y); }); });
  els("[data-cg]").forEach(function (b) { b.addEventListener("click", function () { var y = scrollY; cutGroup = +b.dataset.cg; route(); scrollTo(0, y); }); });
  els("[data-cp]").forEach(function (b) { b.addEventListener("click", function () { var y = scrollY; cutPost = +b.dataset.cp; route(); scrollTo(0, y); }); });
  var l = el(".cut-svg .cl");
  if (l && window.Motion && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.Motion.animate(l, { strokeDashoffset: [1, 0] }, { duration: 0.9, ease: [0.23, 1, 0.32, 1] });
    window.Motion.animate(els(".cut-svg .cp"), { opacity: [0, 1] }, { delay: window.Motion.stagger(0.06, { startDelay: 0.3 }), duration: 0.3 });
  }
}

/* ══════════ Tier 2 ══════════
   Data: data/t2meta.json (public: scheme, targets, weightage, plan rules,
   paper list, free paper) and, for premium, /api/data t2-<n> (papers) and
   t2notes. Scoring follows the 2026 scheme: +3 / -1 in Paper I modules,
   +2 / -0.5 in Paper II (Statistics). Maths, Reasoning, English and GA make
   the 390-mark merit total; Computer Knowledge is qualifying. */
var T2 = { meta: null, papers: null, notes: null, loading: null };
var T2MOD = {
  M: { name: "Mathematical Abilities", short: "Maths", min: 30, plus: 3, minus: 1, merit: true },
  R: { name: "Reasoning and General Intelligence", short: "Reasoning", min: 30, plus: 3, minus: 1, merit: true },
  E: { name: "English Language and Comprehension", short: "English", min: 40, plus: 3, minus: 1, merit: true },
  G: { name: "General Awareness", short: "GA", min: 20, plus: 3, minus: 1, merit: true },
  C: { name: "Computer Knowledge", short: "Computer", min: 15, plus: 3, minus: 1, merit: false },
  S: { name: "Statistics (Paper II)", short: "Statistics", min: 120, plus: 2, minus: 0.5, merit: true },
  F: { name: "Finance and Economics (Paper III)", short: "Paper III", min: 120, plus: 2, minus: 0.5, merit: true }
};
function t2Load() {
  if (T2.meta && (T2.papers || !isPremium())) return Promise.resolve();
  if (T2.loading) return T2.loading;
  var get = function (f) {
    return fetch("/api/data?f=" + f + "&v=" + DATAV, { headers: { Authorization: "Bearer " + (AU && AU.token) } })
      .then(function (r) { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); });
  };
  T2.loading = fetch("data/t2meta.json?v=" + DATAV).then(function (r) { return r.json(); }).then(function (m) {
    T2.meta = m;
    T2.papers = m.free ? [m.free] : [];
    T2.notes = m.freeNotes || {};
    if (!isPremium()) return;
    var parts = []; for (var i = 1; i <= (m.chunks || 0); i++) parts.push(get("t2-" + i));
    return Promise.all([Promise.all(parts), get("t2notes").catch(function () { return {}; })]).then(function (r) {
      var all = []; r[0].forEach(function (c) { all = all.concat(c); });
      T2.papers = all; T2.notes = r[1] || {};
    });
  }).catch(function (e) { console.error("tier 2:", e); T2.meta = T2.meta || { papers: [] }; })
    .then(function () { T2.loading = null; });
  return T2.loading;
}
function t2Paper(id) { return (T2.papers || []).filter(function (p) { return p.id === id; })[0]; }
function t2Open(id) { return isPremium() || (T2.meta && T2.meta.free && T2.meta.free.id === id); }
function t2Mods(p) {
  var seen = []; p.qs.forEach(function (q) { if (seen.indexOf(q.s) < 0) seen.push(q.s); });
  return ["M", "R", "E", "G", "C", "S", "F"].filter(function (k) { return seen.indexOf(k) >= 0; });
}
function t2Score(p, a) {
  var by = {}, merit = 0, meritMax = 0;
  t2Mods(p).forEach(function (k) { by[k] = { right: 0, wrong: 0, total: 0, marks: 0, max: 0 }; });
  p.qs.forEach(function (q) {
    var b = by[q.s], m = T2MOD[q.s] || T2MOD.M, v = a.ans[q.id];
    b.total++; b.max += m.plus;
    if (v == null) return;
    if (q.a != null && v === q.a) { b.right++; b.marks += m.plus; } else if (q.a != null) { b.wrong++; b.marks -= m.minus; }
  });
  Object.keys(by).forEach(function (k) { if (T2MOD[k].merit) { merit += by[k].marks; meritMax += by[k].max; } });
  return { by: by, merit: merit, meritMax: meritMax };
}
function t2Att(id) { return ST.att[id]; }
function t2Wait(render) {
  if (T2.meta && (T2.papers || !isPremium()) && !T2.loading) return render();
  t2Load().then(route);
  return '<div class="boot" style="padding-top:60px"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
}

V["tier2"] = function (a1, a2, a3) {
  if (a1 === "mock") return t2Wait(function () { return a3 === "run" ? t2Run(a2) : a3 === "result" ? t2Result(a2) : a3 === "review" ? t2Review(a2) : a3 === "practice" ? t2PaperPractice(a2) : t2Intro(a2); });
  if (a1 === "practice") return t2Wait(function () { return t2TopicPractice(a2, a3 ? decodeURIComponent(a3) : null); });
  if (a1 === "notes") return t2Wait(function () { return t2Notes(a2, a3); });
  if (a1 === "typing") return t2Typing();
  if (a1 === "plan") return t2Wait(t2PlanView);
  return t2Wait(t2Hub);
};

var t2Tab = (function () { try { return localStorage.getItem("cgl-t2tab") || "over"; } catch (e) { return "over"; } })();
function t2ShowTab() {
  els("[data-hp]").forEach(function (x) { x.hidden = x.dataset.hp !== t2Tab; });
  els("[data-hpb]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.hpb === t2Tab)); });
}
function wireT2Hub() {
  els("[data-hpb]").forEach(function (b) { b.addEventListener("click", function () {
    t2Tab = b.dataset.hpb; try { localStorage.setItem("cgl-t2tab", t2Tab); } catch (e) {}
    t2ShowTab(); var nav = el(".t2nav"); if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: "start" });
  }); });
  els("[data-vt]").forEach(function (b) { b.addEventListener("click", function () { els("[data-vt]").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); }); els("[data-vp]").forEach(function (x) { x.hidden = x.dataset.vp !== b.dataset.vt; }); }); });
  if (el("[data-hp]")) t2ShowTab();
}

function t2Hub() {
  setTimeout(t2ShowTab, 0);
  var M = T2.meta || {}, P = (M.papers || []), n = function (v) { return (+v).toLocaleString("en-IN"); };
  var p1 = P.filter(function (p) { return p.paper === "I"; }), p2 = P.filter(function (p) { return p.paper === "II"; }), p3 = P.filter(function (p) { return p.paper === "III"; });
  function card(p) {
    var a = t2Att(p.id), open = t2Open(p.id), done = a && a.done, sc = done ? t2Score(t2Paper(p.id) || { qs: [] }, a) : null;
    return '<a class="t2p' + (open ? '' : ' locked') + '" href="#/tier2/mock/' + encodeURIComponent(p.id) + '">' +
      '<span class="t2p-y">CGL ' + p.year + (p.paper === "II" ? ' · Statistics' : p.paper === "III" ? ' · Paper III' : '') + '</span><b>' + h(p.date_label || p.label) + '</b>' +
      '<span class="t2p-m">' + p.n + ' questions' + (p.shift ? ' · ' + h(p.shift) : '') + '</span>' +
      (sc && t2Paper(p.id) ? '<span class="t2p-s">' + sc.merit.toFixed(0) + ' / ' + sc.meritMax + '</span>' : open ? '<span class="t2p-go">Start' + arr() + '</span>' : '<span class="t2p-go">' + LOCK + ' Premium</span>') + '</a>';
  }
  var W = M.weightage || {};
  var modCards = ["M", "R", "E", "G", "C"].map(function (k) {
    var tops = (W[k] || []).slice(0, 6), max = tops.length ? tops[0].q : 1;
    return '<article class="t2w"><header><b>' + T2MOD[k].short + '</b><span>' + (k === "E" ? 45 : k === "G" ? 25 : k === "C" ? 20 : 30) + ' questions · ' + T2MOD[k].min + ' min</span></header>' +
      '<ul>' + tops.map(function (t) { return '<li><span>' + h(t.label) + '</span><i><em style="width:' + Math.round(t.q / max * 100) + '%"></em></i><b>' + t.q.toFixed(1) + '</b></li>'; }).join("") + '</ul></article>';
  }).join("");
  var notes = (M.notes || []);
  var T = M.targets || {};
  var PL = M.plan || {};
  return '<section class="head"><span class="kicker">SSC CGL 2026 · Tier 2</span>' +
      '<h1 class="page-h">Tier 2, from the paper up.</h1>' +
      '<p class="lede">Every Tier 2 paper since the new pattern, run under the 2026 timers and marking, practice by topic, notes for every Tier 2 subject including Computer Knowledge, Statistics and Paper III, lessons to watch, and a plan built for the post you want.</p></section>' +
    '<div class="t2cta"><a class="btn key big" href="#/tier2/plan">' + (t2Prof() ? 'Open my Tier 2 plan' : 'Build my Tier 2 plan') + arr() + '</a><a class="btn quiet big" href="#/tier2/typing">Typing trainer' + arr() + '</a></div>' +
    '<nav class="t2nav" role="tablist" aria-label="Tier 2">' + [["over", "Overview"], ["mocks", "Mocks"], ["prac", "Practice"], ["notes", "Notes"], ["vids", "Videos"]].map(function (t) { return '<button role="tab" data-hpb="' + t[0] + '" aria-selected="' + (t2Tab === t[0]) + '">' + t[1] + '</button>'; }).join("") + '</nav>' +
    '<section class="t2-top" data-hp="over">' +
      '<div class="t2-when"><span>Tier 2 is expected</span><b>' + h((M.dates && M.dates.tier2) || "December 2026") + '</b><p>SSC says tentative. The last two cycles were held in mid-January, so plan for December and use any extra weeks for mocks.</p></div>' +
      '<div class="t2-tg"><span>To be selected, UR, CGL 2025</span>' + (T.rows || []).map(function (r) { return '<div><b>' + r[1] + '</b><em>' + h(r[0]) + '</em></div>'; }).join("") + '<p>Last selected candidate, out of 390.</p></div>' +
    '</section>' +
    '<section class="band" data-hp="over"><h2 class="sec-h">The paper</h2>' +
      '<div class="nt-scroll cut-table"><table><thead><tr><th>Module</th><th>Questions</th><th>Marks</th><th>Time</th><th>Wrong answer</th><th>Counts for</th></tr></thead><tbody>' +
        (M.scheme || []).map(function (r) { return '<tr><th scope="row" style="text-align:left">' + h(r.name) + '</th><td>' + h(r.q) + '</td><td>' + h(r.marks) + '</td><td>' + h(r.time) + '</td><td>' + h(r.neg) + '</td><td class="' + (/merit/i.test(r.counts) ? 'on' : '') + '">' + h(r.counts) + '</td></tr>'; }).join("") +
      '</tbody></table></div>' +
      '<p class="cut-note">' + h(M.schemeNote || "") + '</p></section>' +
    '<section class="band" data-hp="over"><h2 class="sec-h">Where the marks come from</h2><p class="cut-note t2-sub">Average questions per paper, from every official Tier 2 paper since 2022.</p><div class="t2ws">' + modCards + '</div></section>' +
    '<section class="band" data-hp="mocks"><h2 class="sec-h">Paper I mocks</h2><p class="cut-note t2-sub">Real Tier 2 papers, 2022 to 2025, with the 2026 sectional timers: Maths 30, Reasoning 30, English 40, GA 20, Computer 15 minutes. +3 for a right answer, -1 for a wrong one.</p>' +
      '<div class="t2ps">' + (p1.length ? p1.map(card).join("") : '<p class="cut-note">Papers are being added.</p>') + '</div></section>' +
    (p2.length ? '<section class="band" data-hp="mocks"><h2 class="sec-h">Paper II · Statistics</h2><p class="cut-note t2-sub">For JSO and Statistical Investigator. 100 questions in 2 hours, +2 and -0.5.</p><div class="t2ps">' + p2.map(card).join("") + '</div></section>' : '') +
    (p3.length ? '<section class="band" data-hp="mocks"><h2 class="sec-h">Paper III · Finance and Economics</h2><p class="cut-note t2-sub">For AAO and AAcO. 100 questions in 2 hours, +2 and -0.5.</p><div class="t2ps">' + p3.map(card).join("") + '</div></section>' : '') +
    '<section class="band" data-hp="prac"><h2 class="sec-h">Practise by topic</h2><p class="cut-note t2-sub">Every question from every Tier 2 paper, grouped by topic. Untimed, with answers as you go.</p>' +
      '<div class="t2tabs" role="tablist">' + ["M", "R", "E", "G", "C", "S", "F"].filter(function (k) { return ((M.tags || {})[k] || []).length; }).map(function (k, i) { return '<button role="tab" data-tt="' + k + '" aria-selected="' + (i === 0) + '">' + T2MOD[k].short + '</button>'; }).join("") + '</div>' +
      ["M", "R", "E", "G", "C", "S", "F"].filter(function (k) { return ((M.tags || {})[k] || []).length; }).map(function (k, i) {
        return '<div class="t2tp" data-tp="' + k + '"' + (i ? ' hidden' : '') + '>' + M.tags[k].map(function (t) {
          return '<a href="#/tier2/practice/' + k + '/' + encodeURIComponent(t[0]) + '"><span>' + h(t[0]) + '</span><b>' + t[1] + '</b></a>'; }).join("") + '</div>'; }).join("") +
    '</section>' +
    (Object.keys(M.videos || {}).length ? '<section class="band" data-hp="vids"><h2 class="sec-h">Lessons to watch</h2><p class="cut-note t2-sub">Checked Tier 2 playlists and paper walkthroughs. They play here.</p>' +
      '<div class="t2tabs">' + [["M", "Maths"], ["R", "Reasoning"], ["E", "English"], ["G", "GA"], ["C", "Computer"], ["X", "Strategy"]].filter(function (g) { return ((M.videos || {})[g[0]] || []).length; }).map(function (g, i) { return '<button data-vt="' + g[0] + '" aria-selected="' + (i === 0) + '">' + g[1] + '</button>'; }).join("") + '</div>' +
      [["M"], ["R"], ["E"], ["G"], ["C"], ["X"]].filter(function (g) { return ((M.videos || {})[g[0]] || []).length; }).map(function (g, i) {
        return '<div class="vids t2vids" data-vp="' + g[0] + '"' + (i ? ' hidden' : '') + '>' + M.videos[g[0]].map(function (x) { return vidHTML(x); }).join("") + '</div>'; }).join("") + '</section>' : '') +
    '<section class="band" data-hp="notes"><h2 class="sec-h">Tier 2 notes</h2>' +
      [["C", "Computer Knowledge"], ["M", "Tier 2 Maths"], ["R", "Tier 2 Reasoning"], ["E", "Tier 2 English"], ["G", "Tier 2 General Awareness"], ["S", "Paper II · Statistics"], ["F", "Paper III · Finance and Economics"]].map(function (g) {
        var list = notes.filter(function (x) { return x.s === g[0]; });
        if (!list.length) return '';
        return '<h3 class="t2nh">' + g[1] + ' <small>' + list.length + '</small></h3><div class="t2ns">' + list.map(function (x) { var open = isPremium() || (M.freeNotes && M.freeNotes[x.s + "|" + x.t]);
          return '<a class="t2n' + (open ? '' : ' locked') + '" href="#/tier2/notes/' + x.s + '/' + encodeURIComponent(x.t) + '"><b>' + h(x.t) + '</b>' + (open ? '' : LOCK) + '</a>'; }).join("") + '</div>';
      }).join("") +
      '<p class="cut-note">Maths, Reasoning, English and GA use the complete notes in <a href="#/learn">Learn</a>; Tier 2 asks the same topics at more depth.</p></section>' +
    '<section class="band" data-hp="over"><h2 class="sec-h">Typing test (DEST)</h2><div class="t2dest"><div><p>About 2,000 key depressions in 15 minutes, English. Qualifying only, but you cannot be selected without it. Practise one passage a day.</p>' +
      '<a class="btn key" href="#/tier2/typing">Open the typing trainer' + arr() + '</a></div><div class="t2dk"><b>2,000</b><span>key depressions</span><b>15</b><span>minutes</span><b>8,000</b><span>per hour</span></div></div></section>' +
    (PL.weeks ? '<section class="band" data-hp="over"><h2 class="sec-h">How the weeks before Tier 2 are split</h2><p class="cut-note t2-sub">Start the day after your Tier 1 shift, not after the result. Pick the length that fits your date.</p>' +
      '<div class="t2plan">' + PL.weeks.map(function (w) {
        return '<article><header><b>' + w.len + ' weeks</b></header><ol>' + w.phases.map(function (f) {
          var s = (PL.split || {})[f.phase] || {};
          return '<li><span class="t2ph">' + h(f.phase) + ' · weeks ' + f.weeks[0] + (f.weeks.length > 1 ? '-' + f.weeks[f.weeks.length - 1] : '') + '</span>' +
            '<div class="t2bar">' + ["maths", "english", "reasoning", "ga", "computer", "dest", "tests"].map(function (k) { return s[k] ? '<i class="c-' + k + '" style="flex:' + s[k] + '" title="' + k + ' ' + Math.round(s[k] * 100) + '%"></i>' : ''; }).join("") + '</div>' +
            '<small>' + (PL.mocks && PL.mocks[f.phase] ? PL.mocks[f.phase] + ' full mocks a week' : '') + '</small></li>'; }).join("") + '</ol></article>'; }).join("") + '</div>' +
      '<div class="t2key">' + ["maths", "english", "reasoning", "ga", "computer", "dest", "tests"].map(function (k) { return '<span><i class="c-' + k + '"></i>' + ({ ga: "GA", dest: "Typing", tests: "Mocks and analysis" }[k] || k[0].toUpperCase() + k.slice(1)) + '</span>'; }).join("") + '</div></section>' : '') +
    foot();
}

function t2Intro(id) {
  var p = t2Paper(id), meta = ((T2.meta || {}).papers || []).filter(function (x) { return x.id === id; })[0];
  if (!p && !meta) return blank();
  var label = (p || meta).label, a = t2Att(id);
  if (!t2Open(id)) return '<section class="head"><a class="kicker" href="#/tier2">&#8592; Tier 2</a><h1 class="page-h">' + h(label) + '</h1></section>' +
    upsell("Every Tier 2 paper since 2022", "The Exam Pass opens all Tier 2 mocks, including CGL 2025, the Statistics paper and the notes.") + foot();
  var mods = t2Mods(p);
  var total = mods.reduce(function (s, k) { return s + T2MOD[k].min; }, 0);
  return '<section class="head"><a class="kicker" href="#/tier2">&#8592; Tier 2</a><h1 class="page-h">' + h(label) + '</h1>' +
    '<p class="lede">' + p.qs.length + ' questions in ' + total + ' minutes. Each module has its own timer and locks when it ends, as in the 2026 exam.</p></section>' +
    '<div class="t2mods">' + mods.map(function (k) { var c = p.qs.filter(function (q) { return q.s === k; }).length;
      return '<div><b>' + T2MOD[k].short + '</b><span>' + c + ' questions · ' + T2MOD[k].min + ' min</span><em>+' + T2MOD[k].plus + ' / -' + T2MOD[k].minus + (T2MOD[k].merit ? '' : ' · qualifying') + '</em></div>'; }).join("") + '</div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:26px">' +
      '<a class="btn key big" href="#/tier2/mock/' + encodeURIComponent(id) + '/run">' + (a && !a.done ? 'Resume the mock' : a && a.done ? 'Sit it again' : 'Start the timed mock') + arr() + '</a>' +
      '<a class="btn quiet big" href="#/tier2/mock/' + encodeURIComponent(id) + '/practice">Practise untimed' + arr() + '</a>' +
      (a && a.done ? '<a class="btn quiet big" href="#/tier2/mock/' + encodeURIComponent(id) + '/result">Last result' + arr() + '</a>' : '') + '</div>' + foot();
}

function t2Run(id) {
  var p = t2Paper(id); if (!p || !t2Open(id)) return blank();
  var mods = t2Mods(p), a = ST.att[id];
  if (!a || a.done || a.mode !== "t2") { a = ST.att[id] = { mode: "t2", ans: {}, sec: 0, secEnd: 0, done: false, ts: Date.now() }; save(); }
  if (a.secEnd && Date.now() - a.secEnd > 3 * 36e5) a.secEnd = 0;
  while (a.secEnd && a.secEnd <= Date.now() && a.sec < mods.length) { var ended = a.secEnd; a.sec++; a.i = 0; a.secEnd = a.sec < mods.length ? ended + T2MOD[mods[a.sec]].min * 60000 : 0; }
  function finishAll() { a.done = true; a.ts = Date.now(); save(); location.hash = "#/tier2/mock/" + encodeURIComponent(id) + "/result"; }
  if (a.sec >= mods.length) { a.sec = mods.length - 1; setTimeout(finishAll, 0); return '<div class="blank"><b>Time is up</b><p>Scoring your paper.</p></div>'; }
  var k = mods[a.sec], m = T2MOD[k], qs = p.qs.filter(function (q) { return q.s === k; });
  if (!a.secEnd) a.secEnd = Date.now() + m.min * 60000;
  save();
  a.mk = a.mk || {}; a.vis = a.vis || {}; a.tq = a.tq || {};
  setAside("");
  return examHall({
    qs: qs, title: p.label, sub: "SSC CGL · Tier 2 · Module " + (a.sec + 1) + " of " + mods.length + " · " + m.min + " min",
    secName: m.name, plus: m.plus, minus: m.minus, exit: "#/tier2/mock/" + encodeURIComponent(id),
    secs: mods.map(function (x, j) { return { short: T2MOD[x].short, st: j < a.sec ? "gone" : j === a.sec ? "on" : "next" }; }),
    finLabel: a.sec < mods.length - 1 ? "Submit " + m.short : "Submit paper",
    lockNote: a.sec < mods.length - 1 ? "Once submitted you cannot come back to " + m.short + ". The next module starts its own clock." : "This ends the paper and scores it.",
    get: function (j) { var v = a.ans[qs[j].id]; return v == null ? null : v; },
    set: function (j, v) { if (v == null) delete a.ans[qs[j].id]; else a.ans[qs[j].id] = v; save(); },
    getMark: function (j) { return !!a.mk[qs[j].id]; }, setMark: function (j, b) { if (b) a.mk[qs[j].id] = 1; else delete a.mk[qs[j].id]; save(); },
    visited: function (j) { return !!a.vis[qs[j].id]; }, markVisited: function (j) { if (!a.vis[qs[j].id]) { a.vis[qs[j].id] = 1; save(); } },
    timeOn: function (j) { return a.tq[qs[j].id] || 0; }, addTime: function (j, ms) { a.tq[qs[j].id] = (a.tq[qs[j].id] || 0) + ms; },
    startAt: function () { return a.i || 0; }, onMove: function (j) { a.i = j; save(); },
    deadline: function () { return a.secEnd; },
    submit: function () {
      if (a.sec >= mods.length - 1) return finishAll();
      a.sec++; a.secEnd = 0; a.i = 0; save(); setTimeout(route, 0);
    }
  });
}

function t2PaperPractice(id) {
  var p = t2Paper(id); if (!p || !t2Open(id)) return t2Intro(id);
  return t2Practice(p.qs.map(function (q) { return Object.assign({ src: T2MOD[q.s] ? T2MOD[q.s].short : "" }, q); }), "#/tier2/mock/" + encodeURIComponent(id), p.label,
    '<div class="t2ph-h"><b>Practice mode</b><span>No timer, the answer and explanation show as soon as you pick. Your mock score is not affected.</span></div>');
}

function t2Result(id) {
  var p = t2Paper(id), a = t2Att(id); if (!p || !a || !a.done) return blank();
  var s = t2Score(p, a), T = (T2.meta || {}).targets || {}, stats = p.paper === "II";
  var minPct = 0.3;
  return '<section class="head"><a class="kicker" href="#/tier2">&#8592; Tier 2</a>' +
    '<h1 class="page-h">' + s.merit.toFixed(0) + ' of ' + s.meritMax + '</h1>' +
    '<p class="lede">' + (stats ? 'Statistics paper, +2 and -0.5.' : 'Merit marks: Maths, Reasoning, English and GA. ' +
      ((T.rows || []).length ? 'Last UR candidate selected in CGL 2025: ' + T.rows.map(function (r) { return r[0] + ' ' + r[1]; }).join(", ") + '.' : '')) + '</p></section>' +
    '<div class="stats">' + Object.keys(s.by).map(function (k) {
      var b = s.by[k], m = T2MOD[k], ok = b.marks >= b.max * minPct;
      return '<div class="stat"><div class="k">' + m.short + (m.merit ? '' : ' · qualifying') + '</div><div class="v">' + b.marks.toFixed(k === "S" ? 1 : 0) + '<small> / ' + b.max + '</small></div>' +
        '<div class="s">' + b.right + ' right · ' + b.wrong + ' wrong · ' + (b.total - b.right - b.wrong) + ' blank · <span class="' + (ok ? 't2ok' : 't2no') + '">' + (ok ? 'above' : 'below') + ' the 30% UR minimum</span></div></div>';
    }).join("") + '</div>' +
    '<div style="display:flex;gap:10px;margin-top:26px;flex-wrap:wrap"><a class="btn key" href="#/tier2/mock/' + encodeURIComponent(id) + '/review">Review every answer' + arr() + '</a><a class="btn quiet" href="#/tier2">All Tier 2 mocks' + arr() + '</a></div>' + foot();
}

function t2Review(id) {
  var p = t2Paper(id), a = t2Att(id) || { ans: {} }; if (!p) return blank();
  var host = quiz({
    qs: p.qs, back: "#/tier2/mock/" + encodeURIComponent(id) + "/result", backLabel: "Result",
    get: function (j) { var v = a.ans[p.qs[j].id]; return v == null ? null : v; },
    set: function () {}, locked: true,
    done: function () { location.hash = "#/tier2/mock/" + encodeURIComponent(id) + "/result"; }
  });
  setAside(host.__pads());
  return host;
}

function t2Notes(s, t) {
  t = decodeURIComponent(t || "");
  var N = (T2.notes || {})[s + "|" + t];
  if (!N) {
    if (!isPremium()) return '<section class="head"><a class="kicker" href="#/tier2">&#8592; Tier 2</a><h1 class="page-h">' + h(t) + '</h1></section>' + upsell("Tier 2 notes", "The Exam Pass opens the Computer Knowledge and Statistics notes.") + foot();
    return blank();
  }
  return '<div class="study"><section class="head"><a class="kicker" href="#/tier2">&#8592; Tier 2 · ' + (s === "C" ? "Computer Knowledge" : "Statistics") + '</a>' +
    '<h1 class="page-h">' + h(t) + '</h1>' + (N.why ? '<p class="lede">' + h(N.why) + '</p>' : '') + '</section>' +
    '<section class="band tstep"><h2 class="sec-h">Learn</h2>' + notesV4(N) + '</section>' +
    ((N.formulas || []).length ? '<section class="band tstep"><h2 class="sec-h">Formulas and rules</h2><div class="fxg">' + N.formulas.map(function (f) { return '<div class="fxc"><code>' + h(f.f) + '</code>' + (f.note ? '<span>' + h(f.note) + '</span>' : '') + '</div>'; }).join("") + '</div></section>' : '') +
    ((N.examples || []).length ? '<section class="band tstep"><h2 class="sec-h">Worked examples</h2><div class="exs">' + N.examples.map(function (e) { return '<div class="note"><p><b>' + h(e.q) + '</b></p><p class="t2ans">Answer: ' + h(e.a) + '</p><p>' + h(e.how) + '</p></div>'; }).join("") + '</div></section>' : '') +
    ((N.revise || []).length ? '<section class="band tstep"><h2 class="sec-h">Last-day revision</h2><ul class="pts">' + N.revise.map(function (x) { return '<li>' + h(x) + '</li>'; }).join("") + '</ul></section>' : '') +
    (N.facts && N.facts.length ? '<section class="band tstep">' + factsHTML(N.facts) + '</section>' : '') +
    '</div>' + foot();
}

/* ── the typing test: SSC's DEST, 15 minutes, about 2,000 key depressions.
   Scored the way the notice describes: a full mistake for a word omitted,
   added or wrongly typed, half a mistake for spacing, capitals or
   punctuation; the error rate is mistakes over words in the passage. ── */
var DEST = [
  "The Staff Selection Commission conducts the Combined Graduate Level Examination every year to recruit officers for many departments of the Government of India. Candidates who clear the written stages are also tested on their ability to enter data quickly and accurately, because a large part of office work today is done on computers. In the data entry speed test, a candidate is given a passage in English and has fifteen minutes to type it. The passage has about two thousand key depressions, which works out to eight thousand key depressions in an hour. Accuracy matters as much as speed. A word that is left out, added or typed wrongly counts as a full mistake, while an error of spacing, capital letters or punctuation counts as half a mistake. The test is qualifying in nature, so the marks are not added to the merit, but a candidate who does not clear it cannot be selected for posts that require it. Regular practice for about twenty minutes a day is usually enough to build a steady rhythm. It helps to keep the eyes on the passage rather than on the keyboard, to sit upright with the wrists relaxed, and to type at an even pace instead of rushing in bursts. When a mistake is noticed, it is often better to continue than to go back, because correcting a long stretch of text wastes precious time. With a few weeks of daily practice, most candidates find that the test becomes comfortable and that their speed on the computer improves in every other part of their work as well.",
  "Good governance depends on records that are complete, accurate and easy to find. When a citizen applies for a certificate, a pension or a licence, the file passes through several offices, and each office adds information to it. If the data is entered carelessly, the file may be delayed for weeks, and the citizen may have to visit the office again and again. This is why government departments value officers who can type correctly and quickly. Digital records have made many services faster. A person can now apply online, pay fees through the internet and track the progress of an application from home. Yet the quality of these services still depends on the people who handle the data at every stage. A single wrong digit in an account number or a date of birth can cause serious trouble later. Officers are therefore trained to check their work, to follow a standard format and to keep sensitive information safe. Passwords should never be shared, computers should be locked when they are not in use, and suspicious emails should be reported instead of opened. These simple habits protect both the office and the public. For a candidate preparing for the examination, typing practice is also a chance to build these habits early. Reading each sentence carefully, typing it at a steady speed and checking the result before moving on is exactly what good office work requires. The speed will come with practice, and the accuracy will make that speed useful."
];
var destState = null;
function t2Typing() {
  var k = destState ? destState.k : 0;
  return '<section class="head"><a class="kicker" href="#/tier2">&#8592; Tier 2</a><h1 class="page-h">Typing trainer</h1>' +
    '<p class="lede">SSC\'s Data Entry Speed Test: type the passage in 15 minutes. Full mistake for a word omitted, added or mistyped; half a mistake for spacing, capitals or punctuation.</p></section>' +
    '<div class="dest">' +
      '<div class="dest-bar"><div class="cut-cats">' + DEST.map(function (_, i) { return '<button data-dp="' + i + '" aria-selected="' + (i === k) + '">Passage ' + (i + 1) + '</button>'; }).join("") + '</div>' +
        '<span class="dest-clock" id="dclk">15:00</span></div>' +
      '<div class="dest-src" id="dsrc">' + h(DEST[k]) + '</div>' +
      '<textarea id="dtxt" class="dest-in" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" placeholder="Start typing to start the clock"></textarea>' +
      '<div class="dest-act"><button class="btn key" id="dend">Finish and score</button><button class="btn quiet" id="dreset">Start over</button></div>' +
      '<div id="dres" aria-live="polite"></div>' +
    '</div>' + foot();
}
function destScore(src, typed) {
  var S = src.trim().split(/\s+/), T = typed.trim() ? typed.trim().split(/\s+/) : [];
  var norm = function (w) { return w.toLowerCase().replace(/[^a-z0-9]/g, ""); };
  // align words by longest common subsequence on normalised words
  var n = S.length, m = T.length, L = [];
  for (var i = 0; i <= n; i++) { L.push(new Uint16Array(m + 1)); }
  for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) L[i][j] = norm(S[i]) === norm(T[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  var full = 0, half = 0, reached = 0; i = 0; j = 0;
  while (i < n && j < m) {
    if (norm(S[i]) === norm(T[j])) { if (S[i] !== T[j]) half++; i++; j++; reached = i; }
    else if (L[i + 1][j + 1] === L[i][j]) { full++; i++; j++; reached = i; }   // mistyped: one word, one mistake
    else if (L[i + 1][j] >= L[i][j + 1]) { full++; i++; }   // omitted
    else { full++; j++; }                                  // added
  }
  full += m - j;   // words typed after the passage ended
  var words = Math.max(reached, 1);
  return { full: full, half: half, words: words, err: (full + half / 2) / words * 100, kd: typed.length };
}
function wireTyping() {
  var ta = el("#dtxt"); if (!ta) return;
  destState = destState || { k: 0 };
  var start = 0, iv = null, clk = el("#dclk"), res = el("#dres");
  function stop() { clearInterval(iv); iv = null; }
  function finish() {
    stop(); ta.disabled = true;
    var sec = start ? Math.min(900, (Date.now() - start) / 1000) : 0, r = destScore(DEST[destState.k], ta.value);
    var kdph = sec ? Math.round(r.kd / sec * 3600) : 0;
    res.innerHTML = '<div class="stats" style="margin-top:18px">' +
      '<div class="stat"><div class="k">Speed</div><div class="v">' + (sec >= 30 ? kdph.toLocaleString("en-IN") + '<small> KD/hour</small>' : '<small>type for longer</small>') + '</div><div class="s">' + r.kd + ' key depressions in ' + Math.floor(sec / 60) + ' min ' + Math.round(sec % 60) + ' s. Target 8,000.</div></div>' +
      '<div class="stat"><div class="k">Error rate</div><div class="v">' + r.err.toFixed(1) + '%</div><div class="s">' + r.full + ' full, ' + r.half + ' half mistakes over ' + r.words + ' words. Limits: UR 20%, OBC/EWS 25%, others 30%; posts with higher standards used 5%, 7% and 10% in 2025.</div></div></div>';
  }
  ta.addEventListener("input", function () {
    if (!start) {
      start = Date.now();
      iv = setInterval(function () {
        var left = Math.max(0, 900 - Math.floor((Date.now() - start) / 1000));
        clk.textContent = Math.floor(left / 60) + ":" + ("0" + left % 60).slice(-2);
        if (!left) finish();
        if (!document.body.contains(ta)) stop();
      }, 250);
    }
  });
  ta.addEventListener("paste", function (e) { e.preventDefault(); });
  el("#dend").addEventListener("click", finish);
  el("#dreset").addEventListener("click", function () { stop(); route(); });
  els("[data-dp]").forEach(function (b) { b.addEventListener("click", function () { stop(); destState.k = +b.dataset.dp; route(); }); });
}

/* ══════════ Tier 2 plan generator ══════════
   Built from what you are aiming for. The target post sets the score to beat
   and which papers are in play (Paper II for JSO/SI, Paper III for AAO/AAcO,
   given time in proportion to their marks). Topics come in order of Tier 2
   weight (questions per paper x 3 marks) scaled by your weakness: your own
   Tier 1 accuracy on the topic, your Tier 2 mock scores by module, and the
   modules you mark weak. Each topic is a learn block (its notes and lesson
   video), a Tier 2 PYQ block on that topic, then short spaced revisions 3 and
   10 days later. Full mocks follow the research cadence and use the real
   papers; Computer Knowledge gets a 14-day block then timed sets. */
var T2AIMS = {
  iti: { short: "Income Tax Inspector", label: "Income Tax Inspector", target: 342, extra: null },
  aso: { short: "ASO", label: "ASO, Central Secretariat", target: 331, extra: null },
  cei: { short: "Excise / GST Inspector", label: "Central Excise / GST Inspector", target: 319, extra: null },
  any: { short: "Paper I posts", label: "Any Paper I post", target: 320, extra: null },
  jso: { short: "JSO / SI", label: "JSO or Statistical Investigator", target: null, extra: "S" },
  aao: { short: "AAO / AAcO", label: "AAO or AAcO (Audit / Accounts Officer)", target: null, extra: "F" }
};
function t2Prof() { ST.t2 = ST.t2 || {}; return ST.t2.profile || null; }
function ymdOf(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function dateOf(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
var T2ALIAS = {
  "Non-verbal figures": "R|Pattern & Figure Completion", "Word formation / order": "R|Word Arrangement",
  "Geography + Census 2011": "G|Geography", "Govt schemes": "G|Current Affairs", "Environment": "G|Geography",
  "Homonyms": "E|Synonyms", "Ages": "Q|Algebra", "Inequality": "R|Mathematical Operations"
};
var T1SEC = { M: "Q", R: "R", E: "E", G: "G" };
function t2Words(s) { return String(s).toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(function (w) { return w.length > 2 && !/^(and|the|for|with|tier|level|how|asks)$/.test(w); }); }
function t2Sim(a, b) { var A = t2Words(a), B = t2Words(b); if (!A.length || !B.length) return 0; var n = A.filter(function (w) { return B.some(function (x) { return x.indexOf(w) === 0 || w.indexOf(x) === 0; }); }).length; return n / Math.min(A.length, B.length); }
/* where a plan topic lives: its notes page, its lesson video, and its Tier 2 PYQs */
function t2Resolve(k, label) {
  var out = { learn: null, practice: null, video: false, name: label };
  var notes = ((T2.meta || {}).notes || []).filter(function (n) { return n.s === k && !/Tier 2 asks|tier2-pattern/i.test(n.t); });
  var best = null, bs = 0;
  notes.forEach(function (n) { var sc = t2Sim(label, n.t); if (sc > bs) { bs = sc; best = n; } });
  var t1 = T1SEC[k];
  if (t1) {
    var key = T2ALIAS[label] || (D.notes && D.notes[t1 + "|" + label] ? t1 + "|" + label : null);
    if (!key && D.meta && D.meta.notes) { var bk = null, b2 = 0; Object.keys(D.meta.notes).forEach(function (x) { if (x.indexOf(t1 + "|") === 0) { var sc = t2Sim(label, x.slice(2)); if (sc > b2) { b2 = sc; bk = x; } } }); if (b2 >= 0.6) key = bk; }
    if (key && !(best && bs >= 0.8)) { var kk = key.split("|"); out.learn = learnHref(kk[0], kk[1]); out.video = !!(D.topicvideos || {})[key]; out.name = kk[1]; }
  }
  if (!out.learn && best && bs >= 0.5) out.learn = "#/tier2/notes/" + k + "/" + encodeURIComponent(best.t);
  var tags = ((T2.meta || {}).tags || {})[k] || [], bt = null, ts = 0;
  tags.forEach(function (t) { var sc = t2Sim(label, t[0]); if (sc > ts) { ts = sc; bt = t; } });
  if (bt && ts >= 0.5) out.practice = "#/tier2/practice/" + k + "/" + encodeURIComponent(bt[0]);
  return out;
}
function t2Topics(k) {
  var W = ((T2.meta || {}).weightage || {})[k];
  if (W && W.length) return W.map(function (x) { return { t: x.label, q: x.q }; });
  if (k === "S" || k === "F") {
    var tg = ((T2.meta || {}).tags || {})[k] || [], per = ((T2.meta || {}).papers || []).filter(function (p) { return p.paper === (k === "S" ? "II" : "III"); }).length || 1;
    return tg.map(function (x) { return { t: x[0], q: x[1] / per }; });
  }
  return [];
}
/* your weakness on a module, 0 (strong) to 1 (weak), from what the site knows about you */
function t2Weak(k, P) {
  var w = 0.5, n = 0, acc = 0;
  if (T1SEC[k]) topicStats().forEach(function (x) { if (x.s === T1SEC[k] && x.done >= 5) { acc += x.right / x.done; n++; } });
  if (n) w = 1 - acc / n;
  var ms = ((T2.papers || []).filter(function (p) { var a = ST.att[p.id]; return a && a.done; })).map(function (p) { var s = t2Score(p, ST.att[p.id]).by[k]; return s && s.max ? Math.max(0, s.marks) / s.max : null; }).filter(function (x) { return x != null; });
  if (ms.length) w = (w + (1 - ms.reduce(function (a, b) { return a + b; }, 0) / ms.length)) / 2;
  if ((P.weak || []).indexOf(k) >= 0) w = Math.max(w, 0.75);
  return w;
}
function t2BuildPlan(P) {
  var start = dateOf(P.start), end = dateOf(P.exam);
  if (!start || !end || end <= start) return null;
  var aim = T2AIMS[P.aim] || T2AIMS.any, extra = aim.extra;
  var N = Math.round((end - start) / 864e5);
  var mins = Math.round((+P.hours || 7) * 60);
  var cut = [0.35, 0.65, 0.85].map(function (f) { return Math.round(N * f); });
  var phaseOf = function (d) { return d < cut[0] ? "foundation" : d < cut[1] ? "practice" : d < cut[2] ? "speed" : "revision"; };
  var perWeek = ((T2.meta || {}).plan || {}).mocks || { foundation: 1, practice: 2, speed: 3, revision: 4 };
  var NAME = { M: "Maths", R: "Reasoning", E: "English", G: "GA", C: "Computer", S: "Statistics", F: "Paper III" };
  var MARKS = { M: 90, R: 90, E: 135, G: 75 };
  var mods = ["M", "R", "E", "G"].concat(extra ? [extra] : []);
  // module time shares: marks x (0.6 + weakness); a Paper II / III takes about its share of 590
  var weakOf = {}, share = {}, tot = 0;
  mods.forEach(function (k) { weakOf[k] = t2Weak(k, P); share[k] = (k === extra ? 200 : MARKS[k]) * (0.6 + weakOf[k]); tot += share[k]; });
  mods.forEach(function (k) { share[k] /= tot; });
  // topic queues: Tier 2 weight x (0.6 + weakness), heaviest first
  var queue = {};
  mods.forEach(function (k) {
    queue[k] = t2Topics(k).map(function (x) { return { t: x.t, pr: x.q * 3 * (0.6 + weakOf[k]) }; }).sort(function (a, b) { return b.pr - a.pr; });
  });
  var qi = {}; mods.forEach(function (k) { qi[k] = 0; });
  var p1 = ((T2.meta || {}).papers || []).filter(function (p) { return p.paper === "I"; }).slice().reverse();
  var px = ((T2.meta || {}).papers || []).filter(function (p) { return extra && p.paper === (extra === "S" ? "II" : "III"); }).slice().reverse();
  var m1 = 0, mx = 0, revs = {}, days = [];
  function addRev(day, k, t) { (revs[day] = revs[day] || []).push({ k: k, t: t }); }
  for (var d = 0; d < N; d++) {
    var date = new Date(start.getTime() + d * 864e5), ph = phaseOf(d), tasks = [], used = 0;
    if (d === N - 1) {
      tasks.push({ k: "rev", what: "Light revision only: formulas, your error log and last-day lists. Sleep early.", m: Math.min(mins, 150), why: "The day before" });
      days.push({ ymd: ymdOf(date), ph: ph, tasks: tasks }); continue;
    }
    var every = Math.max(1, Math.round(7 / (perWeek[ph] || 1)));
    var mockDay = d >= 4 && d % every === 1 && d < N - 2;
    if (mockDay) {
      var useX = extra && px.length && (m1 + mx) % 3 === 2;
      var mp = useX ? px[mx++ % px.length] : (p1.length ? p1[m1++ % p1.length] : null);
      tasks.push({ k: "mock", what: (useX ? NAME[extra] + " full paper: " : "Full Paper I mock: ") + (mp ? mp.label : "") + (useX ? " (2 h)" : " (2 h 15 min)") + ", then review every miss", m: useX ? 180 : 255,
        link: mp ? "#/tier2/mock/" + encodeURIComponent(mp.id) : "#/tier2", why: ph === "revision" ? "Final rehearsal" : "Mock rhythm for the " + ph + " phase" });
      used += tasks[0].m;
    }
    var rest = Math.max(60, mins - used);
    // spaced revision due today
    (revs[d] || []).slice(0, 3).forEach(function (r) {
      var L = t2Resolve(r.k, r.t);
      tasks.push({ k: r.k, what: NAME[r.k] + " · Revise " + L.name, m: 20, link: L.learn || L.practice, why: "Spaced revision" }); rest -= 20;
    });
    mods.forEach(function (k) {
      var m = Math.round(rest * share[k] / 5) * 5;
      if (m < 20) return;
      if (ph === "foundation" || ph === "practice") {
        var q = queue[k]; if (!q.length) return;
        var x = q[qi[k] % q.length]; qi[k]++;
        var L = t2Resolve(k, x.t);
        var learnM = ph === "foundation" ? Math.round(m * 0.55 / 5) * 5 : Math.round(m * 0.3 / 5) * 5;
        tasks.push({ k: k, what: NAME[k] + " · Learn " + L.name + (L.video ? " (notes and the lesson video)" : " (notes)"), m: learnM, link: L.learn || ("#/tier2"), why: "About " + x.pr.toFixed(0) + " weighted marks a paper" + (weakOf[k] >= 0.6 ? ", and a weak module for you" : "") });
        tasks.push({ k: k, what: NAME[k] + " · Tier 2 questions on " + L.name, m: m - learnM, link: L.practice || L.learn || "#/tier2", why: "Real Tier 2 PYQs, untimed with answers" });
        addRev(d + 3, k, x.t); addRev(d + 10, k, x.t);
      } else if (ph === "speed") {
        tasks.push({ k: k, what: NAME[k] + " · Mixed Tier 2 questions against the clock, then review", m: m, link: "#/tier2/practice/" + k, why: "Speed under the " + (T2MOD[k] ? T2MOD[k].min : 30) + "-minute timer" });
      } else {
        tasks.push({ k: k, what: NAME[k] + " · Weakest topics and your mistakes", m: m, link: "#/tier2/practice/" + k, why: "Close the last gaps" });
      }
    });
    // Computer Knowledge: qualifying, but a fail ends the attempt
    var cNotes = ((T2.meta || {}).notes || []).filter(function (n) { return n.s === "C"; });
    if (d < 14 && cNotes.length) { var cn = cNotes[d % cNotes.length]; tasks.push({ k: "C", what: "Computer · " + cn.t, m: 30, link: "#/tier2/notes/C/" + encodeURIComponent(cn.t), why: "Qualifying: at least 18 of 60 for UR" }); }
    else if (d % 4 === 2) tasks.push({ k: "C", what: "Computer · 20 questions in 15 minutes from a real paper", m: 25, link: "#/tier2/practice/C", why: "Keep the qualifying module safe" });
    if (d % 7 === 6) tasks.push({ k: "err", what: "Weekly review: redo every question you got wrong this week", m: 45, link: "#/errors", why: "Mistakes repeat unless revisited" });
    var total = tasks.reduce(function (s2, t) { return s2 + t.m; }, 0);
    if (total > mins) {
      var flex = tasks.filter(function (t) { return t.k !== "mock"; }), fs = flex.reduce(function (s2, t) { return s2 + t.m; }, 0), over = total - mins;
      flex.forEach(function (t) { t.m = Math.max(10, Math.round((t.m - over * t.m / fs) / 5) * 5); });
    }
    days.push({ ymd: ymdOf(date), ph: ph, tasks: tasks, mock: mockDay });
  }
  return { N: N, days: days, cut: cut, aim: aim, weak: weakOf, share: share };
}

function t2PlanView() {
  var P = t2Prof(), today = ymdOf(new Date());
  var tier1 = (ST.profile && ST.profile.exam) || "2026-10-10";
  var d1 = dateOf(tier1); d1 = d1 ? new Date(d1.getTime() + 864e5) : new Date();
  var defStart = ymdOf(new Date(Math.max(Date.now(), d1.getTime())));
  var form = function (p) {
    p = p || { exam: "2026-12-15", start: defStart, hours: 7, aim: "any", weak: [] };
    return '<div class="t2f">' +
      '<div class="t2aim"><span>What are you aiming for?</span><div>' + Object.keys(T2AIMS).map(function (k) { var a = T2AIMS[k];
        return '<button type="button" data-aim="' + k + '" aria-pressed="' + (p.aim === k) + '"><b>' + h(a.label) + '</b><small>' + (a.extra ? "Paper I + " + (a.extra === "S" ? "Paper II Statistics" : "Paper III Finance & Economics") : "Paper I" + (a.target ? " · last selected " + a.target + "/390" : "")) + '</small></button>'; }).join("") + '</div></div>' +
      '<label><span>Tier 2 date</span><input type="date" id="t2ex" value="' + h(p.exam) + '"></label>' +
      '<label><span>Start from</span><input type="date" id="t2st" value="' + h(p.start) + '"></label>' +
      '<label><span>Hours a day</span><select id="t2hr">' + [4, 5, 6, 7, 8, 9, 10].map(function (x) { return '<option' + (+p.hours === x ? ' selected' : '') + '>' + x + '</option>'; }).join("") + '</select></label>' +
      '<div class="t2wk"><span>Modules you find hard (we also read your practice accuracy and mock scores)</span><div>' + [["M", "Maths"], ["R", "Reasoning"], ["E", "English"], ["G", "GA"]].map(function (x) { return '<button type="button" data-wk="' + x[0] + '" aria-pressed="' + ((p.weak || []).indexOf(x[0]) >= 0) + '">' + x[1] + '</button>'; }).join("") + '</div></div>' +
      '<button class="btn key" id="t2go">' + (t2Prof() ? 'Rebuild my plan' : 'Build my Tier 2 plan') + arr() + '</button></div>';
  };
  var head = '<section class="head"><a class="kicker" href="#/tier2">&#8592; Tier 2</a><h1 class="page-h">Your Tier 2 plan</h1>' +
    '<p class="lede">Built around the post you want: its papers, the score to beat, Tier 2 topic weight and your own weak spots. Every topic links to its notes, lesson video and real Tier 2 questions.</p></section>';
  if (!P) return head + form() + foot();
  if (!P.aim) P.aim = P.post === "jso" ? "jso" : P.post === "aao" ? "aao" : "any";
  var plan = t2BuildPlan(P);
  if (!plan) return head + '<p class="err">The Tier 2 date must be after the start date.</p>' + form(P) + foot();
  var ticks = (ST.t2.ticks = ST.t2.ticks || {});
  var ti = plan.days.findIndex(function (x) { return x.ymd >= today; }); if (ti < 0) ti = plan.days.length - 1;
  var done = 0, all = 0; plan.days.forEach(function (x) { x.tasks.forEach(function (t, j) { all++; if (ticks[x.ymd + "t" + j]) done++; }); });
  var NAME = { M: "Maths", R: "Reasoning", E: "English", G: "GA", S: "Statistics", F: "Paper III" };
  function dayHTML(x, open) {
    var dt = dateOf(x.ymd), tot = x.tasks.reduce(function (s, t) { return s + t.m; }, 0);
    return '<details class="t2d' + (x.ymd === today ? ' today' : '') + '"' + (open ? ' open' : '') + '><summary><b>' + dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) + '</b><span>' + x.ph + '</span>' + (x.mock ? '<em>Mock</em>' : '') + '<small>' + Math.floor(tot / 60) + ' h' + (tot % 60 ? ' ' + tot % 60 + ' m' : '') + '</small></summary><ul>' +
      x.tasks.map(function (t, j) { var id = x.ymd + "t" + j;
        return '<li class="k-' + t.k + '"><label><input type="checkbox" data-t2t="' + id + '"' + (ticks[id] ? ' checked' : '') + '><span>' + h(t.what) + (t.why ? '<small>' + h(t.why) + '</small>' : '') + '</span></label><time>' + t.m + ' m</time>' + (t.link ? '<a href="' + t.link + '" aria-label="Open">' + arr() + '</a>' : '<i></i>') + '</li>'; }).join("") + '</ul></details>';
  }
  var weeks = []; for (var i = 0; i < plan.days.length; i += 7) weeks.push(plan.days.slice(i, i + 7));
  var mix = Object.keys(plan.share).map(function (k) { return '<span class="t2mx"><i class="c-' + ({ M: "maths", R: "reasoning", E: "english", G: "ga", S: "tests", F: "computer" }[k]) + '"></i>' + NAME[k] + ' ' + Math.round(plan.share[k] * 100) + '%' + (plan.weak[k] >= 0.6 ? ' <em>weak</em>' : '') + '</span>'; }).join("");
  return head +
    '<div class="t2aimbar"><div><span>Aiming for</span><b>' + h(plan.aim.short || plan.aim.label) + '</b></div>' + (plan.aim.target ? '<div><span>Score to beat</span><b>' + plan.aim.target + ' / 390</b></div>' : '<div><span>Papers</span><b>I + ' + (plan.aim.extra === "S" ? "II" : "III") + ', out of 590</b></div>') +
      '<div><span>Days</span><b>' + plan.N + '</b></div><div><span>Done</span><b>' + (all ? Math.round(done / all * 100) : 0) + '%</b></div></div>' +
    '<div class="t2mixes">Study time: ' + mix + '</div>' +
    '<section class="band"><h2 class="sec-h">Today</h2>' + dayHTML(plan.days[ti], true) + '</section>' +
    '<section class="band"><h2 class="sec-h">Every day</h2>' + weeks.map(function (w, k) { return '<div class="t2wkb"><h3>Week ' + (k + 1) + ' · ' + w[0].ph + '</h3>' + w.map(function (x) { return dayHTML(x, false); }).join("") + '</div>'; }).join("") + '</section>' +
    '<details class="cut-about"><summary>Change the plan</summary>' + form(P) + '</details>' + foot();
}
function wireT2Plan() {
  var go = el("#t2go"); if (!go && !el("[data-t2t]")) return;
  els("[data-wk]").forEach(function (b) { b.addEventListener("click", function () { b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); }); });
  els("[data-aim]").forEach(function (b) { b.addEventListener("click", function () { els("[data-aim]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); }); });
  if (go) go.addEventListener("click", function () {
    ST.t2 = ST.t2 || {};
    var aimB = els("[data-aim]").filter(function (b) { return b.getAttribute("aria-pressed") === "true"; })[0];
    ST.t2.profile = { exam: el("#t2ex").value, start: el("#t2st").value, hours: +el("#t2hr").value, aim: aimB ? aimB.dataset.aim : "any",
      weak: els("[data-wk]").filter(function (b) { return b.getAttribute("aria-pressed") === "true"; }).map(function (b) { return b.dataset.wk; }) };
    save(); route(); scrollTo(0, 0); toast("Tier 2 plan ready");
  });
  els("[data-t2t]").forEach(function (c) { c.addEventListener("change", function () { ST.t2.ticks = ST.t2.ticks || {}; if (c.checked) ST.t2.ticks[c.dataset.t2t] = 1; else delete ST.t2.ticks[c.dataset.t2t]; save(); }); });
}

/* ── Tier 2 practice: a whole paper untimed, or one topic across every paper ── */
function t2Practice(qs, back, backLabel, head) {
  ST.t2 = ST.t2 || {}; var PR = (ST.t2.prac = ST.t2.prac || {});
  var host = quiz({
    qs: qs, back: back, backLabel: backLabel, head: head || "",
    get: function (j) { var v = PR[qs[j].id]; return v == null ? null : v; },
    set: function (j, v) { PR[qs[j].id] = v; save(); },
    startAt: function () { for (var j = 0; j < qs.length; j++) if (PR[qs[j].id] == null) return j; return 0; },
    done: function () { location.hash = back; }
  });
  setAside(host.__pads());
  return host;
}
function t2TopicPractice(k, tag) {
  var all = [];
  (T2.papers || []).forEach(function (p) { p.qs.forEach(function (q) { if (q.s === k && (!tag || q.t === tag)) all.push(Object.assign({ src: p.label }, q)); }); });
  if (!all.length) {
    if (!isPremium()) return '<section class="head"><a class="kicker" href="#/tier2">&#8592; Tier 2</a><h1 class="page-h">' + h(tag || "Tier 2 practice") + '</h1></section>' + upsell("Tier 2 questions by topic", "The Exam Pass opens every Tier 2 question, sorted by topic.") + foot();
    return blank();
  }
  all.sort(function (a, b) { return (b.src > a.src ? 1 : -1); });
  var name = { M: "Maths", R: "Reasoning", E: "English", G: "GA", C: "Computer", S: "Statistics", F: "Paper III" }[k];
  return t2Practice(all, "#/tier2", "Tier 2", '<div class="t2ph-h"><b>' + h(tag || name) + '</b><span>' + all.length + ' real Tier 2 questions, newest first, answers shown as you go</span></div>');
}

/* one compact Tier 2 entry point, reused across pages */
function t2Band(kind) {
  var n = ((T2.meta || {}).papers || []).length || ((D.meta || {}).t2 || {}).papers || 18, P = t2Prof();
  var T = {
    home: ["Tier 2 comes next", "Plan it the day after your Tier 1 shift: " + n + " real Tier 2 papers, Computer Knowledge, Statistics and Paper III notes, and a day-by-day plan."],
    mocks: ["Tier 2 mocks", n + " real Tier 2 papers from 2022 to 2025, with the 2026 module timers and +3 / -1 marking. Statistics and Paper III too."],
    learn: ["Tier 2 subjects", "Computer Knowledge, Paper II Statistics and Paper III Finance and Economics, plus how Tier 2 asks each Tier 1 subject."],
    plan: ["Plan Tier 2 as well", "Tier 2 is about December 2026. Build its plan now and it starts the day after your Tier 1 shift."],
    analysis: ["Tier 2 weightage", "Topic counts from every official Tier 2 paper since 2022, module by module."]
  }[kind] || ["Tier 2", ""];
  return '<a class="t2band reveal" href="' + (kind === "plan" || kind === "home" ? "#/tier2/plan" : "#/tier2") + '"><span class="t2b-k">Tier 2</span><b>' + h(T[0]) + '</b><p>' + h(T[1]) + '</p>' +
    '<span class="t2b-go">' + (kind === "plan" || kind === "home" ? (P ? "Open my Tier 2 plan" : "Build my Tier 2 plan") : "Open Tier 2") + arr() + '</span></a>';
}

/* ══════════ Tier 1 or Tier 2 mode ══════════
   Chosen on the overview, or automatic: the day after your Tier 1 shift the
   site turns to Tier 2 (overview, Plan and Mocks all point there). */
function stage() {
  var st = ST.profile && ST.profile.stage;
  if (st === "t1" || st === "t2") return st;
  var ex = ST.profile && ST.profile.exam ? dateOf(ST.profile.exam) : null;
  return ex && Date.now() > ex.getTime() + 864e5 ? "t2" : "t1";
}
function modeSwitch() {
  var s2 = stage();
  return '<div class="modesw" role="tablist" aria-label="Preparing for"><span>Preparing for</span>' +
    '<button role="tab" data-stage="t1" aria-selected="' + (s2 === "t1") + '">Tier 1</button><button role="tab" data-stage="t2" aria-selected="' + (s2 === "t2") + '">Tier 2</button><i aria-hidden="true"></i></div>';
}
function placeMode() {
  els(".modesw").forEach(function (sw) {
    var on = el('[aria-selected="true"]', sw); if (!on) return;
    sw.style.setProperty("--m-l", on.offsetLeft + "px"); sw.style.setProperty("--m-w", on.offsetWidth + "px");
  });
}
function wireMode() {
  placeMode(); setTimeout(placeMode, 60);
  els("[data-stage]").forEach(function (b) { b.addEventListener("click", function () {
    ST.profile = ST.profile || {}; ST.profile.stage = b.dataset.stage; save();
    toast(b.dataset.stage === "t2" ? "Tier 2 mode" : "Tier 1 mode"); route(); scrollTo(0, 0);
  }); });
  // the nav follows the mode
  var t2 = stage() === "t2";
  els('a[data-r="plan"]').forEach(function (a) { a.setAttribute("href", t2 ? "#/tier2/plan" : "#/plan"); });
  els('a[data-r="mocks"]').forEach(function (a) { a.setAttribute("href", t2 ? "#/tier2" : "#/mocks"); });
  document.body.classList.toggle("t2mode", t2);
}
function t2Home() {
  var P = t2Prof(), plan = P ? t2BuildPlan(P) : null, today = ymdOf(new Date());
  var exam = P ? dateOf(P.exam) : dateOf("2026-12-15"), left = Math.max(0, Math.ceil((exam - new Date()) / 864e5));
  var ticks = (ST.t2 && ST.t2.ticks) || {};
  var day = plan ? (plan.days.filter(function (x) { return x.ymd === today; })[0] || plan.days.filter(function (x) { return x.ymd > today; })[0]) : null;
  var papers = (T2.papers || []), doneP = papers.filter(function (p) { var a = ST.att[p.id]; return a && a.done; });
  var last = doneP.map(function (p) { return { p: p, s: t2Score(p, ST.att[p.id]), ts: ST.att[p.id].ts }; }).sort(function (a, b) { return b.ts - a.ts; })[0];
  var nextMock = papers.filter(function (p) { return p.paper === "I" && !(ST.att[p.id] && ST.att[p.id].done) && t2Open(p.id); })[0];
  return '<section class="head">' + modeSwitch() +
      '<span class="kicker reveal">SSC CGL 2026 · Tier 2</span>' +
      '<h1 class="page-h reveal">' + left + ' day' + (left === 1 ? '' : 's') + ' to Tier 2.</h1>' +
      '<p class="lede reveal">' + (P ? 'Aiming for ' + h((T2AIMS[P.aim] || T2AIMS.any).label) + ', exam on ' + h(exam.toLocaleDateString("en-IN", { day: "numeric", month: "long" })) + '.' : 'SSC says December 2026 (tentative). Build your plan and this page becomes your daily Tier 2 dashboard.') + '</p></section>' +
    t2PassHTML() +
    '<div class="t2hgrid">' +
      '<div class="t2today"><header><b>Today</b>' + (plan ? '<a href="#/tier2/plan">Whole plan' + arr() + '</a>' : '') + '</header>' +
        (day ? '<ul>' + day.tasks.map(function (t, j) { var id = day.ymd + "t" + j; return '<li class="' + (ticks[id] ? 'done' : '') + '"><span>' + h(t.what) + '</span><time>' + t.m + ' m</time>' + (t.link ? '<a href="' + t.link + '" aria-label="Open">' + arr() + '</a>' : '') + '</li>'; }).join("") + '</ul>'
          : '<p>No plan yet. It takes a minute: your post, your date, your hours.</p><a class="btn key" href="#/tier2/plan">Build my Tier 2 plan' + arr() + '</a>') + '</div>' +
      '<div class="t2side">' +
        '<a class="t2s-card" href="' + (nextMock ? '#/tier2/mock/' + encodeURIComponent(nextMock.id) : '#/tier2') + '"><span>Next mock</span><b>' + h(nextMock ? nextMock.label : "All Tier 2 mocks") + '</b><em>' + (nextMock ? '150 questions · 2 h 15 min' : '') + '</em></a>' +
        '<div class="t2s-card"><span>Last mock</span><b>' + (last ? last.s.merit.toFixed(0) + ' / ' + last.s.meritMax : 'None yet') + '</b><em>' + (last ? h(last.p.label) : 'Sit one this week') + '</em></div>' +
        '<a class="t2s-card" href="#/tier2"><span>Tier 2 hub</span><b>' + papers.length + ' papers · ' + ((T2.meta || {}).notes || []).length + ' notes</b><em>Topic practice, videos, typing trainer</em></a>' +
      '</div></div>' + foot();
}

function paintWho() {
  var host = document.getElementById("whoBox");
  if (!host) return;
  if (!AU) {
    host.innerHTML = '<a class="btn quiet sm" href="#/account" style="width:100%;justify-content:center">Sign in' + arr() + '</a>';
    return;
  }
  host.innerHTML = '<div class="who"><span class="av">' + h(AU.name.trim().charAt(0).toUpperCase()) + '</span>' +
    '<a class="nm" href="#/account" style="color:var(--ink)">' + h(AU.name) + '</a>' +
    '<button class="out" id="qout">Out</button></div>' +
    '<div class="sync' + (syncState === "synced" ? " on" : "") + '">' +
    (syncState === "saving" ? "Saving" : syncState === "synced" ? "Saved to your account" :
     syncState === "offline" ? "Offline, saved on this device" : "Syncing") + '</div>';
  var m = document.getElementById("acct2");
  if (m) m.textContent = AU ? AU.name.trim().split(/\s+/)[0].slice(0, 12) : "Sign in";
  var q = document.getElementById("qout");
  if (q) q.addEventListener("click", signOut);
}

/* a floating confirmation: glass, because it sits over whatever is on screen.
   It materialises (blur and scale together) and leaves the way it came. */
function toast(msg) {
  var t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t);
  var M = window.Motion, still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (M && !still) M.animate(t, { opacity: [0, 1], transform: ["translate(-50%, 16px) scale(.96)", "translate(-50%, 0) scale(1)"], filter: ["blur(6px)", "blur(0px)"] }, { type: "spring", bounce: 0, duration: 0.4 });
  setTimeout(function () {
    if (M && !still) M.animate(t, { opacity: 0, transform: "translate(-50%, 16px) scale(.96)", filter: "blur(6px)" }, { duration: 0.25, ease: [0.23, 1, 0.32, 1] }).then(function () { t.remove(); });
    else t.remove();
  }, 2600);
}
/* after any successful sign-in: store the session, pull progress, go on */
function signedIn(j) {
  AU = { token: j.token, name: j.name, slug: j.slug, ent: j.ent, methods: j.methods, ref: j.ref || null, refCount: j.refCount || 0 };
  try { localStorage.setItem("cgl-account", JSON.stringify(AU)); sessionStorage.removeItem("cgl-fb-redirect"); if (j.created) localStorage.removeItem("cgl-ref"); } catch (e) {}
  return (DATA_READY || Promise.resolve()).catch(function () {}).then(function () { if (!D.papers.length) return load(); })
    .then(function () { return Promise.all([pull(), refreshMe()]); })
    .then(function () { syncExam(); return loadPremium(); })
    .then(function () {
      var dest = ST.profile && ST.profile.exam ? "#/" : "#/welcome";
      if (location.hash === dest) route(); else location.hash = dest;
    });
}
function busy(b, on, label) {
  if (!b) return;
  if (on) { b.dataset.label = b.innerHTML; b.disabled = true; b.classList.add("busy"); b.innerHTML = '<span class="spin" aria-hidden="true"></span>' + label; }
  else { b.disabled = false; b.classList.remove("busy"); if (b.dataset.label) b.innerHTML = b.dataset.label; }
}
function repaintGate() {
  var f = el(".g2-form"), tmp = document.createElement("div");
  tmp.innerHTML = V.account();
  f.replaceWith(tmp.querySelector(".g2-form"));
  wireGate(true);
}

/* the phone flow, shared by sign-in and by "connect phone" on the account page:
   number, then the SMS code, then onToken(idToken) */
function wirePhone(scope, pre, fail, onToken) {
  var num = el('[data-step="num"]', scope), code = el('[data-step="code"]', scope);
  var ph = el("#" + pre + "ph", scope), go = el("#" + pre + "phgo", scope), otp = el("#" + pre + "otp", scope), ok = el("#" + pre + "otpgo", scope);
  var resend = el(".ph-resend", scope), timer = null;
  if (!ph) return;
  ph.addEventListener("input", function () { ph.value = ph.value.replace(/\D/g, "").slice(0, 10); });
  function tick() {
    var n = 30, s = resend.querySelector("span");
    resend.disabled = true; resend.innerHTML = 'Resend in <span>30</span>s'; s = resend.querySelector("span");
    clearInterval(timer);
    timer = setInterval(function () { n--; if (n <= 0) { clearInterval(timer); resend.disabled = false; resend.textContent = "Resend code"; } else s.textContent = n; }, 1000);
  }
  function send() {
    fail("");
    var d = ph.value.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(d)) return fail("Enter your 10-digit mobile number.");
    busy(go, true, "Sending");
    fireAuth().then(function () { return window.FireAuth.phoneStart("+91" + d, rcHost()); })
      .then(function () {
        busy(go, false);
        num.hidden = true; code.hidden = false;
        el(".ph-to", scope).textContent = "+91 " + d.slice(0, 5) + " " + d.slice(5);
        otp.value = ""; otp.focus(); tick();
      })
      .catch(function (e) { busy(go, false); fail(e.message); });
  }
  function verify() {
    fail("");
    if (!/^\d{6}$/.test(otp.value.trim())) return fail("Enter the 6-digit code from the SMS.");
    busy(ok, true, "Checking");
    window.FireAuth.phoneConfirm(otp.value.trim())
      .then(function (tok) { return onToken(tok, function () { busy(ok, false); }); })
      .catch(function (e) { busy(ok, false); fail(e.message); });
  }
  go.addEventListener("click", send);
  ph.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
  ok.addEventListener("click", verify);
  otp.addEventListener("input", function () { otp.value = otp.value.replace(/\D/g, "").slice(0, 6); if (otp.value.length === 6) verify(); });
  el(".ph-back", scope).addEventListener("click", function () { clearInterval(timer); code.hidden = true; num.hidden = false; ph.focus(); });
  resend.addEventListener("click", function () { code.hidden = true; num.hidden = false; send(); });
}

function wireGate(again) {
  var form = el(".g2-form");
  if (!form) return;
  var err = document.getElementById("err");
  function fail(m) { err.innerHTML = m ? '<div class="err">' + h(m) + '</div>' : ""; }
  els("[data-gm]", form).forEach(function (b) {
    b.addEventListener("click", function () {
      if (gateMode === b.dataset.gm) return;
      gateMode = b.dataset.gm;
      repaintGate();   // repaint just the form, so the 3D compass beside it keeps running
    });
  });

  if (FBCFG === undefined) {
    fbConfig().then(function () { if (el(".g2-form") && !AU) repaintGate(); });
  }

  if (gateMode === "fb") {
    // swap the Firebase ID token for a session here; a new phone account needs a name first
    function exchange(tok, done, name) {
      var ref = ""; try { ref = localStorage.getItem("cgl-ref") || ""; } catch (e) {}
      return api("/api/auth", { method: "POST", body: JSON.stringify({ action: "firebase", idToken: tok, name: name || "", ref: ref }) })
        .then(function (j) {
          if (j.needName) {
            FBID = tok; if (done) done();
            els(".fb-ph .ph-step", form).forEach(function (s) { s.hidden = true; });
            el(".nm-step", form).hidden = false; el("#gg", form).hidden = true; el(".g2-or", form).hidden = true;
            el("#fnm", form).focus();
            return;
          }
          return signedIn(j);
        });
    }
    var gg = el("#gg", form);
    // load the sign-in library now, so the Google window opens inside the tap
    // itself; mobile browsers block a popup that opens after an await
    var ready = false;
    if (FBCFG) fireAuth().then(function () { ready = true; }).catch(function () {});
    if (gg && FBCFG) gg.addEventListener("click", function () {
      fail(""); busy(gg, true, "Opening Google");
      try { sessionStorage.setItem("cgl-fb-redirect", "1"); } catch (e) {}
      (ready ? window.FireAuth.google() : fireAuth().then(function () { return window.FireAuth.google(); }))
        .then(function (tok) { if (tok) return exchange(tok, function () { busy(gg, false); }); })
        .catch(function (e) { busy(gg, false); try { sessionStorage.removeItem("cgl-fb-redirect"); } catch (x) {} fail(e.message); });
    });
    if (FBCFG) wirePhone(el(".fb-ph", form), "", fail, exchange);
    var nb = el("#fnmgo", form), nmi = el("#fnm", form);
    function named() {
      var n = nmi.value.trim();
      if (n.length < 2) return fail("Enter your name, at least two letters.");
      busy(nb, true, "Creating");
      exchange(FBID, null, n).catch(function (e) { busy(nb, false); fail(e.message); });
    }
    nb.addEventListener("click", named);
    nmi.addEventListener("keydown", function (e) { if (e.key === "Enter") named(); });
    // coming back from a Google redirect (popup-less browsers)
    var back = false; try { back = !!sessionStorage.getItem("cgl-fb-redirect"); } catch (e) {}
    if (back && FBCFG && !again) {
      fireAuth().then(function () { return window.FireAuth.redirectResult(); })
        .then(function (tok) { if (tok) return exchange(tok); try { sessionStorage.removeItem("cgl-fb-redirect"); } catch (e) {} })
        .catch(function (e) { fail(e.message); });
    }
    if (!again) enter(".g2-form > *");
    return;
  }

  var go = document.getElementById("gogo");
  var nm = document.getElementById("nm"), pn = document.getElementById("pn");
  function submit() {
    fail("");
    var name = (nm.value || "").trim(), pin = (pn.value || "").trim();
    if (name.length < 2) return fail("Enter a name of at least two letters.");
    if (!/^\d{4,8}$/.test(pin)) return fail("The PIN must be 4 to 8 digits.");
    busy(go, true, "Signing in");
    api("/api/auth", { method: "POST", body: JSON.stringify({ action: gateMode === "in" ? "login" : "register", name: name, pin: pin }) })
      .then(signedIn)
      .catch(function (e) { busy(go, false); fail(e.message); });
  }
  go.addEventListener("click", submit);
  [nm, pn].forEach(function (i) { i.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); }); });
  if (again) { if (matchMedia("(pointer:fine)").matches) nm.focus(); }
  else { if (matchMedia("(pointer:fine)").matches) nm.focus(); enter(".g2-form > *"); }
}

/* signed in: connect Google or a phone number to this account */
function wireMethods() {
  var box = el("#methods");
  if (!box || !AU) return;
  var err = el("#err", box);
  function fail(m) { err.innerHTML = m ? '<div class="err">' + h(m) + '</div>' : ""; }
  function link(tok, done) {
    return api("/api/auth", { method: "POST", body: JSON.stringify({ action: "firebase", idToken: tok, link: true, token: AU.token }) })
      .then(function (j) {
        AU.methods = j.methods; try { localStorage.setItem("cgl-account", JSON.stringify(AU)); } catch (e) {}
        if (window.FireAuth) window.FireAuth.signOut();
        toast(j.linked === "google" ? "Google connected" : "Phone connected");
        route();
      })
      .catch(function (e) { if (done) done(); fail(e.message); });
  }
  fbConfig().then(function (cfg) {
    if (!cfg) { els("#lkg,#lkp", box).forEach(function (b) { b.disabled = true; b.title = "Not switched on yet"; }); return; }
    var g = el("#lkg", box), ready = false;
    fireAuth().then(function () { ready = true; }).catch(function () {});
    if (g) g.addEventListener("click", function () {
      fail(""); busy(g, true, "Opening");
      try { sessionStorage.setItem("cgl-fb-link", "1"); } catch (e) {}
      (ready ? window.FireAuth.google() : fireAuth().then(function () { return window.FireAuth.google(); }))
        .then(function (tok) { try { sessionStorage.removeItem("cgl-fb-link"); } catch (e) {} if (tok) return link(tok, function () { busy(g, false); }); busy(g, false); })
        .catch(function (e) { busy(g, false); fail(e.message); });
    });
    // back from a Google redirect started by "Connect"
    var back = false; try { back = !!sessionStorage.getItem("cgl-fb-link"); sessionStorage.removeItem("cgl-fb-link"); } catch (e) {}
    if (back) fireAuth().then(function () { return window.FireAuth.redirectResult(); })
      .then(function (tok) { if (tok) return link(tok); }).catch(function (e) { fail(e.message); });
    var p = el("#lkp", box), pf = el(".lkp-form", box);
    if (p) {
      p.addEventListener("click", function () { pf.hidden = !pf.hidden; if (!pf.hidden) el("#lkph", pf).focus(); });
      wirePhone(pf, "lk", fail, link);
    }
  });
}

/* a figure that counts up reads as a measurement being taken; one that is
   simply printed reads as a label. Cheap, and only on arrival. */
function countUp(scope) {
  els("[data-count]", scope || document).forEach(function (el) {
    var to = parseFloat(el.dataset.count);
    if (!isFinite(to) || to <= 0 || reduceMotion()) return;
    var suffix = el.dataset.suffix || "";
    var t0 = 0, dur = 900;
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - k, 4);            // ease-out-quart, settles calmly
      el.textContent = Math.round(to * e) + suffix;
      if (k < 1) requestAnimationFrame(step);
    }
    el.textContent = "0" + suffix;
    requestAnimationFrame(step);
  });
}

/* ── aside ── */
var asideHTML = "";
function setAside(html) { asideHTML = html || ""; }


/* reading size for study pages, remembered per device */
function readScale() { var v = 1; try { v = parseFloat(localStorage.getItem("cgl-rs")) || 1; } catch (e) {} return Math.max(0.9, Math.min(1.5, v)); }
function setReadScale(v) {
  v = Math.round(Math.max(0.9, Math.min(1.5, v)) * 10) / 10;
  document.documentElement.style.setProperty("--rs", v);
  try { localStorage.setItem("cgl-rs", v); } catch (e) {}
}
document.documentElement.style.setProperty("--rs", readScale());
window.addEventListener("scroll", function () {
  var p = el("#tprog"); if (!p) return;
  var d = document.documentElement, max = d.scrollHeight - innerHeight;
  p.style.transform = "scaleX(" + (max > 0 ? Math.min(1, scrollY / max) : 0) + ")";
}, { passive: true });

/* ── router ── */
function route() {
  setAside("");
  document.body.classList.remove("examining");
  var p = (location.hash || "#/").replace(/^#\/?/, "").split(/[?#]/)[0].split("/").filter(Boolean);
  var key = "", args = [];
  if (!p.length) key = "";
  else if (p[0] === "plan") key = "plan";
  else if (p[0] === "mocks") key = "mocks";
  else if (p[0] === "mock" && p[1]) {
    var id = decodeURIComponent(p[1]);
    if (p[2] === "run") { key = "mockrun"; args = [id]; }
    else if (p[2] === "result") { key = "mockresult"; args = [id]; }
    else if (p[2] === "review") { key = "mockreview"; args = [id, false]; }
    else if (p[2] === "practice") { key = "mockreview"; args = [id, true]; }
    else if (p[2] === "paper") { key = "mockpaper"; args = [id]; }
    else { key = "mock"; args = [id]; }
  }
  else if (p[0] === "practice") { key = "practice"; args = [p[1], p[2]]; }
  else if (p[0] === "errors") { key = "errors"; args = [p[1] === "run"]; }
  else if (p[0] === "syllabus") key = "learn";
  else if (p[0] === "videos") key = "videos";
  else if (p[0] === "cards") { key = "cards"; args = [p[1], p[2]]; }
  else if (p[0] === "learn") { key = "learn"; args = [p[1], p[2]]; }
  else if (p[0] === "library") { key = "library"; args = [p[1], p[2]]; }
  else if (p[0] === "pdf") { key = "pdf"; args = [p[1], p[2], p[3]]; }
  else if (p[0] === "ca") { key = "ca"; args = [p[1], p[2]]; }
  else if (p[0] === "more") key = "more";
  else if (p[0] === "analysis") key = "analysis";
  else if (p[0] === "lastday") key = "lastday";
  else if (p[0] === "cutoffs") key = "cutoffs";
  else if (p[0] === "tier2") { key = "tier2"; args = [p[1], p[2] && decodeURIComponent(p[2]), p[3]]; }
  else if (p[0] === "welcome") key = "welcome";
  else if (p[0] === "premium") { key = "premium"; args = [p[1] === "ok"]; }
  else if (p[0] === "admin") key = "admin";
  else if (p[0] === "legal") { key = "legal"; args = [p[1] || "terms"]; }
  else if (p[0] === "progress") key = "progress";
  else if (p[0] === "sources") key = "sources";
  else if (p[0] === "account") key = "account";
  else key = "404";

  // progress is per person, so everything behind the gate needs an account
  // public: the front door, sign-in, pricing and the legal pages
  var PUBLIC = { account: 1, premium: 1, legal: 1, cutoffs: 1 };
  // the newest papers are open to everyone, signed in or not (progress stays in this browser)
  var guest = !AU && /^mock/.test(key) && openPaper(args[0]);
  if (!AU && key === "") key = "landing";
  else if (!AU && !PUBLIC[key] && !guest) { key = "account"; args = []; }
  // first sign-in: the exam date comes before anything else
  if (AU && !(ST.profile && ST.profile.exam) && !{ welcome: 1, account: 1, legal: 1, premium: 1, admin: 1, cutoffs: 1 }[key]) { key = "welcome"; args = []; }
  document.body.classList.toggle("lp", key === "landing");
  if (key !== "landing" && window.__lenis) { try { window.__lenis.destroy(); } catch (e) {} window.__lenis = null; }
  var TITLES = { landing: "", "": "Overview", plan: "Your plan", mocks: "Mocks", mock: "Mock", mockrun: "Mock in progress", mockresult: "Mock result", mockreview: "Mock review", mockpaper: "Question paper with answers",
    practice: "Practice", errors: "Error log", learn: "Learn", videos: "Videos", library: "Library", ca: "Current affairs", analysis: "Analysis and guess paper", lastday: "Last-day sheet", welcome: "Your exam date",
    premium: "Exam Pass, ₹50 for 30 days", admin: "Admin", legal: { terms: "Terms of use", privacy: "Privacy policy", refunds: "Refunds", contact: "Contact" }[args[0]] || "Legal",
    pdf: "Reader", more: "More", sources: "Sources", progress: "Progress", cards: "Flashcards", account: AU ? "Account" : "Sign in", cutoffs: "SSC CGL cut-offs, 2017 to 2026", tier2: "Tier 2", 404: "Not found" };
  var tt = TITLES[key];
  document.title = tt ? tt + " · CGL Compass" : "SSC CGL 2026 Preparation Planner: Notes, Mocks, PYQs | CGL Compass";
  // the first visit after the trial ends shows what they did and what stays free, once per account
  if (trialOver() && !{ premium: 1, account: 1, legal: 1, welcome: 1, admin: 1, landing: 1 }[key]) {
    var seenK = "cgl-tover-" + AU.slug;
    try { if (!localStorage.getItem(seenK)) { localStorage.setItem(seenK, "1"); key = "trialover"; args = []; } } catch (e) {}
  }
  var out;
  try { out = V[key] ? V[key].apply(null, args) : blank(); }
  catch (err) { console.error(err); out = blank(); }
  var top = el(".top");
  var boot = document.getElementById("boot");
  if (boot) boot.remove();
  main.innerHTML = "";
  if (top) main.appendChild(top);
  if (typeof out === "string") {
    var d = document.createElement("div");
    d.innerHTML = trialBarHTML(key) + out;
    while (d.firstChild) main.appendChild(d.firstChild);
  } else main.appendChild(out);

  asideEl.innerHTML = asideHTML;
  shell.classList.toggle("has-aside", !!asideHTML);
  if (typeof out !== "string" && out.__drawPads) out.__drawPads();

  var r = AU ? (p[0] === "mock" ? "mocks" : p[0] === "syllabus" ? "learn" : (p[0] || "")) : (key === "landing" ? "" : key);
  els("[data-r]").forEach(function (a) { a.classList.toggle("on", a.dataset.r === r); });
  // filters belong to one visit to Learn; coming back shows every section again
  if (key !== "learn") { learnSec = ""; learnTodo = false; learn26 = false; }
  if (key !== "ca") caCat = "";
  document.body.classList.toggle("locked", !AU);
  document.documentElement.classList.toggle("authed", !!AU);
  var studying = key === "learn" && args[1];
  var fz = ""; try { fz = localStorage.getItem("cgl-focus"); } catch (e) {}
  document.body.classList.toggle("focus", !!(studying && fz));
  document.body.classList.toggle("studying", !!studying);
  var t2on = AU && stage() === "t2", tp = t2on ? (ST.t2 && ST.t2.profile) : null, t2d = dateOf(tp ? tp.exam : "2026-12-15");
  el("#railDays").textContent = t2on ? Math.max(0, Math.ceil((t2d - new Date()) / 864e5)) : days();
  var rl = el(".rail-foot .lbl"); if (rl) rl.textContent = t2on ? "Days to Tier 2" : "Days to your shift";
  var rs = el("#railSub"); if (rs) rs.textContent = t2on ? (tp ? t2d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "December 2026, tentative") : AU && ST.profile && ST.profile.exam ? examLabel() : "Set your exam date";
  var ne = el("#nErr"); if (ne) ne.textContent = AU ? (errList().length || "") : "";
  var nm = el("#nMocks"); if (nm) nm.textContent = ((D.meta && D.meta.papers) || mockPapers()).filter(function (p) { return !p.bank; }).length || "";
  var nc = el("#nCards"); if (nc) nc.textContent = cardList().length || "";

  countUp(main);
  wire();
  wireGate();
  paintWho();
  if (!/run|practice\/|errors\/run|review/.test(location.hash)) window.scrollTo(0, 0);
}

function wire() {
  mountCompass();
  wireT2Hub();
  wireMode();
  els("[data-tt]").forEach(function (b) { b.addEventListener("click", function () { els("[data-tt]").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); }); els("[data-tp]").forEach(function (x) { x.hidden = x.dataset.tp !== b.dataset.tt; }); }); });
  wireT2Plan();
  wireTyping();
  wireCutoffs();
  wireNotes();
  wireLanding();
  wirePubnav();
  wireMethods();
  wireFacts();
  els("[data-plan]").forEach(function (b) {
    b.addEventListener("change", function () {
      ST.plan[b.dataset.plan] = b.checked;
      save();
      var done = Object.keys(ST.plan).filter(function (k) { return ST.plan[k]; }).length;
      var total = planTotal();
      var k = el(".head .kicker"), t = el(".head .track i");
      if (k) k.textContent = done + " of " + total + " done";
      if (t) t.style.setProperty("--p", pc(done, total) / 100);
    });
  });
  els("[data-clear-paper]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!confirm("Clear your answers for this paper?")) return;
      delete ST.att[b.dataset.clearPaper]; save(); route();
    });
  });
  els("[data-learn]").forEach(function (b) {
    b.addEventListener("change", function () {
      if (b.checked) ST.learn[b.dataset.learn] = Date.now(); else delete ST.learn[b.dataset.learn];
      save();
    });
  });
  els("[data-ca]").forEach(function (b) {
    b.addEventListener("change", function () {
      if (b.checked) ST.ca[b.dataset.ca] = Date.now(); else delete ST.ca[b.dataset.ca];
      save();
      var t = el('.seg a.on'); if (t) t.classList.toggle("read", b.checked);
    });
  });
  // in-page anchors: the hash is the router's, so scroll without touching it
  els("[data-jump]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var t = document.getElementById(a.dataset.jump);
      if (t) t.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    });
  });
  // a scrolled tab strip opens with its chosen tab in view
  els(".seg").forEach(function (g) {
    var on = el("a.on", g);
    if (on && g.scrollWidth > g.clientWidth) g.scrollLeft = on.offsetLeft - (g.clientWidth - on.offsetWidth) / 2;
  });
  var tq = el("#tq");
  if (tq) {
    tq.addEventListener("input", applyFinder);
    els("[data-fsec]").forEach(function (b) { b.addEventListener("click", function () {
      learnSec = (b.classList.contains("stile") && learnSec === b.dataset.fsec) ? "" : b.dataset.fsec;
      els("[data-fsec]").forEach(function (c) { c.classList.toggle("on", c.dataset.fsec === learnSec && !(c.classList.contains("stile") && !learnSec)); });
      applyFinder();
      if (b.classList.contains("stile")) { var f = el("#finder"); if (f) f.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" }); }
    }); });
    els("[data-ftodo]").forEach(function (b) { b.addEventListener("click", function () {
      learnTodo = !learnTodo; b.classList.toggle("on", learnTodo); applyFinder(); }); });
    els("[data-f26]").forEach(function (b) { b.addEventListener("click", function () {
      learn26 = !learn26; b.classList.toggle("on", learn26); applyFinder(); }); });
    applyFinder();
  }
  wireDD(el('[data-dd="tsel"]'), function (v) { var x = v.split("|"); location.hash = learnHref(x[0], x[1]).slice(1); });
  els("[data-rs]").forEach(function (b) { b.addEventListener("click", function () {
    if (b.dataset.rs === "cycle") { var r = readScale(); setReadScale(r >= 1.3 ? 0.9 : r < 1 ? 1 : r < 1.15 ? 1.15 : 1.3); }
    else setReadScale(readScale() + (+b.dataset.rs) * 0.1);
  }); });
  var fb = el("#focus");
  if (fb) fb.addEventListener("click", function () {
    var on = !document.body.classList.contains("focus");
    document.body.classList.toggle("focus", on); fb.setAttribute("aria-pressed", on);
    try { localStorage.setItem("cgl-focus", on ? "1" : ""); } catch (e) {}
  });
  wireGseg();
  wireWelcome(); wirePay(); wireAdmin(); wirePdf(); wireInvite(main); wireShareSol(main);
  var tbx = el("[data-tbx]"); if (tbx) tbx.addEventListener("click", function () { try { sessionStorage.setItem("cgl-tbar", "x"); } catch (e) {} var b = el(".tbar"); if (b) b.remove(); });
  var tbi = el("[data-tbinv]"); if (tbi) tbi.addEventListener("click", function () { shareOut(inviteText(), inviteURL()); });
  var ra = el("#railAdmin"); if (ra) ra.hidden = !isAdmin();
  var rp = el("#railPrem"); if (rp) { rp.hidden = !AU; var lb = el(".lb", rp); if (lb) lb.textContent = onTrial() ? "Trial · " + trialLeft() + " days left" : isPremium() ? (isAdmin() ? "Premium · owner" : "Pass active") : passName() + ", ₹" + passRupees(); rp.classList.toggle("is-prem", isPremium()); }
  els("[data-mode]").forEach(function (a) { a.addEventListener("click", function () { gateMode = FBCFG === null ? (a.dataset.mode === "up" ? "up" : "in") : "fb"; }); });
  els("[data-cacat]").forEach(function (b) { b.addEventListener("click", function () {
    var grid = el("#cagrid");
    if (!grid) { caCat = b.dataset.cacat; route(); return; }   // topic view keeps the old path
    caCat = b.dataset.cacat;
    els("[data-cacat]").forEach(function (x) { x.classList.toggle("on", x === b); });
    grid.classList.toggle("one", !!caCat);
    els(".cacard", grid).forEach(function (c) {
      var show = !caCat || c.dataset.cat === caCat;
      c.hidden = !show;
      var long = els(".cc-l li", c).length > 5;
      c.classList.toggle("fold", long && !caCat && !c.dataset.opened);
      var mb = el("[data-more]", c); if (mb) mb.hidden = !!caCat || !!c.dataset.opened;
    });
    var pk = el(".capicks"); if (pk) pk.hidden = !!caCat;
    var tools = el(".ca-tools"), top = tools.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.6) tools.scrollIntoView({ block: "start", behavior: "smooth" });
    var M = window.Motion;
    if (M && !BOT && !reduceMotion()) M.animate(els(".cacard:not([hidden])", grid).slice(0, 4), { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0)"] }, { delay: M.stagger(0.04), duration: 0.35, ease: [0.23, 1, 0.32, 1] });
  }); });
  wireCa();
  wireVideos(document);
  var o = el("#out");
  if (o) o.addEventListener("click", signOut);
  els("[data-th]").forEach(function (b) { b.addEventListener("click", function () {
    var v = b.dataset.th, d = document.documentElement;
    if (v === "auto") { d.removeAttribute("data-theme"); try { localStorage.removeItem("cgl-theme"); } catch (e) {} }
    else { d.setAttribute("data-theme", v); try { localStorage.setItem("cgl-theme", v); } catch (e) {} }
    els("[data-th]").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
    window.dispatchEvent(new Event("cgl-theme"));
  }); });
  els("[data-acrs]").forEach(function (b) { b.addEventListener("click", function () {
    setReadScale(readScale() + (+b.dataset.acrs) * 0.1);
    var v = el("#rsv"); if (v) v.textContent = Math.round(readScale() * 100) + "%";
  }); });
  var w = el("#wipe");
  if (w) w.addEventListener("click", function () {
    if (!confirm("Erase every answer, card rating, error-log entry and ticked task? This cannot be undone.")) return;
    ST = fresh(); QIDX = null; save(); route();
  });
}

/* ── rail: full or icon-only, remembered per device ── */
(function () {
  var b = document.getElementById("railToggle");
  function set(mini) {
    document.body.classList.toggle("rail-mini", mini);
    if (b) { b.setAttribute("aria-expanded", String(!mini)); b.setAttribute("aria-label", mini ? "Expand sidebar" : "Collapse sidebar"); }
    try { localStorage.setItem("cgl-rail", mini ? "mini" : ""); } catch (e) {}
  }
  var saved = ""; try { saved = localStorage.getItem("cgl-rail") || ""; } catch (e) {}
  set(saved === "mini");
  if (b) b.addEventListener("click", function () { set(!document.body.classList.contains("rail-mini")); });
  // collapsed-rail labels: one fixed tooltip, placed beside the hovered icon
  var tip = document.createElement("div"); tip.className = "rtip"; tip.setAttribute("aria-hidden", "true"); document.body.appendChild(tip);
  var rail = document.getElementById("rail");
  if (rail) {
    rail.addEventListener("pointerover", function (e) {
      var a = e.target.closest && e.target.closest("a[data-tip]");
      if (!a || !document.body.classList.contains("rail-mini")) { tip.classList.remove("on"); return; }
      var r = a.getBoundingClientRect();
      tip.textContent = a.dataset.tip.replace("&amp;", "&");
      tip.style.left = (r.right + 10) + "px"; tip.style.top = (r.top + r.height / 2) + "px";
      tip.classList.add("on");
    });
    rail.addEventListener("pointerleave", function () { tip.classList.remove("on"); });
    rail.addEventListener("scroll", function () { tip.classList.remove("on"); }, { passive: true });
  }
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); set(!document.body.classList.contains("rail-mini")); }
  });
})();

/* ── theme ── */
(function () {
  var t = null;
  try { t = localStorage.getItem("cgl-theme"); } catch (e) {}
  if (t) document.documentElement.setAttribute("data-theme", t);
  function toggle() {
    var cur = document.documentElement.getAttribute("data-theme");
    var dark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
    var next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("cgl-theme", next); } catch (e) {}
    window.dispatchEvent(new Event("cgl-theme"));
  }
  ["theme", "theme2"].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener("click", toggle);
  });
})();

window.addEventListener("hashchange", route);
var DATA_READY;
if (!AU && /^#?\/?$|^#\/(account|premium|legal|cutoffs)\b/.test(location.hash || "#/")) {
  // the front door: one small file, then paint; the question data follows once the page is idle
  var landing = /^#?\/?$/.test(location.hash || "#/");
  if (landing) route();   // the landing has its numbers built in; paint it before any fetch
  DATA_READY = fetch("data/meta.json?v=" + DATAV).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) D.meta = j; if (!landing) route(); else landingFill(); })
    .then(function () { return new Promise(function (res) { (window.requestIdleCallback || function (f) { setTimeout(f, 800); })(res, { timeout: 4000 }); }); })
    .then(load).then(function () { QIDX = null; });
  DATA_READY.catch(function (e) {
    main.innerHTML = '<div class="blank"><b>Could not load the question data</b><p>' + h(e.message) + '</p></div>';
  });
} else {
DATA_READY = load().then(function () { QIDX = null; return AU ? Promise.all([pull(), refreshMe()]) : null; })
  .then(function () { syncExam(); return loadPremium(); }).then(route);
DATA_READY.catch(function (e) {
  main.innerHTML = '<div class="blank"><b>Could not load the question data</b><p>' + h(e.message) + '</p>' +
    '<p style="margin-top:10px;font-size:14px">If you opened the file directly, run a local server instead. Browsers block fetch on file URLs.</p></div>';
});
}
})();
