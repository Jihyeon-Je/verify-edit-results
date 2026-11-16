(function () {
  "use strict";
  var CFG = window.STUDY_CONFIG || {};
  var KEY = "study:" + (CFG.STUDY || "default");
  var CHUNK = 20;  // the endpoint writes at most 20 rows per request
  var items = [];
  var state = null;
  var shownAt = null;  // when the current pair was shown
  var $ = function (id) { return document.getElementById(id); };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private window: no draft, still works */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
  }
  function token() {
    var a = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function fresh() {
    var s = { session: token(), participant: "", started_at: null, at: "welcome", index: 0, answers: {}, pending: {}, done: false };
    items.forEach(function (it) { s.answers[it.id] = { choice: null, changes: 0, first_ms: null, ms: 0 }; });
    return s;
  }
  function answered() { return items.filter(function (it) { return state.answers[it.id].choice; }).length; }

  function show(id) {
    ["welcome", "pair", "review", "done"].forEach(function (s) { $(s).hidden = s !== id; });
    state.at = id;
    save();
    window.scrollTo(0, 0);
  }

  // time on a pair counts while it is shown
  function leavePair() {
    if (state.at !== "pair" || shownAt === null) return;
    state.answers[items[state.index].id].ms += Date.now() - shownAt;
    shownAt = null;
    save();
  }

  function renderPair() {
    var it = items[state.index], a = state.answers[it.id];
    $("count").textContent = "Pair " + (state.index + 1) + " of " + items.length + " · " + answered() + " answered";
    $("bar").style.width = (100 * answered() / items.length) + "%";
    $("name").textContent = it.name;
    $("name2").textContent = it.name;
    $("views-note").textContent = it.medium === "blender" ? "Each box shows one 3D object from two viewpoints." : "";
    ["A", "B"].forEach(function (side) {
      var img = $("img-" + side);
      img.src = it[side];
      $("side-" + side).classList.toggle("chosen", a.choice === side);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".choice"), function (b) {
      b.setAttribute("aria-checked", String(a.choice === b.dataset.choice));
    });
    $("back").disabled = state.index === 0;
    $("next").textContent = state.index === items.length - 1 ? "Review →" : "Next →";
    shownAt = Date.now();
    preload(state.index + 1);
  }
  function preload(i) {
    if (i >= items.length) return;
    ["A", "B"].forEach(function (side) { var im = new Image(); im.src = items[i][side]; });
  }

  function choose(c) {
    if (state.at !== "pair") return;
    var it = items[state.index], a = state.answers[it.id];
    if (a.choice === c) return;
    if (a.choice) a.changes += 1;
    if (a.first_ms === null) a.first_ms = a.ms + (shownAt === null ? 0 : Date.now() - shownAt);
    a.choice = c;
    state.pending[it.id] = true;
    save();
    var keep = shownAt;
    renderPair();
    shownAt = keep;  // re-rendering the same pair does not restart its clock
  }

  function go(i) {
    leavePair();
    flush();
    if (i < 0) i = 0;
    if (i >= items.length) { renderReview(); show("review"); return; }
    state.index = i;
    show("pair");
    renderPair();
  }

  function renderReview() {
    var n = answered(), missing = items.filter(function (it) { return !state.answers[it.id].choice; });
    $("review-text").textContent = missing.length
      ? "You answered " + n + " of " + items.length + " pairs. Please answer the ones below before you submit."
      : "You answered all " + items.length + " pairs. You can go back to change anything before you submit.";
    var ul = $("missing");
    ul.innerHTML = "";
    missing.forEach(function (it) {
      var li = document.createElement("li"), link = document.createElement("a");
      link.href = "#";
      link.textContent = "Pair " + (items.indexOf(it) + 1) + ": " + it.name;
      link.addEventListener("click", function (e) { e.preventDefault(); go(items.indexOf(it)); });
      li.appendChild(link);
      ul.appendChild(li);
    });
    $("submit").disabled = missing.length > 0;
    $("submit-error").textContent = "";
  }

  function row(it, i) {
    var a = state.answers[it.id];
    return { id: it.id, name: it.name, position: i + 1, properties: [a.choice || "", it.medium], reorders: a.changes,
             viewed_images: false, image_opens: 0, first_view_seconds: a.first_ms === null ? null : Math.round(a.first_ms / 100) / 10,
             seconds: Math.round(a.ms / 100) / 10 };
  }
  function payload(kind, ids) {
    return { study: CFG.STUDY || "", kind: kind, session: state.session, participant: state.participant,
             started_at: state.started_at, submitted_at: kind === "final" ? new Date().toISOString() : "",
             user_agent: navigator.userAgent,
             classes: items.map(row).filter(function (r) { return ids.indexOf(r.id) >= 0; }) };
  }
  function post(data) {
    // text/plain keeps this a simple request (no CORS preflight); a save counts only when the script answers {"ok": true}
    return fetch(CFG.SUBMIT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json(); })
      .then(function (reply) {
        if (!reply || reply.ok !== true) throw new Error((reply && reply.error) || "not saved");
        return reply;
      });
  }
  function chunks(ids) {
    var out = [];
    for (var i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK));
    return out;
  }
  // saves go one at a time, in order; a pair whose save failed stays pending and goes with the next one
  var queue = Promise.resolve();
  function flush() {
    if (!CFG.SUBMIT_URL) return queue;
    queue = queue.then(function () {
      var ids = Object.keys(state.pending || {});
      if (!ids.length) return;
      return chunks(ids).reduce(function (p, part) {
        return p.then(function () {
          return post(payload("progress", part)).then(function () {
            part.forEach(function (id) { delete state.pending[id]; });
            save();
          });
        });
      }, Promise.resolve()).catch(function () { /* kept pending; tried again on the next move */ });
    });
    return queue;
  }
  function submit() {
    var btn = $("submit");
    btn.disabled = true;
    btn.textContent = "Sending…";
    $("submit-error").textContent = "";
    if (!CFG.SUBMIT_URL) {
      $("submit-error").textContent = "This page has no response endpoint set up.";
      btn.disabled = false;
      btn.textContent = "Submit";
      return;
    }
    var ids = items.map(function (it) { return it.id; });
    queue.then(function () {
      return chunks(ids).reduce(function (p, part) {
        return p.then(function () { return post(payload("final", part)); });
      }, Promise.resolve());
    }).then(function () {
      state.done = true;
      state.pending = {};
      $("code").textContent = state.session;
      show("done");
    }, function () {
      $("submit-error").textContent = "Your answers could not be sent. Please check your connection and press Submit again.";
      btn.disabled = false;
      btn.textContent = "Submit";
    });
  }

  function openHelp() {
    var d = $("help-dialog");
    if (d.open) return;
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
  }
  function closeHelp() {
    var d = $("help-dialog");
    if (typeof d.close === "function") d.close(); else d.removeAttribute("open");
  }

  function start() {
    state.participant = $("participant").value.trim();
    if (!state.started_at) state.started_at = new Date().toISOString();
    go(state.index || 0);
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ($("help-dialog").open) return;  // Escape closes it
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    var k = e.key;
    if (state.at === "pair") {
      if (k === "a" || k === "A") { choose("A"); e.preventDefault(); }
      else if (k === "b" || k === "B") { choose("B"); e.preventDefault(); }
      else if (k === "s" || k === "S") { choose("same"); e.preventDefault(); }
      else if (k === "ArrowRight") { go(state.index + 1); e.preventDefault(); }
      else if (k === "ArrowLeft") { if (state.index > 0) go(state.index - 1); e.preventDefault(); }
    } else if (state.at === "review" && k === "ArrowLeft") {
      go(items.length - 1);
      e.preventDefault();
    }
  }

  function init(list) {
    items = list;
    var saved = load();
    var ok = saved && saved.answers && items.every(function (it) { return saved.answers[it.id]; }) && !saved.done;
    state = ok ? saved : fresh();
    state.pending = state.pending || {};
    Array.prototype.forEach.call(document.querySelectorAll(".n-pairs"), function (s) { s.textContent = items.length; });
    $("help-body").innerHTML = $("instructions").innerHTML;
    $("participant").value = state.participant || "";
    $("start").textContent = state.started_at ? "Continue" : "Start";
    $("start").addEventListener("click", start);
    $("back").addEventListener("click", function () { go(state.index - 1); });
    $("next").addEventListener("click", function () { go(state.index + 1); });
    $("review-back").addEventListener("click", function () { go(items.length - 1); });
    $("submit").addEventListener("click", submit);
    $("help").addEventListener("click", openHelp);
    $("help-close").addEventListener("click", closeHelp);
    Array.prototype.forEach.call(document.querySelectorAll(".choice"), function (b) {
      b.addEventListener("click", function () { choose(b.dataset.choice); b.blur(); });
    });
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { leavePair(); flush(); }
      else if (state.at === "pair" && shownAt === null) shownAt = Date.now();
    });
    window.addEventListener("pagehide", function () { leavePair(); });
    if (state.at === "pair") go(state.index);
    else if (state.at === "review") { renderReview(); show("review"); }
    else show("welcome");
  }

  fetch("items.json?v=1").then(function (r) { return r.json(); }).then(init, function () {
    document.getElementById("app").innerHTML = '<section class="step narrow"><h1>Could not load the study</h1>' +
      "<p>Please reload the page.</p></section>";
  });
})();
