// ─── Core types — mirror the Phase 1 Firebase schema exactly ────────────────

export type Role = 'owner' | 'worker';
export type Priority = 'normal' | 'urgent' | 'critical';
export type BangleType = 'dye_gold' | 'cnc' | 'both';
export type AlertLevel = 'ok' | 'warn' | 'late' | 'done';
export type StageStatus = 'pending' | 'in_progress' | 'done';

// ─── Design stages (production steps within a design) ────────────────────────

export interface DesignStage {
  id: string;
  name: string;
  loc?: string;
  days?: number;
  urgDays?: number;
  group?: string;
  status: StageStatus;
  completionDate?: string;  // YYYY-MM-DD
  completionNote?: string;
  effDays?: number;
}

// ─── Variety (size grid within a design) ─────────────────────────────────────

export interface DesignVariety {
  id?: string;
  name?: string;
  sizes: Record<string, string | number>;  // e.g. { "S": 10, "M": 20 }
}

// ─── Design embedded inside an order ─────────────────────────────────────────

export interface EmbeddedDesign {
  id: string;
  name: string;
  code?: string;
  sizes?: string[];
  varieties?: DesignVariety[];
  stages: DesignStage[];
  image?: string;       // base64 thumbnail
  r2ImageKey?: string;
  notes?: string;
  cncQty?: number;      // simplified CNC quantity mode
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

// ─── Top-level appData stored at /appData in Firebase ────────────────────────

export interface AppData {
  orders?: Order[];
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
