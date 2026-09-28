export type RoomType = {
  id: string;
  name: string;
  base_price: number;
  description: string | null;
  facilities: string[];
};

export type Room = {
  id: string;
  room_number: string;
  room_type_id: string;
  floor: number | null;
};

export type Tenancy = {
  id: string;
  tenant_id: string;
  room_id: string;
  billing_cycle: "BULANAN" | "TRIWULAN" | "SEMESTER" | "TAHUNAN";
  monthly_rate: number;
  start_date: string;
  end_date: string | null;
  status: "AKTIF" | "BERAKHIR" | "DIBATALKAN";
  room: Room & { room_type: RoomType };
};

export type InvoiceStatus = "DRAFT" | "TERBIT" | "SEBAGIAN_DIBAYAR" | "LUNAS" | "JATUH_TEMPO" | "DIBATALKAN";

export type Invoice = {
  id: string;
  invoice_number: string;
  due_date: string;
  status: InvoiceStatus;
  total: number;
  paid_total: number;
};

export type InvoiceItemType = "SEWA_KAMAR" | "LAUNDRY" | "PARKIR_TAMBAHAN" | "TAMU_MENGINAP" | "PERBAIKAN" | "DENDA" | "DISKON" | "LAINNYA";

export type InvoiceItem = {
  id: string;
  item_type: InvoiceItemType;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

export type InvoiceDetail = {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  due_date: string;
  status: InvoiceStatus;
  subtotal: number;
  discount_total: number;
  penalty_total: number;
  total: number;
  paid_total: number;
  notes: string | null;
  items: InvoiceItem[];
};

export type Deposit = {
  id: string;
  remaining_amount: number;
};

export type Voucher = {
  id: string;
  code: string;
  voucher_type: "NOMINAL" | "PERSEN";
  value: number;
  max_discount: number | null;
  min_transaction: number;
  quota: number | null;
  used_count: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
};

export type Penalty = {
  id: string;
  name: string;
  calc_type: "NOMINAL_PER_HARI" | "PERSEN_PER_HARI";
  value: number;
  grace_period_days: number;
  max_amount: number | null;
  is_active: boolean;
};

export type Profile = {
  id: string;
  role: "penghuni" | "admin";
  full_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  created_at: string;
};

export type TenancyWithTenant = Tenancy & {
  tenant: { id: string; full_name: string; phone: string };
};

export type PaymentProof = {
  id: string;
  file_path: string;
  uploaded_at: string;
  payment_account: {
    account_type: PaymentAccountType;
    bank_name: string | null;
    account_number: string | null;
    ewallet_provider: string | null;
    crypto_asset: string | null;
    crypto_network: string | null;
  } | null;
};

export type PaymentForReview = {
  id: string;
  payment_number: string;
  method: string;
  amount: number;
  admin_fee: number;
  unique_code: number | null;
  deposit_used: number;
  voucher_discount: number;
  status: string;
  created_at: string;
  tenant: { full_name: string; phone: string } | null;
  payment_proofs: PaymentProof[];
};

export type AuditLog = {
  id: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor: { full_name: string } | null;
};

export type Complaint = {
  id: string;
  category: string;
  title: string;
  description: string;
  status: "BARU" | "DIPROSES" | "SELESAI" | "DITOLAK";
  admin_response: string | null;
  created_at: string;
};

export type PaymentAccountType = "BANK" | "QRIS" | "EWALLET" | "CRYPTO";

export type PaymentAccount = {
  id: string;
  account_type: PaymentAccountType;
  bank_code: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  qris_image_path: string | null;
  ewallet_provider: string | null;
  crypto_asset: string | null;
  crypto_network: string | null;
  instructions: string | null;
  is_active: boolean;
  sort_order: number;
};

export type MyInvoiceView = InvoiceDetail & {
  isShared: boolean;
  myShareAmount: number;
  myPaidAmount: number;
};

export type NotificationRow = {
  id: string;
  category: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
};
