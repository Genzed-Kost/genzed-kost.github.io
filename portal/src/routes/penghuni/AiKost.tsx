import { useEffect, useRef, useState, type FormEvent } from "react";
import { functionsUrl } from "../../lib/supabaseClient";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Jam bertamu sampai jam berapa?",
  "Gerbang dikunci jam berapa?",
  "Kalau telat bayar ada dendanya?",
  "Boleh masak di kamar?",
];

const STORE_KEY = "aikost_portal_history_v1";

function loadHistory(): Turn[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "[]") as Turn[];
  } catch {
    return [];
  }
}

export default function AiKost() {
  const [history, setHistory] = useState<Turn[]>(loadHistory);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-20)));
    } catch {
      /* abaikan */
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, loading]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    const next: Turn[] = [...history, { role: "user", content: q }];
    setHistory(next);
    setLoading(true);
    try {
      const res = await fetch(functionsUrl("ai-kost"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reply) {
        setHistory(history); // batalkan pertanyaan yang gagal
        setError(data.error ?? "AI Kost lagi gangguan. Coba lagi nanti ya.");
        return;
      }
      setHistory([...next, { role: "assistant", content: data.reply }]);
    } catch {
      setHistory(history);
      setError("Koneksi bermasalah. Cek internetmu lalu coba lagi ya.");
    } finally {
      setLoading(false);
    }
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
          <Bubble role="assistant">
            Halo! Aku AI Kost 👋 Mau tanya apa soal Genzed Kost? Misalnya jam bertamu, aturan tamu menginap, atau cara bayar.
          </Bubble>
          {history.map((t, i) => (
            <Bubble key={i} role={t.role}>
              {t.content}
            </Bubble>
          ))}
          {loading && <Bubble role="assistant">…</Bubble>}
          {history.length === 0 && !loading && (
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

        {error && (
          <div className="alert alert-error" style={{ margin: "0 14px 10px" }}>
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={600}
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
            disabled={loading || !input.trim()}
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
              opacity: loading || !input.trim() ? 0.45 : 1,
            }}
          >
            ➤
          </button>
        </form>
      </div>
      <p style={{ fontSize: ".72rem", color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
        Jawaban AI bisa keliru — untuk kepastian, konfirmasi ke admin.
      </p>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "86%",
        padding: "10px 14px",
        borderRadius: 16,
        fontSize: ".9rem",
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        ...(isUser
          ? { background: "linear-gradient(120deg,#7C3AED,#DB2777)", color: "#fff", borderBottomRightRadius: 6 }
          : { background: "var(--surface2)", border: "1px solid var(--border)", borderBottomLeftRadius: 6 }),
      }}
    >
      {children}
    </div>
  );
}
