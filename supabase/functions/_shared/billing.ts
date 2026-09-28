// Logika inti perhitungan tagihan: prorata, siklus billing, dan denda keterlambatan.
// CATATAN: file ini sengaja diduplikasi dari portal/src/lib/billing.ts
// karena Edge Function (Deno) dan portal (Vite/browser) adalah dua runtime terpisah
// tanpa tooling monorepo. Kalau ubah logika di sini, ubah juga di sana.

export type BillingCycle = "BULANAN" | "TRIWULAN" | "SEMESTER" | "TAHUNAN";
export type PenaltyCalcType = "NOMINAL_PER_HARI" | "PERSEN_PER_HARI";

const CYCLE_MONTHS: Record<BillingCycle, number> = {
  BULANAN: 1,
  TRIWULAN: 3,
  SEMESTER: 6,
  TAHUNAN: 12,
};

export function cycleMonths(cycle: BillingCycle): number {
  return CYCLE_MONTHS[cycle];
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

export function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

export function computePeriodEnd(periodStart: Date, cycle: BillingCycle): Date {
  const nextStart = addMonthsClamped(periodStart, CYCLE_MONTHS[cycle]);
  return new Date(nextStart.getTime() - 24 * 60 * 60 * 1000);
}

function toUTCDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function inclusiveDayCount(a: Date, b: Date): number {
  const diff = Math.round((toUTCDateOnly(b).getTime() - toUTCDateOnly(a).getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(0, diff);
}

export function overlapDays(
  periodStart: Date,
  periodEnd: Date,
  tenancyStart: Date,
  tenancyEnd: Date | null
): number {
  const start = tenancyStart > periodStart ? tenancyStart : periodStart;
  const end = tenancyEnd && tenancyEnd < periodEnd ? tenancyEnd : periodEnd;
  return inclusiveDayCount(start, end);
}

export function calculateSewaAmount(
  rate: number,
  periodStart: Date,
  periodEnd: Date,
  tenancyStart: Date,
  tenancyEnd: Date | null
): { amount: number; isProrated: boolean; occupiedDays: number; totalDays: number } {
  const totalDays = inclusiveDayCount(periodStart, periodEnd);
  const occupiedDays = overlapDays(periodStart, periodEnd, tenancyStart, tenancyEnd);

  if (occupiedDays >= totalDays) {
    return { amount: Math.round(rate), isProrated: false, occupiedDays, totalDays };
  }
  const amount = Math.round((rate * occupiedDays) / totalDays);
  return { amount, isProrated: true, occupiedDays, totalDays };
}

export function calculatePenalty(params: {
  outstandingAmount: number;
  calcType: PenaltyCalcType;
  value: number;
  gracePeriodDays: number;
  maxAmount: number | null;
  daysLate: number;
}): number {
  const { outstandingAmount, calcType, value, gracePeriodDays, maxAmount, daysLate } = params;
  const effectiveDaysLate = daysLate - gracePeriodDays;
  if (effectiveDaysLate <= 0) return 0;

  const raw =
    calcType === "NOMINAL_PER_HARI"
      ? value * effectiveDaysLate
      : (outstandingAmount * value) / 100 * effectiveDaysLate;

  const capped = maxAmount != null ? Math.min(raw, maxAmount) : raw;
  return Math.round(Math.max(0, capped));
}

export function formatInvoiceNumber(date: Date, sequence: number): string {
  const yyyymm = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return `INV-${yyyymm}-${String(sequence).padStart(4, "0")}`;
}

// ────────────────────────────────────────────────────────────
// SIKLUS TAGIHAN "ANCHOR" — aturan bisnis Genzed Kost:
// Penghuni yang mulai sewa tanggal 1-15 masuk siklus anchor tanggal 1
// (tagihan tiap periode terbit tanggal 25 BULAN SEBELUMNYA).
// Penghuni yang mulai sewa tanggal 16-31 masuk siklus anchor tanggal 16
// (tagihan tiap periode terbit tanggal 10 di bulan yang sama).
// Ini menormalkan semua penghuni ke salah satu dari 2 jadwal tagihan yang
// konsisten & bisa diprediksi, bukan tanggal custom per orang.
// ────────────────────────────────────────────────────────────

export type BillingAnchor = 1 | 16;

export function billingAnchorFromStartDate(startDate: Date): BillingAnchor {
  return startDate.getUTCDate() <= 15 ? 1 : 16;
}

function setDate(date: Date, day: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day));
}

export function containingAnchorStart(date: Date, anchor: BillingAnchor): Date {
  if (anchor === 1) return setDate(date, 1);
  return date.getUTCDate() >= 16 ? setDate(date, 16) : setDate(addMonthsClamped(date, -1), 16);
}

export function firstAnchoredPeriodEnd(tenancyStart: Date, cycle: BillingCycle, anchor: BillingAnchor): Date {
  const anchorStart = containingAnchorStart(tenancyStart, anchor);
  const nextAnchorStart = setDate(addMonthsClamped(anchorStart, cycleMonths(cycle)), anchor);
  return new Date(nextAnchorStart.getTime() - 24 * 60 * 60 * 1000);
}

export function nextAnchoredPeriodEnd(periodStart: Date, cycle: BillingCycle, anchor: BillingAnchor): Date {
  const nextAnchorStart = setDate(addMonthsClamped(periodStart, cycleMonths(cycle)), anchor);
  return new Date(nextAnchorStart.getTime() - 24 * 60 * 60 * 1000);
}

export function invoicePublishDate(periodStart: Date, anchor: BillingAnchor): Date {
  if (anchor === 1) return setDate(addMonthsClamped(periodStart, -1), 25);
  return setDate(periodStart, 10);
}

export function calculateFirstPeriodSewaAmount(
  rate: number,
  tenancyStart: Date,
  periodEnd: Date,
  anchor: BillingAnchor
): { amount: number; isProrated: boolean; occupiedDays: number; totalDays: number } {
  const anchorStart = containingAnchorStart(tenancyStart, anchor);
  const totalDays = inclusiveDayCount(anchorStart, periodEnd);
  const occupiedDays = inclusiveDayCount(tenancyStart, periodEnd);

  if (occupiedDays >= totalDays) {
    return { amount: Math.round(rate), isProrated: false, occupiedDays, totalDays };
  }
  const amount = Math.round((rate * occupiedDays) / totalDays);
  return { amount, isProrated: true, occupiedDays, totalDays };
}

export type AdvancePeriod = { periodStart: Date; periodEnd: Date };

export function generateAdvancePeriods(startAfter: Date, monthsCount: number, anchor: BillingAnchor): AdvancePeriod[] {
  const periods: AdvancePeriod[] = [];
  let periodStart = startAfter;
  for (let i = 0; i < monthsCount; i++) {
    const periodEnd = nextAnchoredPeriodEnd(periodStart, "BULANAN", anchor);
    periods.push({ periodStart, periodEnd });
    periodStart = new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000);
  }
  return periods;
}

export function calculateAdvancePaymentTotal(
  monthlyRate: number,
  monthsCount: number,
  discountPercent: number
): { subtotal: number; discount: number; total: number } {
  const subtotal = Math.round(monthlyRate) * monthsCount;
  const discount = Math.round((subtotal * discountPercent) / 100);
  return { subtotal, discount, total: subtotal - discount };
}

export function distributeDiscount(perPeriodAmounts: number[], totalDiscount: number): number[] {
  if (perPeriodAmounts.length === 0) return [];
  const subtotal = perPeriodAmounts.reduce((s, a) => s + a, 0);
  const result: number[] = [];
  let allocated = 0;
  for (let i = 0; i < perPeriodAmounts.length; i++) {
    if (i === perPeriodAmounts.length - 1) {
      result.push(totalDiscount - allocated);
    } else {
      const share = subtotal > 0 ? Math.round((perPeriodAmounts[i] / subtotal) * totalDiscount) : 0;
      result.push(share);
      allocated += share;
    }
  }
  return result;
}

export type ShareInput = { tenantId: string; sharePercent: number };
export type ShareResult = { tenantId: string; amount: number };

export function splitBySharePercent(totalAmount: number, shares: ShareInput[]): ShareResult[] {
  if (shares.length === 0) return [];
  const result: ShareResult[] = [];
  let allocated = 0;
  for (let i = 0; i < shares.length; i++) {
    if (i === shares.length - 1) {
      result.push({ tenantId: shares[i].tenantId, amount: Math.round(totalAmount) - allocated });
    } else {
      const amount = Math.round((totalAmount * shares[i].sharePercent) / 100);
      result.push({ tenantId: shares[i].tenantId, amount });
      allocated += amount;
    }
  }
  return result;
}
