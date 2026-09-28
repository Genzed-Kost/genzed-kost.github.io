import { GATEWAY_CHANNELS } from "../lib/paymentChannels";
import { calculateAdminFee, type FeeConfig } from "../lib/payment";
import { formatRupiah } from "../lib/format";

// Penghuni pilih 1 channel spesifik (bukan cuma "Otomatis" generik) supaya biaya admin
// bisa ditampilkan DI MUKA — beda channel Midtrans beda biaya (VA nominal, e-wallet/QRIS
// persen). Channel yang dipilih dikirim ke server buat batasin Snap cuma nampilin itu aja.
export function GatewayChannelPicker({
  fees,
  baseAmount,
  tenantBearsFee,
  selected,
  onSelect,
}: {
  fees: Record<string, FeeConfig>;
  baseAmount: number;
  tenantBearsFee: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: 8, marginLeft: 26, display: "flex", flexDirection: "column", gap: 4 }}>
      {GATEWAY_CHANNELS.map((ch) => {
        const fee = calculateAdminFee(baseAmount, fees[ch.id]);
        return (
          <label key={ch.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 0" }}>
            <input type="radio" name="gatewayChannel" checked={selected === ch.id} onChange={() => onSelect(ch.id)} />
            <span style={{ fontSize: ".82rem", flex: 1 }}>{ch.label}</span>
            <span style={{ fontSize: ".76rem", color: "var(--muted)" }}>
              {fee <= 0 ? "gratis" : tenantBearsFee ? `+${formatRupiah(fee)}` : `biaya ${formatRupiah(fee)} (ditanggung kost)`}
            </span>
          </label>
        );
      })}
    </div>
  );
}
