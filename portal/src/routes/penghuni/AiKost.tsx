import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

// AI Kost di portal memakai mesin yang sama dengan widget di situs (/ai-kost.js):
// berjalan 100% di browser, gratis, tanpa API key. Jawaban diambil dari isi
// ai-kost-data.json (FAQ, peraturan, kebijakan privasi) dan halaman utama.
type Answer = {
  text: string | null;
  items: string[];
  source?: { label: string; url: string | null };
  fallback?: boolean;
};
type Turn = { q: string; a: Answer };

declare global {
  interface Window {
    AIKost?: { ask: (q: string) => Promise<Answer>; WA_LINK?: string };
  }
}

const SUGGESTIONS = [
  "Jam bertamu sampai jam berapa?",
  "Gerbang dikunci jam berapa?",
  "Kalau telat bayar ada dendanya?",
  "Boleh masak di kamar?",
  "Data pribadiku dipakai buat apa?",
];
const STORE_KEY = "aikost_portal_history_v2";
const WA_LINK = "https://wa.link/v5vckc";

let enginePromise: Promise<NonNullable<Window["AIKost"]>> | null = null;
function loadEngine() {
  if (window.AIKost?.ask) return Promise.resolve(window.AIKost);
  if (!enginePromise) {
    enginePromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/ai-kost.js";
      s.dataset.widget = "false";
      s.onload = () => (window.AIKost?.ask ? resolve(window.AIKost) : reject(new Error("AI Kost tidak tersedia")));
      s.onerror = () => {
        enginePromise = null;
        reject(new Error("Gagal memuat AI Kost"));
      };
      document.head.appendChild(s);
    });
  }
  return enginePromise;
}

function loadHistory(): Turn[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "[]") as Turn[];
  } catch {
    return [];
  }
}

export default function AiKost() {
  const [history, setHistory] = useState<Turn[]>(loadHistory);
  const [pending, setPending] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadEngine().catch(() => {});
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-20)));
    } catch {
      /* abaikan */
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, pending]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setInput("");
    setPending(q);
    let a: Answer;
    try {
      const engine = await loadEngine();
      a = await engine.ask(q);
    } catch {
      a = {
        text: "Waduh, info kost belum bisa dimuat. Cek koneksimu lalu coba lagi, atau langsung chat admin ya.",
        items: [],
        fallback: true,
      };
    }
    setHistory((h) => [...h, { q, a }]);
    setPending(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>
        AI Kost <span aria-hidden="true">🤖</span>
      </h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 20 }}>
        Tanya apa aja soal peraturan kost, FAQ, fasilitas, atau cara bayar. Untuk urusan tagihan pribadimu, cek menu Tagihan
        atau hubungi admin.
      </p>

      <div
        style={{
          borderRadius: 20,
          border: "1.5px solid transparent",
          background: "linear-gradient(var(--surface), var(--surface)) padding-box, var(--grad) border-box",
          display: "flex",
          flexDirection: "column",
          height: "min(620px, calc(100svh - 220px))",
          minHeight: 380,
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 10 }} aria-live="polite">
          <Bubble user={false}>
            Halo! Aku AI Kost 👋 Mau tanya apa soal Genzed Kost? Misalnya jam bertamu, aturan tamu menginap, atau cara bayar.
          </Bubble>
          {history.map((t, i) => (
            <div key={i} style={{ display: "contents" }}>
              <Bubble user>{t.q}</Bubble>
              <Bubble user={false}>
                <AnswerView a={t.a} />
              </Bubble>
            </div>
          ))}
          {pending && (
            <>
              <Bubble user>{pending}</Bubble>
              <Bubble user={false}>…</Bubble>
            </>
          )}
          {history.length === 0 && !pending && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  style={{
                    background: "rgba(192,132,252,.1)",
                    border: "1px solid rgba(192,132,252,.3)",
                    color: "#E9D5FF",
                    borderRadius: 100,
                    padding: "6px 12px",
                    fontSize: ".8rem",
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={300}
            placeholder="Tulis pertanyaanmu…"
            aria-label="Pertanyaan untuk AI Kost"
            style={{
              flex: 1,
              minWidth: 0,
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 100,
              padding: "11px 16px",
              color: "var(--text)",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!!pending || !input.trim()}
            aria-label="Kirim"
            style={{
              width: 44,
              height: 44,
              flexShrink: 0,
              border: "none",
              borderRadius: "50%",
              background: "var(--grad)",
              color: "#fff",
              cursor: "pointer",
              opacity: pending || !input.trim() ? 0.45 : 1,
            }}
          >
            ➤
          </button>
        </form>
      </div>
      <p style={{ fontSize: ".72rem", color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
        Jawaban diambil otomatis dari FAQ, peraturan &amp; kebijakan privasi Genzed Kost. Untuk kepastian, konfirmasi ke admin.
      </p>
    </div>
  );
}

function AnswerView({ a }: { a: Answer }) {
  return (
    <>
      {a.text ?? "Ini yang aku temuin:"}
      {!a.text && (
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, whiteSpace: "normal" }}>
          {a.items.map((t, i) => (
            <li key={i} style={{ margin: "2px 0", whiteSpace: "pre-wrap" }}>
              {t}
            </li>
          ))}
        </ul>
      )}
      {a.source &&
        (a.source.url ? (
          <a href={a.source.url} style={{ display: "block", marginTop: 8, fontSize: ".74rem", color: "#F9A8D4", textDecoration: "none" }}>
            📄 Sumber: {a.source.label}
          </a>
        ) : (
          <span style={{ display: "block", marginTop: 8, fontSize: ".74rem", color: "#F9A8D4" }}>📄 Sumber: {a.source.label}</span>
        ))}
      {a.fallback && (
        <a
          href={WA_LINK}
          target="_blank"
          rel="noopener"
          style={{
            display: "inline-flex",
            marginTop: 8,
            padding: "6px 12px",
            borderRadius: 100,
            background: "var(--wa)",
            color: "#fff",
            fontSize: ".78rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          💬 Chat Admin
        </a>
      )}
    </>
  );
}

function Bubble({ user, children }: { user: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        alignSelf: user ? "flex-end" : "flex-start",
        maxWidth: "88%",
        padding: "10px 14px",
        borderRadius: 16,
        fontSize: ".9rem",
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        ...(user
          ? { background: "linear-gradient(120deg,#7C3AED,#DB2777)", color: "#fff", borderBottomRightRadius: 6 }
          : { background: "var(--surface2)", border: "1px solid var(--border)", borderBottomLeftRadius: 6 }),
      }}
    >
      {children}
    </div>
  );
}
