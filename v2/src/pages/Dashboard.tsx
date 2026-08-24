import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { CO_STAGE_DEFS, type CoStageKey } from '../lib/coStageUtils';
import {
  buildDashboard, dashboardTotals, allTags,
  type DashItem, type DashOrder,
} from '../lib/dashboardUtils';

// Client Dashboard — every client, their orders, and where each item is right
// now. Read-only: this page never writes to Firebase.

const SIZE_ORDER = ['2/2', '2/4', '2/6', '2/8', '2/10', '2/12', '2/14', '2/16'];

function sortedSizes(sizes: Record<string, number>): string[] {
  const keys = Object.keys(sizes).filter(k => (Number(sizes[k]) || 0) > 0);
  return keys.sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

function StageBar({ counts, total }: { counts: Record<CoStageKey, number>; total: number }) {
  if (!total) return null;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-white/10 mt-2">
      {CO_STAGE_DEFS.map(s => {
        const n = counts[s.k] || 0;
        if (!n) return null;
        return (
          <span key={s.k} title={`${s.lbl}: ${n}`}
            style={{ width: `${(n / total) * 100}%`, background: s.bg }} />
        );
      })}
    </div>
  );
}

function SizeChips({ item }: { item: DashItem }) {
  const sizes = sortedSizes(item.sizes);
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {sizes.map(sz => {
        const ord = Number(item.sizes[sz]) || 0;
        const got = Number(item.recvQty[sz]) || 0;
        if (got >= ord && got > 0) {
          return (
            <span key={sz} className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-green-500/15 text-green-300 border border-green-500/30"
              title={`${sz}: all ${ord} back`}>
              {sz} <b>×{ord}</b> ✓
            </span>
          );
        }
        if (got > 0) {
          return (
            <span key={sz} className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-amber-400/15 text-amber-300 border border-amber-400/30"
              title={`${sz}: ${got} of ${ord} back — ${ord - got} still to come`}>
              {sz} <b>×{got}</b> of {ord}
            </span>
          );
        }
        return (
          <span key={sz} className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-white/5 text-white/60 border border-white/10"
            title={`${sz}: ${ord} ordered, nothing back yet`}>
            {sz} <b>×{ord}</b>
          </span>
        );
      })}
    </div>
  );
}

function ItemCard({ item }: { item: DashItem }) {
  const [showNote, setShowNote] = useState(false);
  const def = CO_STAGE_DEFS.find(s => s.k === item.stage)!;
  const img = item.images?.[0]?.data;
  const back = item.received;
  const ordered = item.qty;

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden bg-white/3">
      {img ? (
        <img src={img} alt="" loading="lazy" className="w-full h-24 object-cover bg-white/5"
          onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
      ) : (
        <div className="w-full h-24 bg-white/5 flex items-center justify-center text-white/20 text-xs">no photo</div>
      )}
      <div className="p-2">
        <div className="text-xs font-semibold text-white truncate" title={item.name}>
          {item.code || '(no code)'}
        </div>
        <div className="text-[10px] text-white/40 truncate" title={`${item.name} — ${item.family}`}>
          {item.varName ? `${item.varName} · ` : ''}{item.finish !== '—' ? item.finish : item.family}
        </div>
        <div className="text-[10px] text-[#a89fff] mt-0.5">
          {ordered} pcs · {sortedSizes(item.sizes).length} size{sortedSizes(item.sizes).length !== 1 ? 's' : ''}
        </div>

        <SizeChips item={item} />

        {back > 0 && (
          <div className={`text-[10px] font-medium mt-1 ${back >= ordered ? 'text-green-300' : 'text-amber-300'}`}>
            {back >= ordered
              ? `✓ all ${ordered} back`
              : `${back} of ${ordered} back · ${ordered - back} still to come`}
          </div>
        )}
        {item.rejected > 0 && (
          <div className="text-[10px] text-red-300 mt-0.5">{item.rejected} rejected</div>
        )}

        <div className="flex items-center justify-between gap-1 mt-1.5">
          <span className="text-[10px] font-semibold rounded-full px-2 py-0.5"
            style={{ background: def.bg, color: def.tx }}>{def.lbl}</span>
          {item.daysInStage !== null && (
            <span className="text-[10px] text-white/30">{item.daysInStage}d</span>
          )}
        </div>

        {item.note && (
          <div className="mt-1.5">
            <button onClick={() => setShowNote(v => !v)}
              className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/30">
              📌 {showNote ? 'hide note' : 'special request'}
            </button>
            {showNote && (
              <p className="mt-1 text-[10px] leading-relaxed text-amber-200/90 bg-amber-400/10 border border-amber-400/25 rounded p-1.5">
                {item.note}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Memory guard. Design photos on R2 are full-size (~500 KB each), so a client
// with 100+ items would pull ~50 MB into memory as you scroll — the same
// pattern behind the May and Aug 2026 out-of-memory crashes. Render a bounded
// page of cards by default and let the user ask for the rest.
const ITEMS_PER_PAGE = 24;

function OrderBlock({ dash, stageFilter }: { dash: DashOrder; stageFilter: CoStageKey | null }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const filtered = stageFilter ? dash.items.filter(i => i.stage === stageFilter) : dash.items;
  const shown = showAll ? filtered : filtered.slice(0, ITEMS_PER_PAGE);
  const hidden = filtered.length - shown.length;

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden mb-3">
      <div className="px-3 py-2.5 bg-white/3 border-b border-white/10 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#a89fff]">{dash.order.orderId}</span>
            {dash.overdue && (
              <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-red-500/20 text-red-300">⚠ overdue</span>
            )}
            {(dash.order.tags ?? []).map(t => (
              <span key={t} className="text-[10px] rounded-full px-2 py-0.5 bg-[#534AB7]/30 text-[#c9c3ff]">{t}</span>
            ))}
          </div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {dash.order.promisedDate
              ? <>promised {dash.order.promisedDate}
                  {dash.daysLeft !== null && (
                    <span className={dash.daysLeft < 0 ? 'text-red-300' : 'text-white/40'}>
                      {' '}({dash.daysLeft < 0 ? `${-dash.daysLeft}d late` : `${dash.daysLeft}d left`})
                    </span>
                  )}
                </>
              : <span className="text-white/25">no promised date</span>}
            {' · '}{dash.dispatched} of {dash.items.length} dispatched
          </div>
        </div>
        <div className="w-40">
          <StageBar counts={dash.counts} total={dash.items.length} />
        </div>
        <button
          onClick={() => navigate(`/orders?focus=${dash.order.id}`)}
          className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors whitespace-nowrap">
          Open order →
        </button>
      </div>

      {shown.length ? (
        <>
          <div className="p-2.5 grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {shown.map(i => <ItemCard key={`${i.designId}-${i.varietyId ?? 'flat'}`} item={i} />)}
          </div>
          {hidden > 0 && (
            <button onClick={() => setShowAll(true)}
              className="w-full py-2 text-[11px] text-[#a89fff] hover:bg-white/5 border-t border-white/10 transition-colors">
              Show {hidden} more item{hidden !== 1 ? 's' : ''} ({filtered.length} in this order)
            </button>
          )}
        </>
      ) : (
        <p className="px-3 py-4 text-center text-[11px] text-white/25">No items at this stage in this order</p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { state } = useApp();
  const { data } = state;

  const [tag, setTag] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<CoStageKey | null>(null);
  const [search, setSearch] = useState('');
  const [openClient, setOpenClient] = useState<string | null>(null);

  const tags = useMemo(() => allTags(data), [data]);

  const clients = useMemo(
    () => buildDashboard(data, { tag, search }),
    [data, tag, search],
  );
  const totals = useMemo(() => dashboardTotals(clients), [clients]);

  const active = clients.find(c => c.client === openClient) ?? null;

  const tiles: { n: string | number; l: string; alert?: boolean }[] = [
    { n: totals.clients, l: 'Clients' },
    { n: totals.orders, l: 'Orders' },
    { n: totals.items, l: 'Items' },
    { n: totals.pieces.toLocaleString(), l: 'Pieces' },
    { n: `${totals.dispatched} / ${totals.items}`, l: 'Dispatched' },
    { n: totals.overdueOrders, l: 'Orders overdue', alert: totals.overdueOrders > 0 },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Every client, every order, and exactly where each item is. Click a client to open them up.
        </p>
      </div>

      {/* Totals */}
      <div className="grid gap-2.5 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        {tiles.map(t => (
          <div key={t.l} className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-3">
            <div className={`text-2xl font-bold leading-none ${t.alert ? 'text-red-400' : 'text-[#a89fff]'}`}>{t.n}</div>
            <div className="text-[10px] uppercase tracking-wide text-white/40 mt-1.5">{t.l}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2 flex-wrap items-center mb-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search client, order, design code…"
          className="flex-1 min-w-[220px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]"
        />
        {tags.length > 0 && (
          <select value={tag ?? ''} onChange={e => setTag(e.target.value || null)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7]">
            <option value="">All tags</option>
            {tags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {/* Stage legend / filter */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {CO_STAGE_DEFS.map(s => {
          const n = totals.counts[s.k] || 0;
          const off = stageFilter !== null && stageFilter !== s.k;
          return (
            <button key={s.k}
              onClick={() => setStageFilter(stageFilter === s.k ? null : s.k)}
              style={{ background: s.bg, color: s.tx, opacity: off ? 0.35 : 1 }}
              className="text-[11px] font-semibold rounded-full px-3 py-1 transition-opacity">
              {s.lbl} · {n}
            </button>
          );
        })}
        {stageFilter && (
          <button onClick={() => setStageFilter(null)}
            className="text-[11px] font-semibold rounded-full px-3 py-1 bg-white/10 text-white/70">✕ show all</button>
        )}
      </div>

      {clients.length === 0 && (
        <p className="text-sm text-white/40 text-center py-10">
          No clients match. {search && 'Try a different search.'}
        </p>
      )}

      {/* Client cards */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {clients.map(c => (
          <button key={c.client}
            onClick={() => setOpenClient(openClient === c.client ? null : c.client)}
            className={`text-left border rounded-xl px-3.5 py-3 transition-all ${
              openClient === c.client
                ? 'border-[#534AB7] bg-[#534AB7]/15'
                : 'border-white/10 bg-white/5 hover:border-[#534AB7]/60'
            }`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-white truncate">{c.client}</span>
              <span className="text-xs font-bold text-[#a89fff]">{c.dispatchedPct}%</span>
            </div>
            <div className="text-[11px] text-white/40 mt-0.5">
              {c.orders.length} order{c.orders.length !== 1 ? 's' : ''} · {c.itemCount} items · {c.pieces.toLocaleString()} pcs
              {c.soonestPromised && ` · due ${c.soonestPromised}`}
            </div>
            <StageBar counts={c.counts} total={c.itemCount} />
            {c.overdueOrders > 0 && (
              <div className="mt-1.5 inline-block text-[10px] font-semibold rounded-full px-2 py-0.5 bg-red-500/20 text-red-300">
                ⚠ {c.overdueOrders} order{c.overdueOrders !== 1 ? 's' : ''} overdue
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Drill-down */}
      {active && (
        <div className="mt-5" id="dash-drill">
          <div className="bg-[#534AB7] rounded-t-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-base font-bold text-white">{active.client}</span>
            <span className="text-xs text-white/70">
              {active.phones.length ? `📞 ${active.phones.join(', ')} · ` : ''}
              {active.itemCount} items · {active.pieces.toLocaleString()} pcs
            </span>
            <span className="flex-1" />
            <button onClick={() => setOpenClient(null)}
              className="text-xs bg-white/20 hover:bg-white/30 text-white rounded-lg px-3 py-1 transition-colors">✕ close</button>
          </div>
          <div className="border border-t-0 border-white/10 rounded-b-xl p-3">
            {active.orders.map(o => (
              <OrderBlock key={o.order.id} dash={o} stageFilter={stageFilter} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
