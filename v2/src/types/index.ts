// ─── Core types — mirror the Phase 1 Firebase schema exactly ────────────────

export type Role = 'owner' | 'member' | 'worker';  // 'worker' is a legacy alias for 'member'
export type Priority = 'normal' | 'urgent' | 'critical';
export type BangleType = 'dye_gold' | 'cnc' | 'both';
export type AlertLevel = 'ok' | 'warn' | 'late' | 'done';
export type StageStatus = 'pending' | 'done' | 'delayed';
export type StageGroup = 'raw' | 'semi' | 'finished';

// ─── Stage template (from DEFAULT_STAGES) ────────────────────────────────────

export interface StageTemplate {
  id: string;       // 's1' – 's9'
  name: string;
  loc: string;
  days: number;
  urgDays: number;
  group: StageGroup;
}

// ─── Stage instance stored on a design ───────────────────────────────────────

export interface DesignStage {
  stageId: string;          // references StageTemplate.id
  // Inline copies from the template (stored on the stage in Phase 1)
  name?: string;
  loc?: string;
  group?: string;
  status: StageStatus;
  completionDate?: string;  // YYYY-MM-DD
  qty?: number;
  vendor?: string;
  stageNote?: string;
  days?: number;            // custom effDays override
}

// ─── Design image ─────────────────────────────────────────────────────────────

export interface DesignImage {
  data: string;   // base64 data URL or R2 URL
  name?: string;
}

// ─── Vendor-pipeline linkage (mirrors Phase 1's _coStage system) ────────────
// Lives on either a design (flat/CNC rows) or a variety (dye-gold rows) — the
// same fields Phase 1 calls "holder" fields, set via setCOPipeVo/setCOPlatingVo/
// upDesignVendor/upVarietyVendor/toggleCOStageRcvd. This is what ACTUALLY
// drives an order's production status — the design.stages[] 9-step checklist
// below is a separate, mostly-cosmetic per-row deadline badge, not this.
export interface VendorPipelineFields {
  pipeVendor?: string;       // vendor name, or '__own__' for in-house stock
  pipeVendorAt?: number;
  pipeReceived?: boolean;
  pipeReceivedAt?: number;
  assignedVendor?: string;   // karigar vendor name, or '__own__'
  assignedVendorAt?: number;
  karigarReceived?: boolean;
  karigarReceivedAt?: number;
  platingVendor?: string;
  platingVendorAt?: number;
  platingReceived?: boolean;
  platingReceivedAt?: number;
  importedToVOId?: string | null; // which VendorOrder this row was added to
  // Dispatch shortcut fields — set together by "mark complete", at EITHER the
  // design level (markDesignComplete, flat/CNC rows) or the variety level
  // (markVarietyDone, dye-gold rows) — both are real, independent toggles.
  receivedFromKarigar?: boolean;
  dispatchedToClient?: boolean;
  dispatchedAt?: number;
  done?: boolean;
  // ── Retail additions (Aug 2026) — all optional, older rows simply lack them ──
  // Free-text special request for this exact row ("wants lighter weight").
  // Surfaced as a tap-to-open badge; never silently truncated.
  note?: string;
  // Per-size quantities actually received back GOOD (after rejections).
  // The existing pipe/karigar/platingReceived booleans keep working exactly as
  // before — this is an extra detail layer, not a replacement.
  recvQty?: Record<string, number>;
  // Per-size quantities rejected by QC on arrival.
  rejQty?: Record<string, number>;
}

// ─── Variety (sub-design per code) ───────────────────────────────────────────

export interface DesignVariety extends VendorPipelineFields {
  id: string;
  name: string;
  sizes: Record<string, number>;  // e.g. { "2/2": 50, "2/4": 100 }
  images?: DesignImage[];
  unit?: string;
  rate?: number;
}

// ─── Design embedded inside an order ─────────────────────────────────────────

export interface EmbeddedDesign extends VendorPipelineFields {
  id: string;
  name: string;
  code?: string;
  sizes?: Record<string, number>;  // aggregate across varieties
  sizesLocked?: boolean;
  images?: DesignImage[];
  varieties?: DesignVariety[];
  stages: DesignStage[];
  unit?: string;
  rate?: number;
  bangleType?: 'cnc';  // set only for CNC designs
}

// ─── Order ───────────────────────────────────────────────────────────────────

export interface Order {
  id: string;
  orderId: string;        // ORD-001 assigned by renumberOrders()
  createdAt: string;      // ISO string
  client: string;
  startDate: string;      // YYYY-MM-DD
  priority: Priority;
  notes?: string;
  bangleType: BangleType;
  designs: EmbeddedDesign[];
  attachedFile?: { name: string; type: string; data?: string } | null;
  archived?: boolean;
  archivedAt?: number;
  // ── Retail additions (Aug 2026) — all optional ──
  promisedDate?: string;   // YYYY-MM-DD — what you told the customer
  phone?: string;          // customer contact
  tags?: string[];         // cohorts, e.g. ["Exhibition Aug 2026", "Retail"]
}

// ─── Inventory ledger entry ───────────────────────────────────────────────────

export interface LedgerEntry {
  id: string;
  date: string;                 // YYYY-MM-DD
  designName?: string;
  designCode?: string;
  type: string;                 // raw_in | raw_out | raw_rejection | semi_in | ... | fin_rejection
  qty: number;
  qtyKg?: number;               // legacy field (always 0 in new entries)
  qtySets?: number;             // legacy field
  orderId?: string;
  vendor?: string;
  note?: string;
  source?: string;
  autoType?: string;
  stageRef?: { oi: number; di: number; si: number; groupId: string } | null;
  rejections?: number;
}

// ─── Audit log entry ──────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  ts: string;             // ISO string (Phase 1 field name)
  action: string;
  detail?: string;
  user?: string;
}

// ─── Vocabulary (autocomplete data) ──────────────────────────────────────────

export interface Vocabulary {
  clients?: string[];
  vendors?: string[];
  dnames?: string[];
  dcodes?: string[];
  units?: string[];
}

// ─── Vendor orders ────────────────────────────────────────────────────────────

export type VendorStatus =
  | 'pending'
  | 'processing'
  | 'in_progress'
  | 'qa'
  | 'dispatched'
  | 'delivered';

export interface VendorDesign {
  id: string;
  name?: string;
  code?: string;
  sizesLocked?: boolean;
  sizes?: Record<string, number>;
  images?: DesignImage[];
  varieties?: DesignVariety[];
  unit?: string;
  // ── Retail additions (Aug 2026) ──
  // WHERE the pooled quantity came from. Without this, clubbing several
  // customers into one batch loses track of who is owed what — see
  // PoolSource below. Absent on every pre-existing vendor order, which is
  // fine: those were always one-order-to-one-vendor.
  sources?: PoolSource[];
  // Extra pieces deliberately made beyond customer demand, per size.
  bufferSizes?: Record<string, number>;  // cover for rejections
  stockSizes?: Record<string, number>;   // speculative / for stock
}

// One customer's contribution to a pooled vendor-order line.
export interface PoolSource {
  orderDbId: string;         // Order.id
  orderLabel: string;        // ORD-014 / RET-003, for display
  client: string;
  designId: string;
  varietyId: string | null;  // null = flat/CNC row
  sizes: Record<string, number>;
}

// ─── Finished-goods stock ─────────────────────────────────────────────────────
// Created by the retail work (Aug 2026). Phase 1 has an empty `stockItems`
// array that was never used; this is a fresh, real implementation.
export interface StockItem {
  id: string;
  code: string;
  name: string;
  family?: string;
  finish?: string;
  sizes: Record<string, number>;
  images?: DesignImage[];
  updatedAt: number;
}

export type VendorOrderType = 'pipe' | 'karigar' | 'plating';

export interface VendorOrder {
  id: string;
  orderId: string;          // VORD-01, VORD-02...
  vendor: string;
  type?: VendorOrderType;   // defaults to 'karigar' when absent (Phase 1 behavior)
  startDate: string;        // YYYY-MM-DD
  deliveryDate?: string;    // YYYY-MM-DD — absence means no deadline
  priority: Priority;
  status: VendorStatus;
  notes?: string;
  designs?: VendorDesign[];
}

// ─── Top-level appData stored at /appData in Firebase ────────────────────────

export interface AppData {
  orders?: Order[];
  vendorOrders?: VendorOrder[];
  invLedger?: LedgerEntry[];
  auditLog?: AuditEntry[];
  vocabulary?: Vocabulary;
  vocabularyManual?: Vocabulary;
  vendorTypes?: Record<string, VendorOrderType>; // vendor name -> default segment (Masters page)
  // ── Retail additions (Aug 2026) — all optional ──
  designFamilies?: Record<string, string>; // UPPERCASED design code -> family name
  familyNotes?: Record<string, string>;    // family name -> standing notes
  stockItems?: StockItem[];                // finished-goods stock
}

// ─── Edit lock ───────────────────────────────────────────────────────────────

export interface EditLock {
  deviceId: string;
  username: string;
  at: number;
}

// ─── Auth session ─────────────────────────────────────────────────────────────

export interface Session {
  username: string;
  role: Role;
  token: string;
  deviceId: string;
}
