// Nomor invoice/pembayaran ikut nyantumin kode kamar penghuninya, biar gampang
// dibedain sekilas antar penghuni (bukan cuma nomor urut global yang polos).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export function sanitizeRoomCode(roomNumber: string | null | undefined): string {
  if (!roomNumber) return "NA";
  const cleaned = roomNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || "NA";
}

export async function getActiveRoomCode(admin: SupabaseClient, tenantId: string): Promise<string> {
  const { data } = await admin
    .from("tenancies")
    .select("rooms(room_number)")
    .eq("tenant_id", tenantId)
    .eq("status", "AKTIF")
    .maybeSingle();
  const roomNumber = (data?.rooms as unknown as { room_number: string } | null)?.room_number;
  return sanitizeRoomCode(roomNumber);
}
