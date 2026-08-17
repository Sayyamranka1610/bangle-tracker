import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import type { AppData, Priority, VendorOrder, VendorOrderType, VendorStatus } from '../types';
import { buildAssignRows, makeQueueItem, buildVendorDesignsFromQueue, markImported, openVendorOrders, type QueueItem, type AssignRow } from '../lib/assignUtils';
import { coOrderStageCounts, CO_STAGE_DEFS, orderPct } from '../lib/coStageUtils';
import { genVendorOrderId } from '../lib/vendorUtils';
import { buildAuditLog } from '../lib/auditUtils';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function Assign() {
  const { state, showToast, saveAppData } = useApp();
  const { data, session, hasLock } = state;
  const canEdit = session?.role === 'owner' && hasLock;

  const orders = data.orders ?? [];
  const vendorOrders = data.vendorOrders ?? [];

  const [openOrders, setOpenOrders] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [vosCollapsed, setVosCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<'new' | 'existing'>('new');
  const [saving, setSaving] = useState(false);

  // New-VO form fields
  const [vendor, setVendor]     = useState('');
  const [voType, setVoType]     = useState<VendorOrderType>('karigar');
  const [start, setStart]       = useState(todayStr());
  const [delivery, setDelivery] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [notes, setNotes]       = useState('');
  const [existingVoId, setExistingVoId] = useState('');

  const openVOs = useMemo(() => openVendorOrders(vendorOrders), [vendorOrders]);
  const knownVendors = useMemo(() => {
    const fromVocab = data.vocabulary?.vendors ?? [];
    const fromOrders = vendorOrders.map(o => o.vendor).filter(Boolean);
    return [...new Set([...fromVocab, ...fromOrders])].sort();
  }, [data.vocabulary, vendorOrders]);

  function toggleOrder(id: string) {
    setOpenOrders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function isQueued(row: AssignRow) {
    return queue.some(q => q.orderDbId === row.orderDbId && q.designId === row.designId && q.varietyId === row.varietyId);
  }

  function addToQueue(order: typeof orders[number], row: AssignRow) {
    if (isQueued(row) || row.importedToVOId) return;
    const item = makeQueueItem(order, row);
    if (item) setQueue(prev => [...prev, item]);
  }

  function removeFromQueue(row: AssignRow) {
    setQueue(prev => prev.filter(q => !(q.orderDbId === row.orderDbId && q.designId === row.designId && q.varietyId === row.varietyId)));
  }

  async function submitNew() {
    if (!vendor.trim()) { showToast('Please enter a vendor name', 'error'); return; }
    if (!queue.length) { showToast('Queue is empty — click "+ Queue" on a design row first', 'info'); return; }

    const designs = buildVendorDesignsFromQueue(queue);
    const vo: VendorOrder = {
      id: 'vo_' + Date.now(),
      orderId: genVendorOrderId(vendorOrders),
      vendor: vendor.trim(),
      type: voType,
      startDate: start,
      deliveryDate: delivery || undefined,
      priority,
      status: 'pending' as VendorStatus,
      notes: notes.trim() || undefined,
      designs,
    };

    const nextOrders = markImported(orders, queue, vo.id);
    const patch: Partial<AppData> = { vendorOrders: [...vendorOrders, vo], orders: nextOrders };
    if (session?.username) {
      patch.auditLog = buildAuditLog('Assign VO', `Created ${vo.orderId} for ${vo.vendor} with ${designs.length} design(s)`, session.username, data.auditLog ?? []);
    }

    setSaving(true);
    try {
      await saveAppData(patch, { immediate: true });
      showToast(`${vo.orderId} created for ${vo.vendor}`, 'success');
      setQueue([]);
      setVendor(''); setNotes(''); setDelivery('');
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function submitExisting() {
    if (!queue.length) { showToast('Queue is empty — click "+ Queue" on a design row first', 'info'); return; }
    if (!existingVoId) { showToast('Please select a vendor order', 'error'); return; }
    const target = vendorOrders.find(v => v.id === existingVoId);
    if (!target) { showToast('Vendor order not found', 'error'); return; }

    const newDesigns = buildVendorDesignsFromQueue(queue);
    const nextVendorOrders = vendorOrders.map(vo => vo.id === existingVoId ? { ...vo, designs: [...(vo.designs ?? []), ...newDesigns] } : vo);
    const nextOrders = markImported(orders, queue, existingVoId);
    const patch: Partial<AppData> = { vendorOrders: nextVendorOrders, orders: nextOrders };
    if (session?.username) {
      patch.auditLog = buildAuditLog('Assign VO', `Added ${newDesigns.length} design(s) to ${target.orderId} (${target.vendor})`, session.username, data.auditLog ?? []);
    }

    setSaving(true);
    try {
      await saveAppData(patch, { immediate: true });
      showToast(`Added ${newDesigns.length} design${newDesigns.length !== 1 ? 's' : ''} to ${target.orderId}`, 'success');
      setQueue([]);
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Assign</h1>
        <p className="text-sm text-white/40 mt-0.5">Queue design/variety rows from customer orders, then create or add to a Vendor Order.</p>
        {!canEdit && <p className="text-xs text-yellow-400 bg-yellow-500/10 px-3 py-1.5 rounded-lg mt-2 inline-block">Read-only — you can browse and queue, but submitting requires edit access</p>}
      </div>

      <div className="flex gap-5">
        {/* ── Left: customer orders ── */}
        <div className="flex-1 min-w-0 space-y-2">
          {orders.length === 0 ? (
            <p className="text-center py-16 text-white/30">No customer orders yet.</p>
          ) : orders.map(order => {
            const isOpen = openOrders.has(order.id);
            const stageCts = coOrderStageCounts(order);
            const pct = orderPct(order);
            const rows = isOpen ? buildAssignRows(order) : [];

            return (
              <div key={order.id} className="border border-white/10 rounded-xl overflow-hidden">
                <button onClick={() => toggleOrder(order.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 bg-[#534AB7]/20 hover:bg-[#534AB7]/30 transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{order.orderId} · {order.client}</p>
                    <p className="text-[10px] text-white/50">{order.designs.length} design{order.designs.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex gap-px h-3 w-14 rounded overflow-hidden flex-shrink-0">
                    {CO_STAGE_DEFS.filter(s => stageCts[s.k] > 0).map(s => (
                      <div key={s.k} style={{ flex: stageCts[s.k], background: s.bg }} />
                    ))}
                  </div>
                  <span className="text-xs text-white/60 w-9 text-right flex-shrink-0">{pct}%</span>
                  <span className="text-white/40 text-xs">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="divide-y divide-white/5">
                    {rows.map((row, i) => {
                      const sd = CO_STAGE_DEFS.find(s => s.k === row.stage)!;
                      const queued = isQueued(row);
                      return (
                        <div key={i} className="flex items-center gap-2 px-4 py-2">
                          {row.thumb ? (
                            <img src={row.thumb} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-sm flex-shrink-0">💍</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[#a89fff] truncate">
                              {row.code || '—'} <span className="font-normal text-white/50">{row.name}{row.varName ? ` · ${row.varName}` : ''}</span>
                            </p>
                            <p className="text-[10px] text-white/30">{row.qty} pcs</p>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0" style={{ background: sd.bg, color: sd.tx }}>{sd.lbl}</span>
                          {row.importedToVOId ? (
                            <span className="text-[10px] bg-white/10 text-white/50 rounded-full px-2 py-0.5 flex-shrink-0">
                              → {vendorOrders.find(v => v.id === row.importedToVOId)?.orderId ?? 'VO'}
                            </span>
                          ) : queued ? (
                            <button onClick={() => removeFromQueue(row)}
                              className="text-[10px] font-bold px-2 py-1 rounded border border-[#534AB7] bg-[#534AB7]/20 text-[#a89fff] flex-shrink-0">✓ Queued</button>
                          ) : (
                            <button onClick={() => addToQueue(order, row)}
                              className="text-[10px] font-bold px-2 py-1 rounded bg-[#534AB7] hover:bg-[#6259c8] text-white flex-shrink-0">+ Queue</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Right: vendor orders, queue, form ── */}
        <div className="w-96 flex-shrink-0 space-y-4">
          <div>
            <button onClick={() => setVosCollapsed(v => !v)} className="w-full flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">📋 Vendor Orders ({vendorOrders.length})</span>
              <span className="text-xs text-white/40">{vosCollapsed ? '▼ Show' : '▲ Hide'}</span>
            </button>
            {!vosCollapsed && (
              <div className="max-h-56 overflow-y-auto space-y-2">
                {vendorOrders.length === 0 ? (
                  <p className="text-xs text-white/30 text-center py-4">No vendor orders created yet.</p>
                ) : vendorOrders.map(vo => (
                  <div key={vo.id} className="border border-white/10 rounded-lg overflow-hidden">
                    <div className="px-3 py-1.5 bg-white/5 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-white">{vo.orderId} · {vo.vendor}</p>
                        <p className="text-[10px] text-white/40">{vo.type ?? 'karigar'}{vo.startDate ? ` · ${vo.startDate}` : ''}</p>
                      </div>
                      <span className="text-[10px] font-semibold bg-white/10 text-white/60 rounded-full px-2 py-0.5">{vo.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">🗂 Queue ({queue.length})</span>
              {queue.length > 0 && <button onClick={() => setQueue([])} className="text-[10px] text-white/40 hover:text-white border border-white/10 rounded px-2 py-0.5">Clear all</button>}
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg max-h-48 overflow-y-auto">
              {queue.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-4">Nothing queued yet.</p>
              ) : queue.map((item, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#a89fff] truncate">{item.code || '—'} <span className="font-normal text-white/50">{item.name}{item.varName ? ` · ${item.varName}` : ''}</span></p>
                    <p className="text-[10px] text-white/30">{item.orderId} · {item.client}</p>
                  </div>
                  <button onClick={() => setQueue(prev => prev.filter((_, j) => j !== i))} className="text-white/20 hover:text-red-400 text-xs flex-shrink-0">✕</button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex border border-white/10 rounded-lg overflow-hidden mb-3">
              <button onClick={() => setRightTab('new')}
                className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${rightTab === 'new' ? 'bg-[#534AB7] text-white' : 'bg-white/5 text-white/50'}`}>New VO</button>
              <button onClick={() => setRightTab('existing')}
                className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${rightTab === 'existing' ? 'bg-[#534AB7] text-white' : 'bg-white/5 text-white/50'}`}>Add to existing VO</button>
            </div>

            {rightTab === 'new' ? (
              <div className="space-y-2">
                <input value={vendor} onChange={e => setVendor(e.target.value)} list="assign-vendors" placeholder="Vendor name"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]" />
                <datalist id="assign-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
                <select value={voType} onChange={e => setVoType(e.target.value as VendorOrderType)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none">
                  <option value="karigar">🛠️ Karigar</option>
                  <option value="pipe">🔩 Pipe</option>
                  <option value="plating">🪙 Plating</option>
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={start} onChange={e => setStart(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none [color-scheme:dark]" />
                  <input type="date" value={delivery} onChange={e => setDelivery(e.target.value)} placeholder="Delivery"
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none [color-scheme:dark]" />
                </div>
                <select value={priority} onChange={e => setPriority(e.target.value as Priority)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none">
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="critical">Critical</option>
                </select>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white placeholder-white/30 text-sm resize-none focus:outline-none" />
                <button onClick={submitNew} disabled={!canEdit || saving}
                  className="w-full py-2 rounded-lg bg-[#534AB7] hover:bg-[#6259c8] disabled:opacity-40 text-white text-sm font-semibold transition-colors">
                  {saving ? 'Creating…' : `➕ Create VO · ${queue.length} design${queue.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {openVOs.length === 0 ? (
                  <p className="text-xs text-white/30 text-center py-6">No open vendor orders found.<br />Use the New VO tab to create one.</p>
                ) : (
                  <>
                    <select value={existingVoId} onChange={e => setExistingVoId(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none">
                      <option value="">Select vendor order…</option>
                      {openVOs.map(vo => <option key={vo.id} value={vo.id}>{vo.orderId} — {vo.vendor}</option>)}
                    </select>
                    <button onClick={submitExisting} disabled={!canEdit || saving}
                      className="w-full py-2 rounded-lg bg-[#534AB7] hover:bg-[#6259c8] disabled:opacity-40 text-white text-sm font-semibold transition-colors">
                      {saving ? 'Adding…' : `➕ Add to VO · ${queue.length} design${queue.length !== 1 ? 's' : ''}`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
