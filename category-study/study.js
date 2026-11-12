(function () {
  "use strict";
  var CFG = window.STUDY_CONFIG || {};
  var KEY = "study:" + (CFG.STUDY || "default");
  var N = 10;
  var classes = [];
  var state = null;
  var shownAt = 0;
  var $ = function (id) { return document.getElementById(id); };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private window: no draft, still works */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
  }
  function newSession() {
    var a = new Uint8Array(6);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function fresh() {
    var s = { session: newSession(), participant: "", started_at: new Date().toISOString(), step: 0, answers: {} };
    classes.forEach(function (c) { s.answers[c.id] = { props: [], viewed: false, opens: 0, first_view_ms: null, ms: 0 }; });
    return s;
  }
  function show(id) {
    ["welcome", "category", "review", "done"].forEach(function (s) { $(s).hidden = s !== id; });
    window.scrollTo(0, 0);
  }
  function leaveCategory() {
    if (state.step >= 1 && state.step <= classes.length && shownAt) {
      state.answers[classes[state.step - 1].id].ms += Date.now() - shownAt;
      shownAt = 0;
    }
  }
  function filled(id) {
    return state.answers[id].props.map(function (p) { return (p || "").trim(); }).filter(Boolean);
  }

  // The ranks are the rows' positions: after a move the numbers are rewritten and the answers read again in row order.
  function renumber() {
    Array.prototype.forEach.call($("props").children, function (li, k) {
      li.children[1].textContent = (k + 1) + ".";
      li.children[0].setAttribute("aria-label", "Move property " + (k + 1) + " (drag, or use the up and down arrow keys)");
      li.children[2].setAttribute("aria-label", "Property " + (k + 1) + (k === 0 ? " (most important)" : ""));
      li.children[2].placeholder = k === 0 ? "Most important property" : "";
    });
  }
  function sync(a) {
    a.props = Array.prototype.map.call($("props").children, function (li) { return li.children[2].value; });
    save();
  }
  function moved(a) {
    renumber();
    a.reorders = (a.reorders || 0) + 1;
    sync(a);
  }
  // Drag a row by its handle (mouse, pen, or touch, through pointer events), or move it with the arrow keys.
  function draggable(li, handle, a) {
    var ol = $("props"), start = -1;
    var index = function () { return Array.prototype.indexOf.call(ol.children, li); };
    handle.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      start = index();
      li.classList.add("dragging");
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no pointer to capture */ }
    });
    handle.addEventListener("pointermove", function (e) {
      if (start < 0) return;
      if (e.clientY < 60) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
      var rows = Array.prototype.filter.call(ol.children, function (r) { return r !== li; });
      var before = null;
      for (var r = 0; r < rows.length; r++) {
        var box = rows[r].getBoundingClientRect();
        if (e.clientY < box.top + box.height / 2) { before = rows[r]; break; }
      }
      if (before !== li.nextSibling || (before === null && ol.lastChild !== li)) {
        ol.insertBefore(li, before);
        renumber();
      }
    });
    var end = function () {
      if (start < 0) return;
      li.classList.remove("dragging");
      if (index() !== start) moved(a);
      start = -1;
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("keydown", function (e) {
      var i = index();
      if (e.key === "ArrowUp" && i > 0) ol.insertBefore(li, ol.children[i - 1]);
      else if (e.key === "ArrowDown" && i < ol.children.length - 1) ol.insertBefore(li, ol.children[i + 1].nextSibling);
      else return;
      e.preventDefault();
      handle.focus();
      moved(a);
    });
  }

  function renderCategory() {
    var i = state.step - 1, c = classes[i], a = state.answers[c.id];
    $("bar").style.width = (100 * i / classes.length) + "%";
    $("count").textContent = "Class " + (i + 1) + " of " + classes.length;
    $("name").textContent = c.name;
    $("error").textContent = "";
    var ol = $("props");
    ol.innerHTML = "";
    for (var k = 0; k < N; k++) {
      var li = document.createElement("li");
      var handle = document.createElement("button");
      handle.type = "button";
      handle.className = "handle";
      handle.textContent = "☰";
      handle.title = "Drag to reorder";
      var num = document.createElement("span");
      var inp = document.createElement("input");
      inp.type = "text";
      inp.maxLength = 300;
      inp.autocomplete = "off";
      inp.value = a.props[k] || "";
      inp.addEventListener("input", function () { sync(a); });
      li.appendChild(handle);
      li.appendChild(num);
      li.appendChild(inp);
      ol.appendChild(li);
      draggable(li, handle, a);
    }
    renumber();
    var g = $("gallery");
    g.hidden = true;
    g.innerHTML = "";
    $("toggle").textContent = "Show 5 example instances";
    $("toggle").setAttribute("aria-expanded", "false");
    $("back").disabled = false;
    $("next").textContent = state.step === classes.length ? "Review" : "Next";
    shownAt = Date.now();
    show("category");
    ol.querySelector("input").focus();
  }

  function toggleGallery() {
    var c = classes[state.step - 1], a = state.answers[c.id], g = $("gallery");
    if (g.hidden) {
      if (!g.childElementCount) {
        c.images.forEach(function (im) {
          var fig = document.createElement("figure");
          var link = document.createElement("a");
          link.href = im.src;
          link.target = "_blank";
          link.rel = "noopener";
          var img = document.createElement("img");
          img.src = im.src;
          img.alt = "Example of " + c.name;
          img.loading = "lazy";
          link.appendChild(img);
          fig.appendChild(link);
          g.appendChild(fig);  // no caption under the image (the user, 2026-11-11); the credits are on credits.html
        });
      }
      g.hidden = false;
      a.opens += 1;
      if (!a.viewed) {
        a.viewed = true;
        a.first_view_ms = a.ms + (Date.now() - shownAt);
      }
      save();
      $("toggle").textContent = "Hide example instances";
      $("toggle").setAttribute("aria-expanded", "true");
    } else {
      g.hidden = true;
      $("toggle").textContent = "Show 5 example instances";
      $("toggle").setAttribute("aria-expanded", "false");
    }
  }

  function renderReview() {
    $("bar").style.width = "100%";
    var ul = $("summary");
    ul.innerHTML = "";
    classes.forEach(function (c) {
      var li = document.createElement("li");
      var n = filled(c.id).length;
      li.textContent = c.name + ": " + n + " propert" + (n === 1 ? "y" : "ies");
      ul.appendChild(li);
    });
    $("submit-error").textContent = "";
    $("submit").disabled = false;
    show("review");
  }

  function go(step) {
    leaveCategory();
    state.step = step;
    save();
    if (step === 0) show("welcome");
    else if (step <= classes.length) renderCategory();
    else renderReview();
  }

  function payload() {
    return {
      study: CFG.STUDY || "",
      session: state.session,
      participant: state.participant,
      started_at: state.started_at,
      submitted_at: new Date().toISOString(),
      user_agent: navigator.userAgent,
      classes: classes.map(function (c, i) {
        var a = state.answers[c.id];
        return { id: c.id, name: c.name, position: i + 1, properties: filled(c.id), reorders: a.reorders || 0, viewed_images: a.viewed,
                 image_opens: a.opens, first_view_seconds: a.first_view_ms == null ? null : Math.round(a.first_view_ms / 100) / 10,
                 seconds: Math.round(a.ms / 100) / 10 };
      })
    };
  }

  function download(data) {
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "responses-" + state.session + ".json";
    a.textContent = "download your answers";
    return a;
  }

  function submit() {
    var data = payload();
    var err = $("submit-error");
    err.textContent = "";
    if (!CFG.SUBMIT_URL) {
      err.textContent = "This page is not connected to a spreadsheet yet, so your answers cannot be sent. Please ";
      err.appendChild(download(data));
      err.appendChild(document.createTextNode(" and send the file to the researcher."));
      return;
    }
    $("submit").disabled = true;
    $("submit").textContent = "Sending...";
    // text/plain keeps this a simple request (no CORS preflight), which Apps Script web apps accept.
    fetch(CFG.SUBMIT_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" },
                            body: JSON.stringify(data) })
      .then(function () {
        state.submitted = data.submitted_at;
        save();
        $("code").textContent = state.session;
        show("done");
      })
      .catch(function () {
        $("submit").disabled = false;
        $("submit").textContent = "Submit";
        err.textContent = "Your answers could not be sent (no connection?). Please try again, or ";
        err.appendChild(download(data));
        err.appendChild(document.createTextNode(" and send the file to the researcher."));
      });
  }

  function init(manifest) {
    classes = manifest.classes;
    state = load();
    if (!state || state.submitted || !state.answers || classes.some(function (c) { return !state.answers[c.id]; })) state = fresh();
    $("participant").value = state.participant || "";
    $("participant").addEventListener("input", function (e) { state.participant = e.target.value.trim(); save(); });
    $("start").addEventListener("click", function () { go(1); });
    $("toggle").addEventListener("click", toggleGallery);
    $("back").addEventListener("click", function () { go(state.step - 1); });
    $("next").addEventListener("click", function () {
      if (!filled(classes[state.step - 1].id).length) {
        $("error").textContent = "Please write at least one property.";
        return;
      }
      go(state.step + 1);
    });
    $("review-back").addEventListener("click", function () { go(classes.length); });
    $("submit").addEventListener("click", submit);
    window.addEventListener("pagehide", function () { leaveCategory(); save(); });
    go(Math.min(state.step || 0, classes.length + 1));
  }

  fetch("images/manifest.json")
    .then(function (r) { return r.json(); })
    .then(init)
    .catch(function () {
      document.getElementById("app").innerHTML = '<section class="step"><h1>Could not load the study</h1>' +
        "<p>Please reload the page. If it keeps happening, contact the researcher.</p></section>";
    });
})();
