import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { Order } from '../types';
import {
  computeKpis,
  computeClientLeaderboard,
  computeDesignPopularity,
  computeBangleTypeBreakdown,
  computePriorityBreakdown,
  type ClientRow,
  type DesignPopularityRow,
  type BreakdownItem,
} from '../lib/analyticsUtils';
import { computeProductionPipeline, computeAllStagesRows, CO_STAGE_DEFS, type CoStageKey } from '../lib/coStageUtils';
import { computeTurnaroundRows, taAvg, taMedian, taFmt, taGroup, TURNAROUND_TRACKING_SINCE, type TaGroup, type TurnaroundRow } from '../lib/turnaroundUtils';

// ─── Shared sub-components ────────────────────────────────────────────────────

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">{title}</h2>
      {subtitle && <p className="text-xs text-white/40 mt-1 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

// ─── KPI cards (mirrors Phase 1's "Key metrics") ──────────────────────────────

function KpiCards({ orders }: { orders: Order[] }) {
  const kpi = useMemo(() => computeKpis(orders), [orders]);
  const cards = [
    { label: 'Total Orders',   value: kpi.totalOrders,      sub: 'incl. archived' },
    { label: 'Total Designs',  value: kpi.totalDesigns,     sub: 'in production' },
    { label: 'Pieces Ordered', value: kpi.totalPieces.toLocaleString(), sub: 'total quantity' },
    { label: 'Avg. Completion', value: `${kpi.avgCompletionPct}%`, sub: 'across all orders' },
    { label: 'Pending',        value: kpi.pendingOrders,    sub: 'not yet dispatched' },
    { label: 'Completed',      value: kpi.completedOrders,  sub: 'fully dispatched' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-2xl font-bold text-white">{c.value}</p>
          <p className="text-xs font-medium text-white/70 mt-0.5">{c.label}</p>
          <p className="text-xs text-white/30 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Production Pipeline (mirrors Phase 1's real, live "Production Pipeline") ─

function StageBar({ counts, height = 'h-7' }: { counts: Record<CoStageKey, number>; height?: string }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return <div className={`${height} bg-white/5 rounded-md`} />;
  return (
    <div className={`flex gap-px ${height} rounded-md overflow-hidden`}>
      {CO_STAGE_DEFS.filter(s => counts[s.k] > 0).map(s => (
        <div key={s.k} style={{ flex: counts[s.k], background: s.bg, color: s.tx }}
          className="flex items-center justify-center text-[10px] font-bold overflow-hidden whitespace-nowrap" title={`${s.lbl}: ${counts[s.k]}`}>
          {counts[s.k]}
        </div>
      ))}
    </div>
  );
}

function ProductionPipeline({ orders }: { orders: Order[] }) {
  const pipeline = useMemo(() => computeProductionPipeline(orders), [orders]);

  if (!pipeline.total) return <p className="text-white/30 text-sm">No production rows yet.</p>;

  return (
    <div>
      <StageBar counts={pipeline.grand} />
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 mb-5">
        {CO_STAGE_DEFS.map(s => (
          <span key={s.k} className="flex items-center gap-1.5 text-xs text-white/50">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.bg }} />
            {s.lbl} <strong className="text-white/80">{pipeline.grand[s.k]}</strong>
          </span>
        ))}
      </div>

      <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Per customer</p>
      <div className="space-y-2">
        {pipeline.perClient.map(row => (
          <div key={row.client} className="flex items-center gap-3">
            <div className="w-32 flex-shrink-0 min-w-0">
              <p className="text-sm text-white truncate">{row.client}</p>
              <p className="text-[10px] text-white/30">{row.orderCount} order{row.orderCount !== 1 ? 's' : ''} · {row.designCount} design{row.designCount !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex-1"><StageBar counts={row.counts} height="h-5" /></div>
            <span className={`w-10 flex-shrink-0 text-right text-xs font-semibold ${row.dispatchPct === 100 ? 'text-green-400' : row.dispatchPct > 0 ? 'text-[#a89fff]' : 'text-white/30'}`}>
              {row.dispatchPct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── All stages — full view ────────────────────────────────────────────────────

function AllStagesView({ orders }: { orders: Order[] }) {
  const rows = useMemo(() => computeAllStagesRows(orders), [orders]);

  return (
    <div className="space-y-3">
      {CO_STAGE_DEFS.map(s => {
        const items = rows[s.k];
        return (
          <div key={s.k} className="border rounded-xl overflow-hidden" style={{ borderColor: s.bg }}>
            <div className="flex items-center gap-2 px-3 py-2" style={{ background: s.bg }}>
              <span className="text-xs font-bold" style={{ color: s.tx }}>{s.lbl}</span>
              <span className="text-[10px] font-semibold bg-white/50 rounded-full px-2 py-0.5" style={{ color: s.tx }}>
                {items.length} row{items.length !== 1 ? 's' : ''}
              </span>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-white/20 text-center py-2">Nothing here right now</p>
            ) : (
              <div className="divide-y divide-white/5 max-h-48 overflow-y-auto">
                {items.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#a89fff] truncate">
                        {r.code || '—'} <span className="font-normal text-white/50">{r.name}{r.varName ? ` · ${r.varName}` : ''}</span>
                      </p>
                      <p className="text-[10px] text-white/30">{r.orderId} · {r.client}</p>
                    </div>
                    <span className="text-[10px] text-white/40 flex-shrink-0">{r.qty} pcs</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Turnaround Time (mirrors Phase 1's _renderTurnaroundSection exactly) ────
// How long each dispatched design/variety row actually took from order
// creation to dispatch, and where along the way the time went.

function TaBarList({ groups, barColor, onBarClick, activeKey }: { groups: TaGroup[]; barColor: string; onBarClick?: (key: string) => void; activeKey?: string | null }) {
  if (!groups.length) return <p className="text-xs text-white/30 text-center py-3">Not enough dispatched data yet.</p>;
  const max = Math.max(...groups.map(g => g.avg), 0.01);
  return (
    <div className="space-y-2">
      {groups.map(g => (
        <div key={g.key}
          onClick={() => onBarClick?.(g.key)}
          className={`flex items-center gap-3 ${onBarClick ? 'cursor-pointer rounded-lg -mx-1 px-1 py-0.5 transition-colors' : ''} ${activeKey === g.key ? 'bg-white/10' : onBarClick ? 'hover:bg-white/5' : ''}`}>
          <span className="text-xs text-white/60 w-28 flex-shrink-0 truncate" title={`${g.key} — ${g.n} row${g.n !== 1 ? 's' : ''} — click to see rows`}>{g.key}</span>
          <div className="flex-1 h-5 bg-white/10 rounded overflow-hidden">
            <div className="h-full flex items-center px-2 text-[10px] font-semibold text-white whitespace-nowrap"
              style={{ width: `${Math.round(g.avg / max * 100)}%`, background: barColor }}>
              {taFmt(g.avg)} avg · {g.n}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Turnaround drilldown panel — mirrors Phase 1's showTurnaroundDrilldown ──
// Click a bar in any of the ranked lists above to see exactly which dispatched
// rows make up that average, ranked slowest-first, click a row to jump to it.

type TaDimension = 'client' | 'code' | 'pipeVendor' | 'karigar' | 'platingVendor';
const TA_DAY_FIELD: Record<TaDimension, keyof TurnaroundRow> = {
  pipeVendor: 'pipeDays', karigar: 'karigarDays', platingVendor: 'platingDays', client: 'totalDays', code: 'totalDays',
};

function TaDrilldownPanel({ rows, dim, dimKey, onClose }: { rows: TurnaroundRow[]; dim: TaDimension; dimKey: string; onClose: () => void }) {
  const navigate = useNavigate();
  const dayField = TA_DAY_FIELD[dim];
  const matched = rows.filter(r => r[dim] === dimKey);
  const sorted = [...matched].sort((a, b) => (Number(b[dayField]) || 0) - (Number(a[dayField]) || 0));

  return (
    <div className="mt-4 bg-white/5 border border-[#534AB7]/40 rounded-xl p-4 max-h-[50vh] overflow-y-auto">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-white">{dimKey} — {sorted.length} row{sorted.length !== 1 ? 's' : ''}</span>
        <button onClick={onClose} className="ml-auto text-white/40 hover:text-white text-sm leading-none">✕</button>
      </div>
      <div className="divide-y divide-white/5">
        {sorted.map((r, i) => (
          <div key={i}
            onClick={() => navigate(`/orders?focus=${r.orderDbId}`)}
            className="flex items-center gap-3 py-2 px-1 cursor-pointer rounded hover:bg-white/5 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#a89fff] truncate">{r.code} <span className="font-normal text-white/60">· {r.client}</span></p>
              {r.orderLabel && <p className="text-[10px] text-white/30">{r.orderLabel}</p>}
            </div>
            <span className="text-xs font-semibold text-red-400 whitespace-nowrap">{taFmt(Number(r[dayField]))}</span>
            <span className="text-[10px] text-[#a89fff] flex-shrink-0">→</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TurnaroundSection({ orders }: { orders: Order[] }) {
  const rows = useMemo(() => computeTurnaroundRows(orders), [orders]);
  const [drilldown, setDrilldown] = useState<{ dim: TaDimension; key: string } | null>(null);
  function toggleDrilldown(dim: TaDimension, key: string) {
    setDrilldown(d => (d && d.dim === dim && d.key === key) ? null : { dim, key });
  }

  if (!rows.length) {
    return (
      <Card title="⏱ Turnaround Time — Order to Dispatch">
        <p className="text-xs text-[#a89fff] font-semibold mb-2">{TURNAROUND_TRACKING_SINCE}</p>
        <p className="text-center py-6 text-white/40 text-sm">
          No dispatched rows with full timing data yet.<br />
          <span className="text-xs text-white/25">This fills in automatically as orders get dispatched from now on — nothing is estimated or guessed.</span>
        </p>
      </Card>
    );
  }

  const totalDaysArr = rows.map(r => r.totalDays);
  const overallAvg = taAvg(totalDaysArr);
  const overallMedian = taMedian(totalDaysArr);
  const fastest = Math.min(...totalDaysArr);
  const slowest = Math.max(...totalDaysArr);

  const byClient = taGroup(rows, r => r.client, r => r.totalDays, 1).slice(0, 8);
  const byCode = taGroup(rows, r => r.code, r => r.totalDays, 1).slice(0, 8);
  const byPipeVendor = taGroup(rows, r => r.pipeVendor, r => r.pipeDays, 3);
  const byKarigar = taGroup(rows, r => r.karigar, r => r.karigarDays, 3);
  const byPlatingVendor = taGroup(rows, r => r.platingVendor, r => r.platingDays, 3);

  const stageStats = ([
    ['Pipe wait', taAvg(rows.map(r => r.pipeDays).filter((x): x is number => x != null)), rows.filter(r => r.pipeDays != null).length, '#1565C0'],
    ['Karigar production', taAvg(rows.map(r => r.karigarDays).filter((x): x is number => x != null)), rows.filter(r => r.karigarDays != null).length, '#4A148C'],
    ['Plating', taAvg(rows.map(r => r.platingDays).filter((x): x is number => x != null)), rows.filter(r => r.platingDays != null).length, '#BF360C'],
    ['Packing → dispatch', taAvg(rows.map(r => r.packingDays).filter((x): x is number => x != null)), rows.filter(r => r.packingDays != null).length, '#2E7D32'],
  ] as [string, number | null, number, string][]).filter(s => s[1] != null);
  const maxStage = Math.max(...stageStats.map(s => s[1]!), 0.01);

  // Monthly trend
  const byMonth = new Map<string, number[]>();
  rows.forEach(r => {
    const mk = new Date(r.dispatchedAt).toISOString().slice(0, 7);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk)!.push(r.totalDays);
  });
  const monthKeys = [...byMonth.keys()].sort();
  const maxMonth = Math.max(...monthKeys.map(k => taAvg(byMonth.get(k)!) ?? 0), 0.01);

  return (
    <>
      <Card title="⏱ Turnaround Time — Order to Dispatch">
        <p className="text-xs text-[#a89fff] font-semibold mb-1">{TURNAROUND_TRACKING_SINCE}</p>
        <p className="text-xs text-white/40 mb-4">Based on {rows.length} dispatched row{rows.length !== 1 ? 's' : ''} with complete timing data · measured from order creation to dispatch</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white/5 rounded-lg p-3"><p className="text-xl font-bold text-white">{taFmt(overallAvg)}</p><p className="text-xs text-white/40 mt-0.5">Average</p></div>
          <div className="bg-white/5 rounded-lg p-3"><p className="text-xl font-bold text-white">{taFmt(overallMedian)}</p><p className="text-xs text-white/40 mt-0.5">Median (typical)</p></div>
          <div className="bg-white/5 rounded-lg p-3"><p className="text-xl font-bold text-green-400">{taFmt(fastest)}</p><p className="text-xs text-white/40 mt-0.5">Fastest</p></div>
          <div className="bg-white/5 rounded-lg p-3"><p className="text-xl font-bold text-red-400">{taFmt(slowest)}</p><p className="text-xs text-white/40 mt-0.5">Slowest</p></div>
        </div>
      </Card>

      <Card title="Where the time actually goes" subtitle="Average days spent in each stage (only rows with both start & end timestamps count)">
        {stageStats.length === 0 ? (
          <p className="text-xs text-white/30 text-center py-3">No stage timing data yet.</p>
        ) : (
          <div className="space-y-2">
            {stageStats.map(([name, avg, n, color]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-xs text-white/60 w-36 flex-shrink-0">{name}</span>
                <div className="flex-1 h-5 bg-white/10 rounded overflow-hidden">
                  <div className="h-full flex items-center px-2 text-[10px] font-semibold text-white whitespace-nowrap"
                    style={{ width: `${Math.round((avg! / maxStage) * 100)}%`, background: color }}>
                    {taFmt(avg)} · {n} rows
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title="Slowest Clients" subtitle="Top 8 by average total turnaround · click to see rows">
          <TaBarList groups={byClient} barColor="#534AB7" onBarClick={k => toggleDrilldown('client', k)} activeKey={drilldown?.dim === 'client' ? drilldown.key : null} />
        </Card>
        <Card title="Slowest Design Codes" subtitle="Top 8 by average total turnaround · click to see rows">
          <TaBarList groups={byCode} barColor="#0F6E56" onBarClick={k => toggleDrilldown('code', k)} activeKey={drilldown?.dim === 'code' ? drilldown.key : null} />
        </Card>
      </div>

      <Card title="Vendor performance" subtitle="Average days per stage, slowest first · click a vendor to see affected orders">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] font-bold text-[#1565C0] uppercase tracking-wide mb-1.5">🔩 Pipe vendors</p>
            <TaBarList groups={byPipeVendor} barColor="#1565C0" onBarClick={k => toggleDrilldown('pipeVendor', k)} activeKey={drilldown?.dim === 'pipeVendor' ? drilldown.key : null} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#4A148C] uppercase tracking-wide mb-1.5">🛠️ Karigars</p>
            <TaBarList groups={byKarigar} barColor="#4A148C" onBarClick={k => toggleDrilldown('karigar', k)} activeKey={drilldown?.dim === 'karigar' ? drilldown.key : null} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#BF360C] uppercase tracking-wide mb-1.5">🪙 Plating vendors</p>
            <TaBarList groups={byPlatingVendor} barColor="#BF360C" onBarClick={k => toggleDrilldown('platingVendor', k)} activeKey={drilldown?.dim === 'platingVendor' ? drilldown.key : null} />
          </div>
        </div>
        <p className="text-[10px] text-white/25 mt-2">Vendors with fewer than 3 dispatched rows aren't ranked yet.</p>
        {drilldown && <TaDrilldownPanel rows={rows} dim={drilldown.dim} dimKey={drilldown.key} onClose={() => setDrilldown(null)} />}
      </Card>

      <Card title="Monthly Trend" subtitle="Average total days per dispatch month">
        {monthKeys.length <= 1 ? (
          <p className="text-xs text-white/30 text-center py-3">Need at least 2 months of dispatched orders to show a trend.</p>
        ) : (
          <div className="space-y-2">
            {monthKeys.map(k => {
              const avg = taAvg(byMonth.get(k)!);
              const label = new Date(`${k}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-xs text-white/60 w-16 flex-shrink-0">{label}</span>
                  <div className="flex-1 h-5 bg-white/10 rounded overflow-hidden">
                    <div className="h-full flex items-center px-2 text-[10px] font-semibold text-white whitespace-nowrap"
                      style={{ width: `${Math.round(((avg ?? 0) / maxMonth) * 100)}%`, background: '#534AB7' }}>
                      {taFmt(avg)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Design code lookup (mirrors Phase 1's analyticsCodeSearch) ──────────────
// Live search across every design/variety row in every order, tagged with its
// real current pipeline stage.

function DesignCodeLookup({ orders }: { orders: Order[] }) {
  const [query, setQuery] = useState('');
  const allRows = useMemo(() => computeAllStagesRows(orders), [orders]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const flat = CO_STAGE_DEFS.flatMap(s => allRows[s.k].map(r => ({ ...r, stageKey: s.k, stageDef: s })));
    return flat.filter(r => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [allRows, query]);

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Type a design code e.g. D-045…"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm mb-3 focus:outline-none focus:border-[#534AB7]" />
      {!query.trim() ? (
        <p className="text-xs text-white/30 text-center py-3">Start typing a design code above.</p>
      ) : hits.length === 0 ? (
        <p className="text-xs text-white/30 text-center py-3">No designs found matching "{query}".</p>
      ) : (
        <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
          {hits.map((h, i) => (
            <div key={i} className="flex items-center gap-2 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#a89fff] truncate">
                  {h.code || '—'} <span className="font-normal text-white/60">{h.name}{h.varName ? ` · ${h.varName}` : ''}</span>
                </p>
                <p className="text-[10px] text-white/30">{h.orderId} · {h.client}</p>
              </div>
              <span className="text-[10px] text-white/40 flex-shrink-0">{h.qty} pcs</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0" style={{ background: h.stageDef.bg, color: h.stageDef.tx }}>{h.stageDef.lbl}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Client leaderboard ───────────────────────────────────────────────────────

function ClientLeaderboard({ orders }: { orders: Order[] }) {
  const rows = useMemo(() => computeClientLeaderboard(orders), [orders]);
  const maxOrders = rows[0]?.orderCount ?? 1;

  if (!rows.length) return <p className="text-white/30 text-sm">No client data yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-white/40 border-b border-white/10">
            <th className="text-left py-2 pr-4 font-normal">Client</th>
            <th className="text-center px-3 font-normal">Orders</th>
            <th className="text-center px-3 font-normal">Pieces</th>
            <th className="text-center px-3 font-normal">Pending</th>
            <th className="text-center px-3 font-normal">Done</th>
            <th className="text-left pl-4 font-normal">Activity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r: ClientRow) => (
            <tr key={r.client} className="hover:bg-white/3 transition-colors">
              <td className="py-2.5 pr-4 text-white font-medium">{r.client}</td>
              <td className="text-center px-3 text-white/80">{r.orderCount}</td>
              <td className="text-center px-3 text-white/80">{r.totalPieces.toLocaleString()}</td>
              <td className="text-center px-3">
                {r.pending > 0 && <span className="text-red-400">{r.pending}</span>}
              </td>
              <td className="text-center px-3">
                {r.done > 0 && <span className="text-indigo-400">{r.done}</span>}
              </td>
              <td className="pl-4 w-28">
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#534AB7] rounded-full"
                    style={{ width: `${Math.round((r.orderCount / maxOrders) * 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Design popularity ────────────────────────────────────────────────────────

function DesignPopularity({ orders }: { orders: Order[] }) {
  const rows = useMemo(() => computeDesignPopularity(orders), [orders]);
  const maxTimes = rows[0]?.timesOrdered ?? 1;

  if (!rows.length) return <p className="text-white/30 text-sm">No design data yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-white/40 border-b border-white/10">
            <th className="text-left py-2 pr-4 font-normal">Design Code</th>
            <th className="text-left pr-4 font-normal">Name</th>
            <th className="text-center px-3 font-normal">Orders</th>
            <th className="text-center px-3 font-normal">Total Pcs</th>
            <th className="text-center px-3 font-normal">Avg / Order</th>
            <th className="text-center px-3 font-normal">Clients</th>
            <th className="pl-4 font-normal text-left">Popularity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r: DesignPopularityRow) => (
            <tr key={r.code} className="hover:bg-white/3 transition-colors">
              <td className="py-2.5 pr-4 font-mono text-[#a89fff] text-xs">{r.code}</td>
              <td className="pr-4 text-white/80 max-w-[150px] truncate">{r.name !== r.code ? r.name : '—'}</td>
              <td className="text-center px-3 text-white font-semibold">{r.timesOrdered}</td>
              <td className="text-center px-3 text-white/80">{r.totalPieces.toLocaleString()}</td>
              <td className="text-center px-3 text-white/60">{r.avgPieces}</td>
              <td className="text-center px-3 text-white/60">{r.clients.length}</td>
              <td className="pl-4 w-32">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#534AB7] rounded-full"
                      style={{ width: `${Math.round((r.timesOrdered / maxTimes) * 100)}%` }}
                    />
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Breakdown bars ───────────────────────────────────────────────────────────

function BreakdownBars({ items, emptyText }: { items: BreakdownItem[]; emptyText: string }) {
  if (!items.length) return <p className="text-white/30 text-sm">{emptyText}</p>;
  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-sm text-white/70 w-20 flex-shrink-0">{item.label}</span>
          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
          </div>
          <span className="text-xs text-white/50 w-16 text-right flex-shrink-0">
            {item.count} ({item.pct}%)
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { state } = useApp();
  const orders: Order[] = useMemo(() => state.data.orders ?? [], [state.data.orders]);

  const bangleBreakdown = useMemo(() => computeBangleTypeBreakdown(orders), [orders]);
  const priorityBreakdown = useMemo(() => computePriorityBreakdown(orders), [orders]);

  if (orders.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Analytics</h1>
        <p className="text-white/30">No orders yet. Create some orders first to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-white/40 mt-0.5">Live insights from your production data — includes archived orders</p>
      </div>

      {/* KPI row */}
      <KpiCards orders={orders} />

      {/* Turnaround Time — order creation to dispatch, by stage/vendor/client/code */}
      <TurnaroundSection orders={orders} />

      {/* Production Pipeline — real pipe/karigar/plating/packing/dispatched tracker */}
      <Card title="Production Pipeline" subtitle="Where every design/variety row actually is right now, across all orders">
        <ProductionPipeline orders={orders} />
      </Card>

      {/* All stages full view */}
      <Card title="All Stages — Full View" subtitle="Every design row organised by current stage">
        <AllStagesView orders={orders} />
      </Card>

      {/* Client leaderboard */}
      <Card title="Client Leaderboard">
        <ClientLeaderboard orders={orders} />
      </Card>

      {/* Design popularity */}
      <Card title="Design Popularity — Most Ordered Items" subtitle="Ranked by how many times each design code has been ordered across all clients">
        <DesignPopularity orders={orders} />
      </Card>

      {/* Breakdowns row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title="Bangle Type Breakdown">
          <BreakdownBars items={bangleBreakdown} emptyText="No orders yet." />
        </Card>
        <Card title="Priority Breakdown">
          <BreakdownBars items={priorityBreakdown} emptyText="No orders yet." />
        </Card>
      </div>

      {/* Design code lookup */}
      <Card title="Design Code Lookup" subtitle="Search any design code across all orders">
        <DesignCodeLookup orders={orders} />
      </Card>
    </div>
  );
}
