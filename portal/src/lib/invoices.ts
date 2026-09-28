// Co-tenant (Prioritas 4): tagihan penghuni bisa datang dari 2 sumber —
// invoice yang tenant_id-nya dia sendiri (kontrak biasa, ATAU dia penghuni
// utama di kontrak yang dibagi), atau invoice_shares kalau dia co-tenant
// yang BUKAN penghuni utama. Digabung di sini biar Tagihan.tsx & Bayar.tsx
// nggak perlu tau bedanya.
import { supabase } from "./supabaseClient";
import type { MyInvoiceView, InvoiceDetail } from "../types/database";

const INVOICE_COLUMNS =
  "id, invoice_number, period_start, period_end, due_date, status, subtotal, discount_total, penalty_total, total, paid_total, notes, invoice_items(id, item_type, description, quantity, unit_price, amount)";

type RawInvoiceRow = InvoiceDetail & { invoice_items: InvoiceDetail["items"] };

function toInvoiceDetail(row: RawInvoiceRow): InvoiceDetail {
  const { invoice_items, ...rest } = row;
  return { ...rest, items: invoice_items ?? [] };
}

export async function loadMyInvoices(tenantId: string): Promise<MyInvoiceView[]> {
  const [ownedRes, sharedRes] = await Promise.all([
    supabase.from("invoices").select(`${INVOICE_COLUMNS}, invoice_shares(id)`).eq("tenant_id", tenantId).order("due_date", { ascending: false }),
    supabase
      .from("invoice_shares")
      .select(`share_amount, paid_amount, invoice:invoices(${INVOICE_COLUMNS})`)
      .eq("tenant_id", tenantId),
  ]);

  const byId = new Map<string, MyInvoiceView>();

  for (const row of (ownedRes.data ?? []) as unknown as Array<RawInvoiceRow & { invoice_shares: { id: string }[] }>) {
    const { invoice_shares, ...invoiceRow } = row;
    const detail = toInvoiceDetail(invoiceRow as RawInvoiceRow);
    const isShared = (invoice_shares ?? []).length > 0;
    byId.set(detail.id, { ...detail, isShared, myShareAmount: detail.total, myPaidAmount: detail.paid_total });
  }

  for (const row of (sharedRes.data ?? []) as unknown as Array<{ share_amount: number; paid_amount: number; invoice: RawInvoiceRow | null }>) {
    if (!row.invoice) continue;
    const detail = toInvoiceDetail(row.invoice);
    // Kalau udah ada dari query pertama (berarti dia penghuni utama di invoice ini),
    // timpa myShareAmount/myPaidAmount pakai porsi asli dia, bukan total sekamar.
    const existing = byId.get(detail.id);
    byId.set(detail.id, {
      ...(existing ?? detail),
      isShared: true,
      myShareAmount: Number(row.share_amount),
      myPaidAmount: Number(row.paid_amount),
    });
  }

  return Array.from(byId.values()).sort((a, b) => b.due_date.localeCompare(a.due_date));
}
