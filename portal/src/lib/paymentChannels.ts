// Katalog channel Midtrans buat ditampilkan di UI. Dicerminkan dari
// supabase/functions/_shared/paymentChannels.ts (lihat catatan duplikasi di billing.ts).
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
