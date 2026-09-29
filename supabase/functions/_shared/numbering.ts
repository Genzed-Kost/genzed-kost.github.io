// Nomor invoice/pembayaran HARUS unik antar penghuni — pola lama ("hitung baris yang
// ada, +1") punya celah race condition: 2 request yang diproses hampir bersamaan
// (mis. cron generate-monthly-invoices lagi jalan pas ada penghuni lain bikin
// pembayaran) bisa sama-sama baca hitungan yang sama sebelum salah satu selesai
// insert, jadi dapat nomor urut yang sama lalu tabrakan di constraint UNIQUE.
// Fungsi ini pakai counter atomik (INSERT ... ON CONFLICT DO UPDATE di Postgres,
// dikunci per baris) lewat RPC next_document_number — dijamin nggak pernah dobel
// walau dipanggil bersamaan dari mana pun.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function nextDocumentNumber(admin: SupabaseClient, prefix: "INV" | "PAY", monthKey: string): Promise<string> {
  const counterKey = `${prefix}-${monthKey}`;
  const { data, error } = await admin.rpc("next_document_number", { p_key: counterKey });
  if (error || data == null) throw new Error(`Gagal generate nomor ${prefix}: ${error?.message ?? "unknown"}`);
  return `${prefix}-${monthKey}-${String(data).padStart(4, "0")}`;
}
