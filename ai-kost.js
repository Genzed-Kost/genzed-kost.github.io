/* =====================================================================
   AI Kost — widget tanya-jawab (peraturan, FAQ, harga, fasilitas).
   Dipasang di halaman statis lewat:
     <script src="ai-kost.js" data-supabase-url="..." data-supabase-key="..." defer></script>
   Backend: Supabase Edge Function `ai-kost`.
   Tombol lain bisa membuka panel lewat: window.AIKost.open("pertanyaan opsional")
   ===================================================================== */
(function () {
  "use strict";
  var script = document.currentScript;
  var SUPABASE_URL = (script && script.dataset.supabaseUrl) || "";
  var SUPABASE_KEY = (script && script.dataset.supabaseKey) || "";
  var ENDPOINT = SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/ai-kost";
  var STORE_KEY = "aikost_history_v1";
  var SUGGESTIONS = [
    "Jam bertamu sampai jam berapa?",
    "Berapa harga kamarnya?",
    "Boleh bawa hewan peliharaan?",
    "Gimana cara bayar sewa?",
  ];

  var css = "\
.aik-fab{position:fixed;right:20px;bottom:20px;z-index:310;display:inline-flex;align-items:center;gap:8px;\
border:none;border-radius:100px;padding:12px 18px 12px 14px;cursor:pointer;color:#fff;font:600 .88rem 'DM Sans',system-ui,sans-serif;\
background:linear-gradient(120deg,#7C3AED,#DB2777 55%,#F97316);box-shadow:0 14px 34px -10px rgba(219,39,119,.7);\
transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s}\
.aik-fab:hover{transform:translateY(-3px);box-shadow:0 18px 40px -10px rgba(219,39,119,.85)}\
.aik-fab-ico{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.2);display:grid;place-items:center;font-size:1rem}\
body:has(.admin-edit-fab) .aik-fab{bottom:80px}\
.aik-panel{position:fixed;right:20px;bottom:20px;z-index:320;width:min(380px,calc(100vw - 32px));height:min(580px,calc(100svh - 40px));\
display:flex;flex-direction:column;overflow:hidden;border-radius:22px;color:#F5F3FF;font-family:'DM Sans',system-ui,sans-serif;\
background:linear-gradient(#14112B,#14112B) padding-box,linear-gradient(120deg,#7C3AED,#DB2777 55%,#F97316) border-box;border:1.5px solid transparent;\
box-shadow:0 30px 80px -20px rgba(0,0,0,.7),0 0 60px -20px rgba(124,58,237,.6);\
opacity:0;transform:translateY(16px) scale(.98);pointer-events:none;transition:opacity .25s,transform .3s cubic-bezier(.22,1,.36,1)}\
.aik-panel.open{opacity:1;transform:none;pointer-events:auto}\
.aik-head{display:flex;align-items:center;gap:12px;padding:14px 16px;background:linear-gradient(120deg,rgba(124,58,237,.35),rgba(219,39,119,.25) 55%,rgba(249,115,22,.2))}\
.aik-avatar{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:1.2rem;background:linear-gradient(120deg,#7C3AED,#DB2777 55%,#F97316)}\
.aik-title{font:700 1rem 'Syne',sans-serif;line-height:1.2}\
.aik-sub{font-size:.72rem;color:#D6D2F0}\
.aik-x{margin-left:auto;background:rgba(255,255,255,.1);border:none;color:#fff;width:32px;height:32px;border-radius:10px;cursor:pointer;font-size:1rem}\
.aik-x:hover{background:rgba(255,255,255,.2)}\
.aik-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}\
.aik-msg{max-width:86%;padding:10px 13px;border-radius:16px;font-size:.88rem;line-height:1.55;word-wrap:break-word;white-space:pre-wrap}\
.aik-msg.bot{align-self:flex-start;background:#1D1938;border:1px solid #2C2752;border-bottom-left-radius:6px}\
.aik-msg.user{align-self:flex-end;color:#fff;background:linear-gradient(120deg,#7C3AED,#DB2777);border-bottom-right-radius:6px}\
.aik-msg.err{align-self:flex-start;background:rgba(242,85,85,.12);border:1px solid rgba(242,85,85,.35);color:#FFC9C9}\
.aik-msg a{color:#F9A8D4}\
.aik-typing{display:inline-flex;gap:4px;padding:4px 2px}\
.aik-typing i{width:7px;height:7px;border-radius:50%;background:#C084FC;animation:aik-b 1s infinite ease-in-out}\
.aik-typing i:nth-child(2){animation-delay:.15s;background:#F472B6}.aik-typing i:nth-child(3){animation-delay:.3s;background:#FB923C}\
@keyframes aik-b{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-5px);opacity:1}}\
.aik-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 10px}\
.aik-chip{background:rgba(192,132,252,.1);border:1px solid rgba(192,132,252,.3);color:#E9D5FF;border-radius:100px;padding:6px 11px;\
font:500 .76rem 'DM Sans',system-ui,sans-serif;cursor:pointer;transition:background .2s}\
.aik-chip:hover{background:rgba(244,114,182,.18)}\
.aik-form{display:flex;gap:8px;padding:12px;border-top:1px solid #2C2752;background:#110E25}\
.aik-input{flex:1;min-width:0;background:#1D1938;border:1px solid #2C2752;border-radius:100px;padding:11px 15px;color:#F5F3FF;\
font:400 .88rem 'DM Sans',system-ui,sans-serif;outline:none}\
.aik-input:focus{border-color:#C084FC}\
.aik-send{flex-shrink:0;width:42px;height:42px;border:none;border-radius:50%;cursor:pointer;color:#fff;font-size:1.05rem;\
background:linear-gradient(120deg,#7C3AED,#DB2777 55%,#F97316)}\
.aik-send:disabled{opacity:.45;cursor:default}\
.aik-note{font-size:.66rem;color:#8F89B8;text-align:center;padding:0 12px 10px;background:#110E25}\
@media (max-width:480px){.aik-panel{right:8px;bottom:8px;width:calc(100vw - 16px);height:calc(100svh - 16px)}.aik-fab-txt{display:none}.aik-fab{padding:12px}}\
@media (prefers-reduced-motion:reduce){.aik-panel,.aik-fab{transition:none}.aik-typing i{animation:none}}";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function loadHistory() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "[]") || []; } catch (e) { return []; }
  }
  function saveHistory(h) {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(h.slice(-20))); } catch (e) { /* abaikan */ }
  }

  function init() {
    var style = el("style"); style.textContent = css; document.head.appendChild(style);

    var fab = el("button", "aik-fab");
    fab.type = "button";
    fab.setAttribute("aria-label", "Buka AI Kost");
    fab.innerHTML = '<span class="aik-fab-ico" aria-hidden="true">🤖</span><span class="aik-fab-txt">Tanya AI Kost</span>';

    var panel = el("div", "aik-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "AI Kost");
    panel.innerHTML =
      '<div class="aik-head"><div class="aik-avatar" aria-hidden="true">🤖</div>' +
      '<div><div class="aik-title">AI Kost</div><div class="aik-sub">Tanya soal peraturan, FAQ, harga &amp; fasilitas</div></div>' +
      '<button type="button" class="aik-x" aria-label="Tutup">✕</button></div>' +
      '<div class="aik-body" aria-live="polite"></div>' +
      '<div class="aik-chips"></div>' +
      '<form class="aik-form"><input class="aik-input" maxlength="600" placeholder="Tulis pertanyaanmu…" aria-label="Pertanyaan untuk AI Kost">' +
      '<button class="aik-send" type="submit" aria-label="Kirim">➤</button></form>' +
      '<div class="aik-note">Jawaban AI bisa keliru — untuk kepastian, konfirmasi ke admin.</div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var body = panel.querySelector(".aik-body");
    var chips = panel.querySelector(".aik-chips");
    var form = panel.querySelector(".aik-form");
    var input = panel.querySelector(".aik-input");
    var send = panel.querySelector(".aik-send");
    var history = loadHistory();
    var busy = false;

    function addBubble(role, text) {
      var b = el("div", "aik-msg " + role, text);
      body.appendChild(b);
      body.scrollTop = body.scrollHeight;
      return b;
    }

    function render() {
      body.innerHTML = "";
      addBubble("bot", "Halo! Aku AI Kost 👋 Mau tanya apa soal Genzed Kost? Misalnya jam bertamu, harga kamar, atau cara bayar.");
      history.forEach(function (m) { addBubble(m.role === "user" ? "user" : "bot", m.content); });
      chips.style.display = history.length ? "none" : "";
    }

    SUGGESTIONS.forEach(function (q) {
      var c = el("button", "aik-chip", q);
      c.type = "button";
      c.addEventListener("click", function () { ask(q); });
      chips.appendChild(c);
    });

    function ask(question) {
      question = (question || "").trim();
      if (!question || busy) return;
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        addBubble("err", "AI Kost belum dikonfigurasi.");
        return;
      }
      busy = true; send.disabled = true; input.value = "";
      chips.style.display = "none";
      history.push({ role: "user", content: question });
      addBubble("user", question);
      var typing = el("div", "aik-msg bot");
      typing.innerHTML = '<span class="aik-typing" aria-label="AI Kost sedang mengetik"><i></i><i></i><i></i></span>';
      body.appendChild(typing); body.scrollTop = body.scrollHeight;

      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({ messages: history.slice(-12) }),
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          typing.remove();
          if (res.ok && res.d.reply) {
            history.push({ role: "assistant", content: res.d.reply });
            addBubble("bot", res.d.reply);
          } else {
            history.pop(); // jangan simpan pertanyaan yang gagal dijawab
            addBubble("err", res.d.error || "AI Kost lagi gangguan. Coba lagi nanti ya.");
          }
          saveHistory(history);
        })
        .catch(function () {
          typing.remove();
          history.pop();
          addBubble("err", "Koneksi bermasalah. Cek internetmu lalu coba lagi ya.");
        })
        .finally(function () { busy = false; send.disabled = false; input.focus(); });
    }

    function open(question) {
      panel.classList.add("open");
      fab.style.display = "none";
      setTimeout(function () { input.focus(); }, 200);
      if (question) ask(question);
    }
    function close() {
      panel.classList.remove("open");
      fab.style.display = "";
    }

    fab.addEventListener("click", function () { open(); });
    panel.querySelector(".aik-x").addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) close(); });
    form.addEventListener("submit", function (e) { e.preventDefault(); ask(input.value); });
    document.querySelectorAll("[data-aikost-open]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); open(b.getAttribute("data-aikost-q") || ""); });
    });

    render();
    window.AIKost = { open: open, close: close };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
