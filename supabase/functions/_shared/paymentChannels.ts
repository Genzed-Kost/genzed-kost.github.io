// Katalog channel Midtrans yang kita dukung. `id` di sini dipakai APA ADANYA sebagai
// kode `enabled_payments` Snap (lihat dokumentasi Midtrans) supaya waktu penghuni pilih
// 1 channel, Snap cuma nampilin channel itu aja — bukan seluruh menu.
export const GATEWAY_CHANNELS = [
  { id: "bca_va", label: "VA BCA" },
  { id: "bni_va", label: "VA BNI" },
  { id: "bri_va", label: "VA BRI" },
  { id: "permata_va", label: "VA Permata" },
  { id: "other_va", label: "VA Bank Lain" },
  { id: "gopay", label: "GoPay" },
  { id: "shopeepay", label: "ShopeePay" },
  { id: "qris", label: "QRIS" },
  { id: "indomaret", label: "Indomaret" },
  { id: "alfamart", label: "Alfamart" },
] as const;

export type GatewayChannelId = (typeof GATEWAY_CHANNELS)[number]["id"];

export function isGatewayChannelId(value: unknown): value is GatewayChannelId {
  return typeof value === "string" && GATEWAY_CHANNELS.some((c) => c.id === value);
}
