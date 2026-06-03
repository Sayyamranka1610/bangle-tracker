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
  status: StageStatus;
  completionDate?: string;  // YYYY-MM-DD
  qty?: number;
  vendor?: string;
  stageNote?: string;
  days?: number;            // custom effDays override (null = use template)
}

// ─── Design image ─────────────────────────────────────────────────────────────

export interface DesignImage {
  data: string;   // base64 data URL or R2 URL
  name?: string;
}

// ─── Variety (sub-design per code) ───────────────────────────────────────────

export interface DesignVariety {
  id: string;
  name: string;
  sizes: Record<string, number>;  // e.g. { "2/2": 50, "2/4": 100 }
  images?: DesignImage[];
  unit?: string;
  rate?: number;
}

// ─── Design embedded inside an order ─────────────────────────────────────────

export interface EmbeddedDesign {
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
}

// ─── Inventory ledger entry ───────────────────────────────────────────────────

export interface LedgerEntry {
  id: string;
  date: string;           // YYYY-MM-DD
  designName?: string;
  designCode?: string;
  type: 'in' | 'out';
  qty: number;
  unit?: string;
  orderId?: string;
  note?: string;
  source?: string;
  vendor?: string;
}

// ─── Audit log entry ──────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  at: string;             // ISO string
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
  name?: string;
  code?: string;
  varieties?: DesignVariety[];
}

export interface VendorOrder {
  id: string;
  orderId: string;          // VORD-01, VORD-02...
  vendor: string;
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
