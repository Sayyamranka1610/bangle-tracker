// ─── Core data types matching the Phase 1 Firebase schema ───────────────────

export type Role = 'owner' | 'worker';

export interface User {
  password: string;
  role: Role;
  name?: string;
}

export interface UsersMap {
  [username: string]: User;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type OrderStatus = 'pending' | 'in_progress' | 'done';

export interface Order {
  id: string;
  clientName: string;
  orderId: string;
  deadline: number; // Unix ms
  status: OrderStatus;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Designs ─────────────────────────────────────────────────────────────────

export type DesignType = 'cnc' | 'dye_gold';

export interface SizeVariety {
  size: string;  // e.g. "S", "M", "L", "8cm"
  qty: number;
}

export interface DesignImage {
  data: string;     // base64 data URL (compressed thumbnail) or R2 URL
  r2Key?: string;   // key in R2 bucket if stored there
  isR2?: boolean;
}

export interface Design {
  id: string;
  code: string;
  name: string;
  type: DesignType;
  varieties: SizeVariety[];
  simplifiedCncQty?: number;  // used in simplified CNC mode
  image?: DesignImage;
  hqImageKey?: string;        // Firebase key at /bangImages/{key}
  orderId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export type LedgerEntryType = 'in' | 'out';

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  material: string;
  qty: number;
  unit: string;
  vendor?: string;
  orderId?: string;
  designId?: string;
  notes?: string;
  date: number; // Unix ms
  createdAt: number;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  user: string;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
  at: number; // Unix ms
}

// ─── Top-level app data (stored at /appData in Firebase) ─────────────────────

export interface AppData {
  orders?: Record<string, Order>;
  designs?: Record<string, Design>;
  inventory?: Record<string, LedgerEntry>;
  audit?: Record<string, AuditEntry>;
  vocabulary?: {
    materials?: string[];
    units?: string[];
    vendors?: string[];
  };
}

// ─── Edit lock ───────────────────────────────────────────────────────────────

export interface EditLock {
  deviceId: string;
  username: string;
  at: number;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  username: string;
  role: Role;
  token: string;
  deviceId: string;
}
