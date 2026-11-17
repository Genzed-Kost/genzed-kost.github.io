/* =====================================================================
   AI Kost — asisten tanya-jawab Genzed Kost (peraturan, FAQ, harga, fasilitas, lokasi).

   100% GRATIS: semuanya jalan di browser pengunjung. Tidak ada API key, tidak ada
   server, tidak ada biaya per pertanyaan. Cara kerjanya:
     1. Baca ai-kost-data.json (FAQ, peraturan kost, kebijakan privasi) dan index.html
        (harga, fasilitas, lokasi) dari situs yang sedang live.
     2. Pecah jadi potongan info (1 pertanyaan FAQ, 1 butir peraturan, 1 kartu harga, dst).
     3. Cocokkan pertanyaan pengunjung dengan potongan itu (kata dasar + sinonim + bobot
        kata langka), lalu tampilkan jawaban yang paling cocok beserta sumbernya.
   Mau ubah jawaban? Edit ai-kost-data.json (atau harga/fasilitas di index.html) — AI Kost otomatis ikut.
   Buka otomatis lewat URL: tambahkan #tanya-ai (mis. https://genzed-kost.github.io/#tanya-ai).

   Dipasang di halaman statis:
     <script src="ai-kost.js" defer></script>
   Tanpa tombol melayang (mis. di portal): <script src="/ai-kost.js" data-widget="false">
   API untuk kode lain:  window.AIKost.ask("pertanyaan") -> Promise<{text, items, source?}>
                         window.AIKost.open("pertanyaan opsional")   (kalau widget aktif)
   ===================================================================== */
(function () {
  "use strict";
  var script = document.currentScript;
  var BASE = script && script.src ? new URL(".", script.src).href : new URL("/", location.href).href;
  var WITH_WIDGET = !(script && script.dataset.widget === "false");
  var WA_LINK = "https://wa.link/v5vckc";
  var STORE_KEY = "aikost_history_v3";
  var IDLE_LIMIT_MS = 8 * 60 * 60 * 1000; // riwayat chat dihapus kalau 8 jam nggak dipakai
  var SUGGESTIONS = [
    "Jam bertamu sampai jam berapa?",
    "Berapa harga kamarnya?",
    "Boleh bawa hewan peliharaan?",
    "Gimana cara bayar sewa?",
    "Data pribadiku dipakai buat apa?",
  ];

  /* ---------------- Pemrosesan bahasa sederhana ---------------- */
  var STOP = (
    "yang di ke dari dan atau itu ini apa apakah gimana bagaimana berapa kah sih dong kok ya yah aja saja " +
    "deh nih tuh lah kan dgn dengan untuk buat utk sama juga ada adakah mau ingin pengen tanya nanya mohon tolong " +
    "cara kalau kalo klo jika bila kapan saya aku gue gua lo lu kamu kak min admin bang mas mbak boleh bisa bolehkah " +
    "dilarang larang tidak nggak gak ga engga enggak ngga jangan harus wajib apa2 gitu begitu seperti kayak kaya " +
    "nya pun para oleh pada dalam luar atas bawah sudah udah belum masih akan lagi bgt banget sangat paling " +
    "sampai sampe hingga bawa membawa punya gimana2 " +
    "genzed kost kos ngekos"
  ).split(" ");
  var STOPSET = {};
  STOP.forEach(function (w) { STOPSET[w] = 1; });

  // Kata -> kata kanonik, supaya "berkunjung", "besuk", "tamu" dianggap sama.
  var SYN_GROUPS = [
    ["tamu", "kunjung", "besuk", "bertamu", "temen", "teman", "pacar", "keluarga", "ortu"],
    ["inap", "nginep", "nginap", "menginap", "bermalam"],
    ["kunci", "tutup", "gerbang", "pintu", "pulang", "akses"],
    ["rokok", "merokok", "vape", "vaping", "sebat", "udud"],
    ["hewan", "peliharaan", "kucing", "anjing", "pet", "binatang", "hamster", "ikan"],
    ["harga", "biaya", "tarif", "price", "murah", "mahal", "ongkos"],
    ["bayar", "pembayaran", "transfer", "tf", "qris", "rekening", "ewallet", "dana", "ovo", "gopay"],
    ["denda", "telat", "terlambat", "lambat", "nunggak", "tunggak", "tunggakan"],
    ["deposit", "jaminan", "dp", "uang muka"],
    ["parkir", "motor", "mobil", "kendaraan"],
    ["wifi", "internet", "wi-fi", "mbps", "sinyal", "koneksi"],
    ["masak", "kompor", "dapur", "rice", "cooker", "magicom"],
    ["narkoba", "miras", "alkohol", "minuman", "mabuk", "obat"],
    ["sampah", "bersih", "kebersihan", "kotor"],
    ["suara", "berisik", "musik", "ribut", "bising", "volume"],
    ["lokasi", "alamat", "dimana", "mana", "jarak", "dekat", "deket", "dket", "maps", "peta"],
    ["kampus", "untirta", "unpam", "pamulang", "kuliah", "universitas"],
    ["kamar", "room", "tipe", "suite", "starter"],
    ["ac", "dingin", "pendingin"],
    ["luas", "ukuran", "ukur", "besar", "meter", "size", "lebar"],
    ["mandi", "wc", "toilet", "kloset", "air", "panas", "heater"],
    ["kontrak", "durasi", "bulanan", "tahunan", "perpanjang"],
    ["keluar", "pindah", "checkout", "berhenti", "cabut"],
    ["aman", "keamanan", "cctv", "satpam", "security", "penjaga"],
    ["sanksi", "hukuman", "langgar", "pelanggaran", "teguran", "usir"],
    ["daftar", "booking", "pesan", "survei", "survey"],
    ["fasilitas", "dapat", "tersedia", "termasuk"],
    ["portal", "login", "akun", "aplikasi"],
    ["data", "privasi", "pribadi", "ktp", "identitas", "informasi"],
    ["hak", "hapus", "koreksi", "ubah"],
  ];
  var SYN = {};
  SYN_GROUPS.forEach(function (g) { g.forEach(function (w) { SYN[stem(w)] = g[0]; SYN[w] = g[0]; }); });

  function stem(w) {
    if (w.length > 5) w = w.replace(/(nya|kan|lah|kah|pun|ku|mu)$/, "");
    if (w.length > 5) w = w.replace(/(an|i)$/, "");
    var pre = ["meng", "meny", "mem", "men", "me", "peng", "peny", "pem", "pen", "pe", "ber", "be", "ter", "di", "ke", "se"];
    for (var i = 0; i < pre.length; i++) {
      if (w.indexOf(pre[i]) === 0 && w.length - pre[i].length >= 4) { w = w.slice(pre[i].length); break; }
    }
    return w;
  }

  function tokens(text) {
    var out = [];
    String(text).toLowerCase()
      .replace(/[–—]/g, " ")
      .replace(/[^a-z0-9.\s-]/g, " ")
      .split(/[\s-]+/)
      .forEach(function (raw) {
        var w = raw.replace(/^\.+|\.+$/g, "");
        if (!w || STOPSET[w]) return;
        if (/^\d+([.,]\d+)?$/.test(w)) { out.push(w); return; }
        if (w.length < 2) return;
        var c = SYN[w] || SYN[stem(w)] || stem(w);
        if (!STOPSET[c]) out.push(c);
      });
    return out;
  }

  /* ---------------- Basis pengetahuan dari halaman situs ---------------- */
  var kbPromise = null;

  function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function noEmoji(s) { return clean(String(s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")); }

  function fetchDoc(path) {
    return fetch(BASE + path, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(path); return r.text(); })
      .then(function (html) { return new DOMParser().parseFromString(html, "text/html"); });
  }

  function buildKB() {
    return Promise.all([
      fetch(BASE + "ai-kost-data.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("data"); return r.json(); }),
      fetchDoc("index.html").catch(function () { return null; }),
    ]).then(function (res) {
      var items = [];
      var data = res[0] || {}, home = res[1];

      (data.faq || []).forEach(function (f) {
        if (f.q && f.a) items.push({ title: f.q, text: f.a, source: "FAQ" });
      });
      [["peraturan", "Peraturan Kost"], ["privasi", "Kebijakan Privasi"]].forEach(function (k) {
        (data[k[0]] || []).forEach(function (sec) {
          (sec.isi || []).forEach(function (t) {
            items.push({ title: sec.bagian, text: t, source: k[1] + " · " + sec.bagian, titleW: 0.6 });
          });
        });
      });

      if (home) {
        var priceLines = [];
        home.querySelectorAll(".price-card").forEach(function (c) {
          var t = function (sel) { var e = c.querySelector(sel); return e ? clean(e.textContent) : ""; };
          var name = t(".card-name");
          if (!name) return;
          var price = t(".price-val").replace(/^Rp\s*/i, "Rp ");
          var feats = Array.prototype.map.call(c.querySelectorAll(".features-list li"), function (li) { return clean(li.textContent); });
          var line = name + ": " + price + t(".price-period") + (t(".price-orig") ? " (normal " + t(".price-orig") + ")" : "");
          priceLines.push(line);
          items.push({
            title: "Harga kamar " + name + " " + t(".card-tier"),
            text: line + ". " + t(".price-desc") + (feats.length ? " Fasilitas: " + feats.join(", ") + "." : ""),
            source: "Halaman utama · Harga", url: "index.html#harga",
          });
        });
        if (priceLines.length) {
          items.push({ title: "Harga sewa kamar per bulan", text: "Pilihan kamar di Genzed Kost:\n• " + priceLines.join("\n• "), source: "Halaman utama · Harga", url: "index.html#harga" });
        }
        var facs = [];
        home.querySelectorAll("#fasilitas .facility-item").forEach(function (f) {
          var ft = f.querySelector(".fac-title"), fd = f.querySelector(".fac-desc");
          if (!ft) return;
          facs.push(clean(ft.textContent));
          items.push({ title: "Fasilitas " + clean(ft.textContent), text: clean(ft.textContent) + ": " + clean(fd && fd.textContent), source: "Halaman utama · Fasilitas", url: "index.html#fasilitas" });
        });
        if (facs.length) items.push({ title: "Fasilitas lengkap kost", text: "Fasilitas di Genzed Kost: " + facs.join(", ") + ".", source: "Halaman utama · Fasilitas", url: "index.html#fasilitas" });
        var places = [];
        home.querySelectorAll("#lokasi .place-item").forEach(function (p) {
          var n = p.querySelector(".place-name"), d = p.querySelector(".place-dist"), ty = p.querySelector(".place-type");
          if (n) places.push(clean(n.textContent) + " (" + clean(ty && ty.textContent) + ") — " + clean(d && d.textContent));
        });
        if (places.length) items.push({ title: "Lokasi kost Serang Banten jarak tempat terdekat", text: "Genzed Kost ada di Kota Serang, Banten. Jarak ke tempat penting:\n• " + places.join("\n• "), source: "Halaman utama · Lokasi", url: "index.html#lokasi" });
      }

      // Indeks: frekuensi dokumen untuk bobot kata langka (IDF).
      var df = {};
      items.forEach(function (it) {
        it.tTitle = tokens(it.title);
        it.tText = tokens(it.text);
        var seen = {};
        it.tTitle.concat(it.tText).forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } });
      });
      return { items: items, df: df, n: items.length };
    });
  }

  function getKB() {
    if (!kbPromise) kbPromise = buildKB().catch(function (e) { kbPromise = null; throw e; });
    return kbPromise;
  }

  function idf(kb, w) { return Math.log(1 + kb.n / (1 + (kb.df[w] || 0))); }

  function has(list, w) {
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (x === w) return 1;
      if (w.length >= 4 && x.length >= 4 && (x.indexOf(w) === 0 || w.indexOf(x) === 0)) return 0.7;
    }
    return 0;
  }

  // Pola pertanyaan umum -> potongan info yang paling pas (dikali bobot).
  var INTENTS = [
    { re: /(cara|gimana|bagaimana|bisa|pake|pakai|lewat|via|metode).{0,12}(bayar|pembayaran|transfer)|metode/i, target: /metode pembayaran/i },
    { re: /(cara|gimana|bagaimana|proses|syarat).{0,15}(daftar|sewa|booking|pesan|masuk|ngekos|nge-kos|tinggal)/i, target: /cara sewa kamar/i, not: /bayar|pembayaran|transfer/i },
    { re: /gerbang|pintu|dikunci|ditutup|tutup jam|jam malam|pulang malam/i, target: /gerbang/i },
    { re: /(data|pribadi|ktp|identitas).{0,25}(pakai|guna|buat apa|untuk apa|diapain)|(buat|untuk) apa.{0,15}data/i, target: /^Buat Apa Data/i },
    { re: /(data|pribadi|ktp|identitas).{0,25}(aman|jaga|lindung|bocor|simpan)|(aman|jaga|lindung).{0,20}(data|ktp)/i, target: /^Bagaimana Kami Menjaga Data/i },
    { re: /data apa|apa aja.{0,10}data|data.{0,15}(dikumpul|diminta|disimpan apa)/i, target: /^Data yang Kami Kumpulkan/i },
    { re: /(harga|biaya|tarif).{0,20}(kamar|sewa|kost|kos|bulan)|berapa(an)? (harga|sewa)/i, target: /^Harga sewa kamar per bulan/i },
  ];

  function score(kb, it, q) {
    var s = 0, matched = 0;
    q.forEach(function (w) {
      var m = Math.max(has(it.tTitle, w) * (it.titleW || 1.4), has(it.tText, w));
      if (m) { s += idf(kb, w) * m; matched++; }
    });
    return { s: s * (it.boost || 1), matched: matched };
  }

  function intentBoost(question, it) {
    var b = 1;
    INTENTS.forEach(function (x) {
      if (x.re.test(question) && !(x.not && x.not.test(question)) && (x.target.test(it.title) || x.target.test(it.text))) b *= 3;
    });
    return b;
  }

  var SMALLTALK = [
    { re: /^(hai|halo|hallo|hello|hi|hey|p|assalamualaikum|selamat (pagi|siang|sore|malam))\b/i, text: "Halo! 👋 Aku AI Kost. Tanyain aja soal peraturan, harga kamar, fasilitas, lokasi, atau cara bayar di Genzed Kost." },
    { re: /\b(makasih|terima ?kasih|thanks|thx|tengkyu|mksh)\b/i, text: "Sama-sama! 😊 Kalau ada yang mau ditanyain lagi, tanya aja ya." },
    { re: /\b(kamu siapa|siapa kamu|ini siapa|ai kost itu apa)\b/i, text: "Aku AI Kost, asisten otomatis Genzed Kost. Aku jawab soal FAQ, peraturan kost, kebijakan privasi, dan info harga/fasilitas/lokasi." },
    { re: /^(peraturan|aturan|tata tertib|faq|privasi|kebijakan privasi)( kost| kos)?\??$/i, text: "Tanyain aja aturan yang mau kamu tahu, misalnya: \"jam bertamu sampai jam berapa?\", \"boleh bawa hewan?\", \"gerbang dikunci jam berapa?\", atau \"data pribadiku dipakai buat apa?\"" },
  ];

  function ask(question) {
    var q = clean(question);
    for (var i = 0; i < SMALLTALK.length; i++) {
      if (SMALLTALK[i].re.test(q) && q.split(" ").length <= 5) return Promise.resolve({ text: SMALLTALK[i].text, items: [] });
    }
    return getKB().then(function (kb) {
      var qt = tokens(q).filter(function (w, i, a) { return a.indexOf(w) === i; });
      if (!qt.length) return { text: "Boleh diperjelas pertanyaannya? Misalnya: \"jam bertamu sampai jam berapa?\" atau \"berapa harga kamar?\"", items: [] };
      var qWeight = qt.reduce(function (a, w) { return a + idf(kb, w); }, 0);
      var ranked = kb.items
        .map(function (it) { var r = score(kb, it, qt); var b = intentBoost(q, it); return { it: it, s: r.s * b, cov: Math.min(1, r.s / qWeight) * (b > 1 ? 1.5 : 1), matched: r.matched }; })
        .filter(function (r) { return r.s > 0; })
        .sort(function (a, b) { return b.s - a.s; });

      var top = ranked[0];
      if (!top || top.cov < 0.5) {
        return {
          text: "Hmm, aku belum nemu info soal itu 🙏 Biar pasti, langsung tanya admin lewat WhatsApp ya.",
          items: [], fallback: true,
        };
      }
      // Ambil jawaban pendukung yang skornya dekat (maks 3 total), hindari duplikat isi.
      var picked = [top];
      for (var j = 1; j < ranked.length && picked.length < 3; j++) {
        var r = ranked[j];
        var close = r.s >= top.s * 0.8 && r.cov >= 0.5;
        if (close && picked.every(function (p) { return p.it.text !== r.it.text; })) picked.push(r);
      }
      return {
        text: picked.length === 1 ? top.it.text : null,
        items: picked.map(function (p) { return p.it.text; }),
        source: { label: top.it.source, url: top.it.url ? BASE + top.it.url : null },
      };
    });
  }

  window.AIKost = window.AIKost || {};
  window.AIKost.ask = ask;
  window.AIKost.WA_LINK = WA_LINK;

  if (!WITH_WIDGET) return;

  /* ---------------- Widget chat ---------------- */
  var css = "\
.aik-fab{position:fixed;right:20px;bottom:20px;z-index:310;display:inline-flex;align-items:center;gap:8px;\
border:none;border-radius:100px;padding:12px 18px 12px 14px;cursor:pointer;color:#fff;font:600 .88rem 'DM Sans',system-ui,sans-serif;\
background:linear-gradient(120deg,#7C3AED,#DB2777 55%,#F97316);box-shadow:0 14px 30px -12px rgba(219,39,119,.65);\
transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s}\
.aik-fab:hover{transform:translateY(-3px);box-shadow:0 18px 40px -10px rgba(219,39,119,.85)}\
.aik-fab-ico{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.2);display:grid;place-items:center;font-size:1rem}\
body:has(.admin-edit-fab) .aik-fab{bottom:80px}\
.aik-panel{position:fixed;right:20px;bottom:20px;z-index:320;width:min(380px,calc(100vw - 32px));height:min(580px,calc(100svh - 40px));\
display:flex;flex-direction:column;overflow:hidden;border-radius:22px;color:#1C1633;font-family:'DM Sans',system-ui,sans-serif;\
background:linear-gradient(#fff,#fff) padding-box,linear-gradient(120deg,#7C3AED,#DB2777 55%,#F97316) border-box;border:1.5px solid transparent;\
box-shadow:0 30px 70px -24px rgba(76,29,149,.40),0 8px 24px -12px rgba(28,22,51,.18);\
opacity:0;transform:translateY(16px) scale(.98);pointer-events:none;transition:opacity .25s,transform .3s cubic-bezier(.22,1,.36,1)}\
.aik-panel.open{opacity:1;transform:none;pointer-events:auto}\
.aik-head{display:flex;align-items:center;gap:12px;padding:14px 16px;background:linear-gradient(120deg,#F3EEFF,#FDF2F8 55%,#FFF4EA);border-bottom:1px solid #EFE9FB}\
.aik-avatar{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:1.2rem;background:linear-gradient(120deg,#7C3AED,#DB2777 55%,#F97316)}\
.aik-title{font:700 1rem 'Syne',sans-serif;line-height:1.2}\
.aik-sub{font-size:.72rem;color:#625C7A}\
.aik-x{margin-left:auto;background:#fff;border:1px solid #E6E0F5;color:#1C1633;width:32px;height:32px;border-radius:10px;cursor:pointer;font-size:1rem}\
.aik-x:hover{background:#F3EEFF}\
.aik-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}\
.aik-msg{max-width:88%;padding:10px 13px;border-radius:16px;font-size:.88rem;line-height:1.55;word-wrap:break-word;white-space:pre-wrap}\
.aik-msg.bot{align-self:flex-start;background:#F6F3FF;border:1px solid #E9E2FA;border-bottom-left-radius:6px}\
.aik-msg.user{align-self:flex-end;color:#fff;background:linear-gradient(120deg,#7C3AED,#DB2777);border-bottom-right-radius:6px}\
.aik-msg ul{margin:0;padding-left:18px;white-space:normal}.aik-msg li{margin:2px 0;white-space:pre-wrap}\
.aik-src{display:block;margin-top:8px;font-size:.72rem;color:#BE185D;text-decoration:none}\
a.aik-src:hover{text-decoration:underline}\
.aik-wa{display:inline-flex;margin-top:8px;padding:6px 12px;border-radius:100px;background:#25D366;color:#fff;font-size:.76rem;font-weight:600;text-decoration:none}\
.aik-typing{display:inline-flex;gap:4px;padding:4px 2px}\
.aik-typing i{width:7px;height:7px;border-radius:50%;background:#C084FC;animation:aik-b 1s infinite ease-in-out}\
.aik-typing i:nth-child(2){animation-delay:.15s;background:#F472B6}.aik-typing i:nth-child(3){animation-delay:.3s;background:#FB923C}\
@keyframes aik-b{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-5px);opacity:1}}\
.aik-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 10px}\
.aik-chip{background:#F3EEFF;border:1px solid #E1D6FB;color:#6D28D9;border-radius:100px;padding:6px 11px;\
font:500 .76rem 'DM Sans',system-ui,sans-serif;cursor:pointer;transition:background .2s}\
.aik-chip:hover{background:#FDF2F8;border-color:#F9C9E1;color:#BE185D}\
.aik-form{display:flex;gap:8px;padding:12px;border-top:1px solid #EFE9FB;background:#FBFAFF}\
.aik-input{flex:1;min-width:0;background:#fff;border:1px solid #E1D9F5;border-radius:100px;padding:11px 15px;color:#1C1633;\
font:400 .88rem 'DM Sans',system-ui,sans-serif;outline:none}\
.aik-input:focus{border-color:#9333EA;box-shadow:0 0 0 3px rgba(147,51,234,.12)}\
.aik-send{flex-shrink:0;width:42px;height:42px;border:none;border-radius:50%;cursor:pointer;color:#fff;font-size:1.05rem;\
background:linear-gradient(120deg,#7C3AED,#DB2777 55%,#F97316)}\
.aik-send:disabled{opacity:.45;cursor:default}\
.aik-note{font-size:.66rem;color:#7A7493;text-align:center;padding:0 12px 10px;background:#FBFAFF}\
@media (max-width:480px){.aik-panel{right:8px;bottom:8px;width:calc(100vw - 16px);height:calc(100svh - 16px)}.aik-fab-txt{display:none}.aik-fab{padding:12px}}\
@media (prefers-reduced-motion:reduce){.aik-panel,.aik-fab{transition:none}.aik-typing i{animation:none}}";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderAnswer(bubble, ans) {
    if (ans.text) bubble.appendChild(document.createTextNode(ans.text));
    else {
      bubble.appendChild(document.createTextNode("Ini yang aku temuin:"));
      var ul = el("ul");
      ans.items.forEach(function (t) { ul.appendChild(el("li", null, t)); });
      bubble.appendChild(ul);
    }
    if (ans.source) {
      var a = el(ans.source.url ? "a" : "span", "aik-src", "📄 Sumber: " + ans.source.label);
      if (ans.source.url) a.href = ans.source.url;
      bubble.appendChild(a);
    }
    if (ans.fallback) {
      var wa = el("a", "aik-wa", "💬 Chat Admin");
      wa.href = WA_LINK; wa.target = "_blank"; wa.rel = "noopener";
      bubble.appendChild(document.createElement("br"));
      bubble.appendChild(wa);
    }
  }

  // Riwayat disimpan di perangkat pengunjung (localStorage) bareng waktu terakhir dipakai.
  // Kalau 8 jam nggak ada pertanyaan baru, riwayatnya dihapus otomatis.
  function loadHistory() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || !saved.lastUsed || Date.now() - saved.lastUsed > IDLE_LIMIT_MS) {
        localStorage.removeItem(STORE_KEY);
        return [];
      }
      return saved.history || [];
    } catch (e) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ lastUsed: Date.now(), history: h.slice(-20) })); } catch (e) { /* abaikan */ }
  }
  function lastUsed() {
    try { var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); return saved && saved.lastUsed; } catch (e) { return null; }
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
      '<form class="aik-form"><input class="aik-input" maxlength="300" placeholder="Tulis pertanyaanmu…" aria-label="Pertanyaan untuk AI Kost">' +
      '<button class="aik-send" type="submit" aria-label="Kirim">➤</button></form>' +
      '<div class="aik-note">Jawaban diambil otomatis dari FAQ, peraturan &amp; kebijakan privasi Genzed Kost. Untuk kepastian, konfirmasi ke admin.</div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var body = panel.querySelector(".aik-body");
    var chips = panel.querySelector(".aik-chips");
    var form = panel.querySelector(".aik-form");
    var input = panel.querySelector(".aik-input");
    var send = panel.querySelector(".aik-send");
    var history = loadHistory();
    var busy = false;

    function scrollDown() { body.scrollTop = body.scrollHeight; }
    function addUser(text) { body.appendChild(el("div", "aik-msg user", text)); scrollDown(); }
    function addBot(ans) { var b = el("div", "aik-msg bot"); renderAnswer(b, ans); body.appendChild(b); scrollDown(); }

    function render() {
      body.innerHTML = "";
      addBot({ text: "Halo! Aku AI Kost 👋 Mau tanya apa soal Genzed Kost? Misalnya jam bertamu, harga kamar, atau cara bayar." });
      history.forEach(function (m) { if (m.q) addUser(m.q); if (m.a) addBot(m.a); });
      chips.style.display = history.length ? "none" : "";
    }

    SUGGESTIONS.forEach(function (q) {
      var c = el("button", "aik-chip", q);
      c.type = "button";
      c.addEventListener("click", function () { submit(q); });
      chips.appendChild(c);
    });

    function submit(question) {
      question = (question || "").trim();
      if (!question || busy) return;
      busy = true; send.disabled = true; input.value = "";
      chips.style.display = "none";
      addUser(question);
      var typing = el("div", "aik-msg bot");
      typing.innerHTML = '<span class="aik-typing" aria-label="AI Kost sedang mengetik"><i></i><i></i><i></i></span>';
      body.appendChild(typing); scrollDown();
      var started = Date.now();
      ask(question)
        .catch(function () {
          return { text: "Waduh, info kost belum bisa dimuat. Cek koneksimu lalu coba lagi, atau langsung chat admin ya.", items: [], fallback: true };
        })
        .then(function (ans) {
          // Jeda singkat biar terasa natural (jawaban aslinya instan).
          setTimeout(function () {
            typing.remove();
            addBot(ans);
            history.push({ q: question, a: ans });
            saveHistory(history);
            busy = false; send.disabled = false; input.focus();
          }, Math.max(0, 450 - (Date.now() - started)));
        });
    }

    // Cek kedaluwarsa juga saat halaman dibiarkan terbuka lama.
    function expireIfIdle() {
      var t = lastUsed();
      if (history.length && (!t || Date.now() - t > IDLE_LIMIT_MS)) {
        history = [];
        try { localStorage.removeItem(STORE_KEY); } catch (e) { /* abaikan */ }
        render();
      }
    }
    setInterval(expireIfIdle, 60 * 1000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) expireIfIdle(); });

    function open(question) {
      expireIfIdle();
      panel.classList.add("open");
      fab.style.display = "none";
      getKB().catch(function () {}); // mulai muat data di belakang layar
      setTimeout(function () { input.focus(); }, 200);
      if (question) submit(question);
    }
    function close() {
      panel.classList.remove("open");
      fab.style.display = "";
    }

    fab.addEventListener("click", function () { open(); });
    panel.querySelector(".aik-x").addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) close(); });
    form.addEventListener("submit", function (e) { e.preventDefault(); submit(input.value); });
    document.querySelectorAll("[data-aikost-open]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); open(b.getAttribute("data-aikost-q") || ""); });
    });

    render();
    window.AIKost.open = open;
    if (/^#tanya-ai/.test(location.hash)) open();
    window.AIKost.close = close;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
