import type { CSSProperties, ReactNode } from "react";

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        boxShadow: "0 2px 12px -4px rgba(76,29,149,.10)",
        borderRadius: "var(--r)",
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <div style={{ fontSize: ".75rem", color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>
        {label}
      </div>
      <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "1.5rem", marginBottom: hint ? 4 : 0 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: ".78rem", color: "var(--muted)" }}>{hint}</div>}
    </Card>
  );
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
      <div style={{ fontSize: "2rem", marginBottom: 10 }}>{icon}</div>
      <p style={{ fontSize: ".88rem" }}>{text}</p>
    </div>
  );
}
