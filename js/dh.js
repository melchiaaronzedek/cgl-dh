/* DH's copy of CGL Compass: the site's server, answered inside the browser.
   Vercel paused cglcompass.in on 3 Oct 2026 (the Hobby plan's Blob write limit). This copy serves one
   account, DH, from static files. The paid data is AES-GCM encrypted and opens with DH's key, which comes
   once in the link (#key=…, never sent to the server) and is kept on the device. Progress is saved on
   this device only; #save-progress downloads it. Built into build/dh-site/ by tools/dh_build.mjs. */
(function () {
  "use strict";
  var NAME = "DH", SLUG = "dh", VER = "6e32b3050d";
  var ENT = { premium: true, admin: false, until: Date.UTC(2027, 0, 1), pdf: false, paid: true, trial: false, trialUntil: 0 };   // past Tier 2, so the account page reads sensibly
  var PLANS = {
    pass: { key: "pass", price: 5000, currency: "INR", days: 30, label: "Exam Pass, 30 days" },
    t2: { key: "t2", price: 5000, currency: "INR", days: 75, label: "Tier 2 Pass, 75 days" }
  };
  var METHODS = { pin: true, google: null, phone: null };
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var m = /^#key=([A-Za-z0-9_-]{43})/.exec(location.hash);
  if (m) { put("cgl-dh-key", m[1]); history.replaceState(null, "", location.pathname + location.search + "#/"); }
  // the link pasted into a tab that already shows this copy changes only the hash: take the key and start over
  addEventListener("hashchange", function () {
    var k = /^#key=([A-Za-z0-9_-]{43})/.exec(location.hash);
    if (k) { put("cgl-dh-key", k[1]); history.replaceState(null, "", location.pathname + location.search + "#/"); location.reload(); }
  });
  if (location.hash === "#save-progress") {
    history.replaceState(null, "", location.pathname + location.search + "#/");
    addEventListener("load", function () {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([get("cgl-dh-progress") || "null"], { type: "application/json" }));
      a.download = "cgl-progress-dh.json"; document.body.appendChild(a); a.click();
    });
  }

  // signed in as DH from the first paint: the head's own script looks for this account
  var au = null; try { au = JSON.parse(get("cgl-account") || "null"); } catch (e) {}
  if (!au || au.slug !== SLUG) put("cgl-account", JSON.stringify({ token: "dh", name: NAME, slug: SLUG, ent: ENT, methods: METHODS }));

  /* Without a working key nothing opens and nothing is saved, so a keyless visit can never
     overwrite DH's progress; the page asks for the link instead. */
  function gate(msg) {
    var show = function () {
      if (document.getElementById("dh-gate")) return;
      var g = document.createElement("div");
      g.id = "dh-gate";
      g.style.cssText = "position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;background:#f5f5f7;color:#1d1d1f;font:16px/1.5 Geist,system-ui,sans-serif";
      g.innerHTML = '<form style="max-width:420px;width:100%"><h1 style="font-size:24px;margin:0 0 8px">DH\'s copy of CGL Compass</h1>' +
        '<p style="margin:0 0 16px;color:#6e6e73">' + msg + '</p><input name="k" placeholder="Paste the link here" autocomplete="off" ' +
        'style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #c7c7cc;border-radius:10px;background:#fff;color:#1d1d1f;font:inherit">' +
        '<button style="margin-top:12px;padding:12px 18px;border:0;border-radius:10px;background:#0062d6;color:#fff;font:inherit;font-weight:600">Open</button></form>';
      g.firstChild.onsubmit = function (e) {
        e.preventDefault();
        var mm = /([A-Za-z0-9_-]{43})\s*$/.exec(g.firstChild.k.value.trim());
        if (mm) { put("cgl-dh-key", mm[1]); location.replace(location.pathname + location.search + "#/"); location.reload(); }
      };
      document.body.appendChild(g);
    };
    if (document.body) show(); else addEventListener("DOMContentLoaded", show);
  }
  var keyP = null;
  function key() {
    if (keyP) return keyP;
    var k = get("cgl-dh-key");
    if (!k) { gate("Open the link you were sent, or paste it here."); return Promise.reject(new Error("No key")); }
    var s = atob(k.replace(/-/g, "+").replace(/_/g, "/") + "="), raw = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) raw[i] = s.charCodeAt(i);
    keyP = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    return keyP;
  }
  if (!get("cgl-dh-key")) key().catch(function () {});
  var real = window.fetch.bind(window);
  /* p/<name>.bin is the 12-byte IV, then the ciphertext and its tag */
  function open(name) {
    return real("p/" + name + ".bin?v=" + VER).then(function (r) {
      if (!r.ok) throw new Error("missing " + name);
      return r.arrayBuffer();
    }).then(function (buf) {
      return key().then(function (k) {
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(buf, 0, 12) }, k, new Uint8Array(buf, 12));
      }).catch(function (e) {
        if (e && e.name === "OperationError") {                // a wrong or damaged key
          try { localStorage.removeItem("cgl-dh-key"); } catch (x) {}
          gate("That link did not work. Paste the full link you were sent.");
        }
        throw e;
      });
    });
  }
  function reply(body, status) {
    return Promise.resolve(new Response(typeof body === "string" || body instanceof ArrayBuffer ? body : JSON.stringify(body),
      { status: status || 200, headers: { "Content-Type": "application/json" } }));
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var a = /^(?:https?:\/\/[^\/]+)?\/api\/([a-z-]+)\/?(?:\?(.*))?$/.exec(url);
    if (!a) return real(input, init);
    var ep = a[1], q = new URLSearchParams(a[2] || ""), post = !!(init && init.method === "POST");
    if (ep === "me") return reply({ name: NAME, slug: SLUG, ent: ENT, ref: null, refCount: 0, methods: METHODS,
      plan: PLANS.pass, plans: PLANS, t2ok: true, trial: { days: 5, refBonus: 2, refCap: 10 }, payments: false });
    if (ep === "progress") {
      if (!get("cgl-dh-key")) return reply({ error: "This copy needs DH's link first." }, 503);
      if (post) {
        var d = null; try { d = JSON.parse(init.body).data; } catch (e) {}
        if (!d || typeof d !== "object") return reply({ error: "No data" }, 400);
        put("cgl-dh-progress", JSON.stringify(d));
        return reply({ ok: true });
      }
      var mine = get("cgl-dh-progress");
      if (mine) return reply('{"data":' + mine + "}");
      // first visit on this device: start from the progress exported from the paused store, if any
      return open("progress").then(function (b) { return reply('{"data":' + new TextDecoder().decode(b) + "}"); },
        function () { return reply({ data: null }); });
    }
    if (ep === "data") {
      var f = q.get("f") || "";
      if (!/^[a-z0-9-]+$/.test(f)) return reply({ error: "No such file" }, 404);
      return open(f).then(function (b) { return reply(b); }, function (e) { return reply({ error: e.message }, 403); });
    }
    if (ep === "auth") return post ? reply({ error: "Sign-in is off in this copy: you are signed in as " + NAME + "." }, 400) : reply({ firebase: null });
    if (ep === "file") return reply({ error: "Book pages are not available in this copy." }, 404);
    if (ep === "create-order" || ep === "verify-payment") return reply({ error: "Payments are off in this copy." }, 400);
    return reply({ error: "Not available in this copy." }, 404);
  };
})();
