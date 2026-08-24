import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import type { VendorOrderType } from '../types';
import { addMasterEntry, deleteMasterEntry, renameMasterEntry, setVendorTypeMaster, vendorTypeOf, type MasterListKey } from '../lib/mastersUtils';
import { buildAuditLog } from '../lib/auditUtils';
import FamiliesTab from '../components/masters/FamiliesTab';

type Tab = 'clients' | 'vendors' | 'designs' | 'families' | 'units';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'clients', label: 'Clients',      icon: '👤' },
  { id: 'vendors', label: 'Vendors',      icon: '🏭' },
  { id: 'designs', label: 'Design Names & Codes', icon: '🎨' },
  { id: 'families', label: 'Families',     icon: '🧩' },
  { id: 'units',   label: 'Units',        icon: '📏' },
];

const VENDOR_TYPE_OPTS: { value: VendorOrderType; label: string }[] = [
  { value: 'karigar', label: '🛠️ Karigar' },
  { value: 'pipe',    label: '🔩 Pipe' },
  { value: 'plating', label: '🪙 Plating' },
];

export default function Masters() {
  const { state, showToast, saveAppData } = useApp();
  const { data, session, hasLock } = state;
  const canEdit = session?.role === 'owner' && hasLock;

  const [tab, setTab] = useState<Tab>('clients');

  return (
    <div className={`p-6 mx-auto ${tab === 'families' ? 'max-w-5xl' : 'max-w-4xl'}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Masters</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Auto-populated from orders. Add entries here for dropdown suggestions during order entry.
        </p>
      </div>

      <div className="flex gap-1 mb-5 bg-white/5 border border-white/10 rounded-xl p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-[#534AB7] text-white' : 'text-white/50 hover:text-white'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'clients' && <MasterList label="Client" listKey="clients" data={data} canEdit={canEdit} saveAppData={saveAppData} showToast={showToast} auditUser={session?.username} />}
      {tab === 'vendors' && <MasterList label="Vendor" listKey="vendors" data={data} canEdit={canEdit} saveAppData={saveAppData} showToast={showToast} auditUser={session?.username} showVendorType />}
      {tab === 'designs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MasterList label="Design name" listKey="dnames" data={data} canEdit={canEdit} saveAppData={saveAppData} showToast={showToast} auditUser={session?.username} />
          <MasterList label="Design code" listKey="dcodes" data={data} canEdit={canEdit} saveAppData={saveAppData} showToast={showToast} auditUser={session?.username} />
        </div>
      )}
      {tab === 'families' && <FamiliesTab />}
      {tab === 'units' && <MasterList label="Unit" listKey="units" data={data} canEdit={canEdit} saveAppData={saveAppData} showToast={showToast} auditUser={session?.username} />}
    </div>
  );
}

// ─── Reusable master list (mirrors Phase 1's makeSection accordion) ──────────

interface MasterListProps {
  label: string;
  listKey: MasterListKey;
  data: import('../types').AppData;
  canEdit: boolean;
  showVendorType?: boolean;
  saveAppData: (patch: Partial<import('../types').AppData>) => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  auditUser?: string;
}

function MasterList({ label, listKey, data, canEdit, showVendorType, saveAppData, showToast, auditUser }: MasterListProps) {
  const items = useMemo(() => (listKey === 'units' ? data.vocabulary?.units : data.vocabulary?.[listKey]) ?? [], [data.vocabulary, listKey]);

  const [search, setSearch] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newVendorType, setNewVendorType] = useState<VendorOrderType>('karigar');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter(i => i.toLowerCase().includes(q)) : items;
  }, [items, search]);

  async function handleAdd() {
    if (!newValue.trim()) return;
    const patch = addMasterEntry(data, listKey, newValue, showVendorType ? newVendorType : undefined);
    if (!Object.keys(patch).length) return;
    setNewValue('');
    await saveAppData(patch);
    showToast(`${label} added`, 'success');
  }

  async function handleDelete(value: string) {
    const patch = deleteMasterEntry(data, listKey, value);
    const auditPatch = auditUser ? { auditLog: buildAuditLog('Delete master', `${label}: "${value}" removed`, auditUser, data.auditLog ?? []) } : {};
    await saveAppData({ ...patch, ...auditPatch });
    showToast(`${label} removed`, 'info');
  }

  async function commitRename(idx: number) {
    const oldVal = filtered[idx];
    const trimmed = editValue.trim();
    setEditingIdx(null);
    if (!trimmed || trimmed === oldVal) return;
    const patch = renameMasterEntry(data, listKey, oldVal, trimmed);
    if (!Object.keys(patch).length) return;
    const auditPatch = auditUser ? { auditLog: buildAuditLog('Rename master', `${listKey}: "${oldVal}" → "${trimmed}"`, auditUser, data.auditLog ?? []) } : {};
    await saveAppData({ ...patch, ...auditPatch });
    showToast(`"${oldVal}" renamed to "${trimmed}" everywhere`, 'success');
  }

  async function handleVendorTypeChange(vendorName: string, type: VendorOrderType) {
    const patch = setVendorTypeMaster(data, vendorName, type);
    await saveAppData(patch);
    showToast(`${vendorName} moved to ${VENDOR_TYPE_OPTS.find(o => o.value === type)?.label ?? type}`, 'success');
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-white/3 border-b border-white/10 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{label}s</span>
        <span className="text-xs bg-white/10 text-white/50 rounded-full px-2 py-0.5">{items.length}</span>
      </div>

      {items.length > 5 && (
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}s…`}
          className="w-full bg-transparent border-b border-white/10 px-4 py-2 text-white placeholder-white/30 text-sm focus:outline-none" />
      )}

      <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
        {filtered.length === 0 ? (
          <p className="text-xs text-white/30 px-4 py-3">{items.length === 0 ? 'No entries yet — auto-populated from orders.' : 'No match found.'}</p>
        ) : filtered.map((value, i) => (
          <div key={value} className="flex items-center gap-2 px-4 py-2">
            {editingIdx === i ? (
              <input autoFocus value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitRename(i)}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(i); if (e.key === 'Escape') setEditingIdx(null); }}
                className="flex-1 bg-white/10 border border-[#534AB7] rounded px-2 py-1 text-white text-sm focus:outline-none" />
            ) : (
              <span className="flex-1 text-sm text-white/80 truncate">{value}</span>
            )}
            {showVendorType && editingIdx !== i && (
              <select disabled={!canEdit} value={vendorTypeOf(data, value)}
                onChange={e => handleVendorTypeChange(value, e.target.value as VendorOrderType)}
                title="Vendor segment — changing this moves all their vendor orders too"
                className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white/70 focus:outline-none">
                {VENDOR_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {canEdit && editingIdx !== i && (
              <>
                <button onClick={() => { setEditingIdx(i); setEditValue(value); }}
                  className="text-white/20 hover:text-white transition-colors text-sm" title="Rename">✏️</button>
                <button onClick={() => handleDelete(value)}
                  className="text-white/20 hover:text-red-400 transition-colors text-sm" title="Remove">✕</button>
              </>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex gap-2 px-4 py-3 border-t border-white/10 bg-white/2">
          <input value={newValue} onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder={`New ${label.toLowerCase()}…`}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]" />
          {showVendorType && (
            <select value={newVendorType} onChange={e => setNewVendorType(e.target.value as VendorOrderType)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none">
              {VENDOR_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <button onClick={handleAdd}
            className="px-3 py-1.5 rounded-lg bg-[#534AB7] hover:bg-[#6259c8] text-white text-sm font-medium transition-colors whitespace-nowrap">
            + Add
          </button>
        </div>
      )}
    </div>
  );
}
