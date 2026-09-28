import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  billingAnchorFromStartDate,
  calculateAdvancePaymentTotal,
  calculateFirstPeriodSewaAmount,
  calculatePenalty,
  calculateSewaAmount,
  computePeriodEnd,
  distributeDiscount,
  firstAnchoredPeriodEnd,
  formatInvoiceNumber,
  generateAdvancePeriods,
  splitBySharePercent,
  inclusiveDayCount,
  invoicePublishDate,
  nextAnchoredPeriodEnd,
  overlapDays,
} from "./billing";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("addMonthsClamped", () => {
  it("nambah bulan biasa", () => {
    expect(addMonthsClamped(d("2026-01-05"), 1).toISOString().slice(0, 10)).toBe("2026-02-05");
  });
  it("clamp ke akhir bulan kalau overflow (31 Jan + 1 bulan)", () => {
    expect(addMonthsClamped(d("2026-01-31"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
  });
  it("clamp ke 29 Feb di tahun kabisat", () => {
    expect(addMonthsClamped(d("2028-01-31"), 1).toISOString().slice(0, 10)).toBe("2028-02-29");
  });
  it("nambah tahun kalau lewat Desember", () => {
    expect(addMonthsClamped(d("2026-12-15"), 1).toISOString().slice(0, 10)).toBe("2027-01-15");
  });
});

describe("computePeriodEnd", () => {
  it("BULANAN: akhir periode = 1 hari sebelum bulan depan", () => {
    expect(computePeriodEnd(d("2026-01-01"), "BULANAN").toISOString().slice(0, 10)).toBe("2026-01-31");
  });
  it("TRIWULAN: 3 bulan", () => {
    expect(computePeriodEnd(d("2026-01-01"), "TRIWULAN").toISOString().slice(0, 10)).toBe("2026-03-31");
  });
  it("TAHUNAN: 12 bulan", () => {
    expect(computePeriodEnd(d("2026-01-01"), "TAHUNAN").toISOString().slice(0, 10)).toBe("2026-12-31");
  });
});

describe("inclusiveDayCount & overlapDays", () => {
  it("hitung hari inklusif", () => {
    expect(inclusiveDayCount(d("2026-01-01"), d("2026-01-31"))).toBe(31);
    expect(inclusiveDayCount(d("2026-01-01"), d("2026-01-01"))).toBe(1);
  });
  it("overlap penuh kalau tenancy mencakup seluruh periode", () => {
    expect(overlapDays(d("2026-01-01"), d("2026-01-31"), d("2025-01-01"), null)).toBe(31);
  });
  it("overlap sebagian kalau penghuni masuk tengah bulan", () => {
    expect(overlapDays(d("2026-01-01"), d("2026-01-31"), d("2026-01-15"), null)).toBe(17); // 15..31
  });
  it("overlap sebagian kalau penghuni keluar tengah bulan", () => {
    expect(overlapDays(d("2026-01-01"), d("2026-01-31"), d("2025-01-01"), d("2026-01-10"))).toBe(10); // 1..10
  });
});

describe("calculateSewaAmount (prorata)", () => {
  it("tarif penuh kalau penghuni sudah sewa sejak awal periode", () => {
    const r = calculateSewaAmount(1000000, d("2026-01-01"), d("2026-01-31"), d("2025-01-01"), null);
    expect(r.amount).toBe(1000000);
    expect(r.isProrated).toBe(false);
  });
  it("prorata kalau masuk tengah bulan (masuk tanggal 15, 31 hari di bulan itu, 17 hari terpakai)", () => {
    const r = calculateSewaAmount(1000000, d("2026-01-01"), d("2026-01-31"), d("2026-01-15"), null);
    expect(r.isProrated).toBe(true);
    expect(r.occupiedDays).toBe(17);
    expect(r.totalDays).toBe(31);
    expect(r.amount).toBe(Math.round((1000000 * 17) / 31));
  });
  it("prorata kalau keluar tengah bulan", () => {
    const r = calculateSewaAmount(800000, d("2026-02-01"), d("2026-02-28"), d("2025-01-01"), d("2026-02-10"));
    expect(r.isProrated).toBe(true);
    expect(r.occupiedDays).toBe(10);
    expect(r.totalDays).toBe(28);
  });
});

describe("calculatePenalty", () => {
  it("nol kalau masih dalam masa tenggang", () => {
    const p = calculatePenalty({
      outstandingAmount: 800000,
      calcType: "NOMINAL_PER_HARI",
      value: 10000,
      gracePeriodDays: 3,
      maxAmount: null,
      daysLate: 2,
    });
    expect(p).toBe(0);
  });
  it("nominal per hari setelah masa tenggang", () => {
    const p = calculatePenalty({
      outstandingAmount: 800000,
      calcType: "NOMINAL_PER_HARI",
      value: 10000,
      gracePeriodDays: 3,
      maxAmount: null,
      daysLate: 5,
    });
    expect(p).toBe(20000); // (5-3) hari x 10rb
  });
  it("persen per hari dari sisa tagihan", () => {
    const p = calculatePenalty({
      outstandingAmount: 1000000,
      calcType: "PERSEN_PER_HARI",
      value: 1, // 1% per hari
      gracePeriodDays: 0,
      maxAmount: null,
      daysLate: 5,
    });
    expect(p).toBe(50000); // 1% x 1jt x 5 hari
  });
  it("dibatasi max_amount", () => {
    const p = calculatePenalty({
      outstandingAmount: 1000000,
      calcType: "PERSEN_PER_HARI",
      value: 5,
      gracePeriodDays: 0,
      maxAmount: 100000,
      daysLate: 10,
    });
    expect(p).toBe(100000);
  });
});

describe("formatInvoiceNumber", () => {
  it("format INV-YYYYMM-XXXX", () => {
    expect(formatInvoiceNumber(d("2026-01-15"), 7)).toBe("INV-202601-0007");
    expect(formatInvoiceNumber(d("2026-11-01"), 123)).toBe("INV-202611-0123");
  });
});

describe("billingAnchorFromStartDate", () => {
  it("tanggal 1-15 -> anchor 1", () => {
    expect(billingAnchorFromStartDate(d("2026-09-01"))).toBe(1);
    expect(billingAnchorFromStartDate(d("2026-09-15"))).toBe(1);
  });
  it("tanggal 16-31 -> anchor 16", () => {
    expect(billingAnchorFromStartDate(d("2026-09-16"))).toBe(16);
    expect(billingAnchorFromStartDate(d("2026-09-30"))).toBe(16);
  });
});

describe("firstAnchoredPeriodEnd", () => {
  it("mulai tanggal 5 (anchor 1) -> periode pertama berakhir akhir bulan itu juga", () => {
    expect(firstAnchoredPeriodEnd(d("2026-09-05"), "BULANAN", 1).toISOString().slice(0, 10)).toBe("2026-09-30");
  });
  it("mulai tanggal 22 (anchor 16) -> periode pertama berakhir tanggal 15 bulan depan", () => {
    expect(firstAnchoredPeriodEnd(d("2026-09-22"), "BULANAN", 16).toISOString().slice(0, 10)).toBe("2026-10-15");
  });
  it("mulai persis tanggal 16 (anchor 16) -> tetap berakhir tanggal 15 bulan depan", () => {
    expect(firstAnchoredPeriodEnd(d("2026-09-16"), "BULANAN", 16).toISOString().slice(0, 10)).toBe("2026-10-15");
  });
});

describe("nextAnchoredPeriodEnd", () => {
  it("periode anchor 1 bulanan: 1 Okt -> akhir Okt", () => {
    expect(nextAnchoredPeriodEnd(d("2026-10-01"), "BULANAN", 1).toISOString().slice(0, 10)).toBe("2026-10-31");
  });
  it("periode anchor 16 bulanan: 16 Okt -> 15 Nov", () => {
    expect(nextAnchoredPeriodEnd(d("2026-10-16"), "BULANAN", 16).toISOString().slice(0, 10)).toBe("2026-11-15");
  });
});

describe("invoicePublishDate", () => {
  it("anchor 1: terbit tanggal 25 bulan sebelumnya", () => {
    expect(invoicePublishDate(d("2026-10-01"), 1).toISOString().slice(0, 10)).toBe("2026-09-25");
  });
  it("anchor 16: terbit tanggal 10 bulan yang sama", () => {
    expect(invoicePublishDate(d("2026-09-16"), 16).toISOString().slice(0, 10)).toBe("2026-09-10");
  });
});

describe("calculateFirstPeriodSewaAmount", () => {
  it("masuk tanggal 22 (anchor 16, periode penuh 16..15 = 30 hari, terpakai 22..15 = 24 hari)", () => {
    const r = calculateFirstPeriodSewaAmount(800000, d("2026-09-22"), d("2026-10-15"), 16);
    expect(r.totalDays).toBe(30);
    expect(r.occupiedDays).toBe(24);
    expect(r.isProrated).toBe(true);
    expect(r.amount).toBe(Math.round((800000 * 24) / 30));
  });
  it("masuk PERSIS tanggal anchor -> nggak diprorata, tarif penuh", () => {
    const r = calculateFirstPeriodSewaAmount(800000, d("2026-09-16"), d("2026-10-15"), 16);
    expect(r.isProrated).toBe(false);
    expect(r.amount).toBe(800000);
  });
  it("anchor 1, masuk tanggal 5 -> prorata dari tanggal 1 sampai akhir bulan", () => {
    const r = calculateFirstPeriodSewaAmount(1000000, d("2026-09-05"), d("2026-09-30"), 1);
    expect(r.totalDays).toBe(30);
    expect(r.occupiedDays).toBe(26);
    expect(r.isProrated).toBe(true);
  });
});

describe("generateAdvancePeriods", () => {
  it("anchor 1, 3 bulan berturutan dari awal bulan", () => {
    const periods = generateAdvancePeriods(d("2026-10-01"), 3, 1);
    expect(periods).toHaveLength(3);
    expect(periods.map((p) => [p.periodStart.toISOString().slice(0, 10), p.periodEnd.toISOString().slice(0, 10)])).toEqual([
      ["2026-10-01", "2026-10-31"],
      ["2026-11-01", "2026-11-30"],
      ["2026-12-01", "2026-12-31"],
    ]);
  });
  it("anchor 16, periode nyambung dari tanggal 16 ke 16 tanpa gap/tumpang tindih", () => {
    const periods = generateAdvancePeriods(d("2026-09-16"), 2, 16);
    expect(periods.map((p) => [p.periodStart.toISOString().slice(0, 10), p.periodEnd.toISOString().slice(0, 10)])).toEqual([
      ["2026-09-16", "2026-10-15"],
      ["2026-10-16", "2026-11-15"],
    ]);
  });
  it("periode berikutnya selalu mulai sehari setelah periode sebelumnya berakhir (nggak ada gap)", () => {
    const periods = generateAdvancePeriods(d("2026-01-01"), 12, 1);
    for (let i = 1; i < periods.length; i++) {
      const prevEnd = periods[i - 1].periodEnd.getTime();
      const curStart = periods[i].periodStart.getTime();
      expect(curStart - prevEnd).toBe(24 * 60 * 60 * 1000);
    }
  });
});

describe("calculateAdvancePaymentTotal", () => {
  it("3 bulan, diskon 2%", () => {
    const r = calculateAdvancePaymentTotal(1000000, 3, 2);
    expect(r.subtotal).toBe(3000000);
    expect(r.discount).toBe(60000);
    expect(r.total).toBe(2940000);
  });
  it("12 bulan, diskon 10%", () => {
    const r = calculateAdvancePaymentTotal(800000, 12, 10);
    expect(r.subtotal).toBe(9600000);
    expect(r.discount).toBe(960000);
    expect(r.total).toBe(8640000);
  });
  it("diskon 0% -> total sama dengan subtotal", () => {
    const r = calculateAdvancePaymentTotal(1000000, 6, 0);
    expect(r.discount).toBe(0);
    expect(r.total).toBe(r.subtotal);
  });
});

describe("distributeDiscount", () => {
  it("terbagi rata kalau habis dibagi", () => {
    expect(distributeDiscount([1000000, 1000000, 1000000], 60000)).toEqual([20000, 20000, 20000]);
  });
  it("sisa pembulatan masuk ke periode terakhir, total tetap presisi", () => {
    const result = distributeDiscount([1000000, 1000000, 1000000], 50000);
    expect(result.reduce((a, b) => a + b, 0)).toBe(50000);
    expect(result[0]).toBe(16667);
    expect(result[1]).toBe(16667);
    expect(result[2]).toBe(16666);
  });
  it("proporsional kalau nominal per periode beda-beda (mis. periode pertama prorata)", () => {
    const result = distributeDiscount([500000, 1000000, 1000000], 100000);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100000);
    expect(result[0]).toBe(20000);
  });
  it("array kosong -> hasil kosong", () => {
    expect(distributeDiscount([], 50000)).toEqual([]);
  });
});

describe("splitBySharePercent", () => {
  it("terbagi rata 50/50", () => {
    const result = splitBySharePercent(1000000, [
      { tenantId: "a", sharePercent: 50 },
      { tenantId: "b", sharePercent: 50 },
    ]);
    expect(result).toEqual([
      { tenantId: "a", amount: 500000 },
      { tenantId: "b", amount: 500000 },
    ]);
  });
  it("share nggak rata (60/40), sisa pembulatan masuk baris terakhir", () => {
    const result = splitBySharePercent(1000001, [
      { tenantId: "a", sharePercent: 60 },
      { tenantId: "b", sharePercent: 40 },
    ]);
    expect(result[0].amount).toBe(600001); // round(1000001*0.6) = 600000.6 -> 600001
    expect(result[0].amount + result[1].amount).toBe(1000001);
  });
  it("3 orang share nggak rata, jumlah tetap presisi", () => {
    const result = splitBySharePercent(1000000, [
      { tenantId: "a", sharePercent: 33.33 },
      { tenantId: "b", sharePercent: 33.33 },
      { tenantId: "c", sharePercent: 33.34 },
    ]);
    expect(result.reduce((s, r) => s + r.amount, 0)).toBe(1000000);
  });
  it("satu orang 100% -> dapat semuanya (kasus kontrak biasa kalau dipaksa lewat sini)", () => {
    expect(splitBySharePercent(750000, [{ tenantId: "a", sharePercent: 100 }])).toEqual([{ tenantId: "a", amount: 750000 }]);
  });
  it("array kosong -> hasil kosong", () => {
    expect(splitBySharePercent(500000, [])).toEqual([]);
  });
});
