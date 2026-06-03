import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import type { Order } from '../types';
import {
  computeKpis,
  computeClientLeaderboard,
  computeActiveStages,
  computeDesignPopularity,
  computeBottlenecks,
  computeBangleTypeBreakdown,
  computePriorityBreakdown,
  type ClientRow,
  type ActiveStageRow,
  type DesignPopularityRow,
  type StageBottleneckRow,
  type BreakdownItem,
} from '../lib/analyticsUtils';

// ─── Shared sub-components ────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </div>
  );
}

const ALERT_BADGE: Record<string, string> = {
  ok:   'bg-green-500/15 text-green-400',
  warn: 'bg-yellow-500/15 text-yellow-400',
  late: 'bg-red-500/15 text-red-400',
  done: 'bg-indigo-500/15 text-indigo-400',
};
const ALERT_LABEL: Record<string, string> = { ok: 'On Track', warn: 'Due Soon', late: 'Late', done: 'Done' };

const GROUP_COLOR: Record<string, string> = {
  raw:      'bg-orange-500/20 text-orange-300',
  semi:     'bg-blue-500/20 text-blue-300',
  finished: 'bg-green-500/20 text-green-300',
};

// ─── KPI cards ────────────────────────────────────────────────────────────────

function KpiCards({ orders }: { orders: Order[] }) {
  const kpi = useMemo(() => computeKpis(orders), [orders]);
  const cards = [
    { label: 'Total Orders',      value: kpi.totalOrders,      sub: `${kpi.completedOrders} completed` },
    { label: 'Active Orders',     value: kpi.activeOrders,     sub: 'in progress' },
    { label: 'Total Designs',     value: kpi.totalDesigns,     sub: 'across all orders' },
    { label: 'Pieces Ordered',    value: kpi.totalPieces.toLocaleString(), sub: 'total quantity' },
    { label: 'On-Time Rate',      value: `${kpi.onTimeRate}%`, sub: 'of active orders on track' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
            <th className="text-center px-3 font-normal">On Track</th>
            <th className="text-center px-3 font-normal">Due Soon</th>
            <th className="text-center px-3 font-normal">Late</th>
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
                {r.onTrack > 0 && <span className="text-green-400">{r.onTrack}</span>}
              </td>
              <td className="text-center px-3">
                {r.soon > 0 && <span className="text-yellow-400">{r.soon}</span>}
              </td>
              <td className="text-center px-3">
                {r.late > 0 && <span className="text-red-400 font-semibold">{r.late}</span>}
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

// ─── Active stages — where each pending design is right now ──────────────────

function ActiveStagesTable({ orders }: { orders: Order[] }) {
  const [expandClient, setExpandClient] = useState<string | null>(null);
  const rows = useMemo(() => computeActiveStages(orders), [orders]);

  if (!rows.length) return <p className="text-white/30 text-sm">No active orders.</p>;

  // Group by client
  const grouped = useMemo(() => {
    const map = new Map<string, ActiveStageRow[]>();
    rows.forEach(r => {
      if (!map.has(r.client)) map.set(r.client, []);
      map.get(r.client)!.push(r);
    });
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="space-y-2">
      {grouped.map(([client, clientRows]) => {
        const isOpen = expandClient === client;
        const lateCount = clientRows.filter(r => r.alert === 'late').length;
        const warnCount = clientRows.filter(r => r.alert === 'warn').length;

        return (
          <div key={client} className="border border-white/10 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandClient(isOpen ? null : client)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/3 hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-white font-medium">{client}</span>
                <span className="text-xs text-white/40">{clientRows.length} design{clientRows.length !== 1 ? 's' : ''} active</span>
                {lateCount > 0 && <span className="text-xs text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">{lateCount} late</span>}
                {warnCount > 0 && <span className="text-xs text-yellow-400 bg-yellow-500/15 px-2 py-0.5 rounded-full">{warnCount} due soon</span>}
              </div>
              <span className={`text-white/30 text-xs transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {isOpen && (
              <div className="overflow-x-auto border-t border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-white/30 border-b border-white/5">
                      <th className="text-left px-4 py-2 font-normal">Order</th>
                      <th className="text-left px-3 py-2 font-normal">Design</th>
                      <th className="text-left px-3 py-2 font-normal">Current Stage</th>
                      <th className="text-left px-3 py-2 font-normal">Group</th>
                      <th className="text-center px-3 py-2 font-normal">Progress</th>
                      <th className="text-center px-3 py-2 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {clientRows.map((r, i) => (
                      <tr key={i} className="hover:bg-white/3">
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-[#a89fff]">{r.orderId}</span>
                          <span className="text-white/30 ml-2">{r.startDate}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-white">{r.designName}</span>
                          {r.designCode !== '—' && r.designCode !== r.designName && (
                            <span className="text-white/40 ml-1">({r.designCode})</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-white/80">{r.currentStageName}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${GROUP_COLOR[r.currentStageGroup] ?? 'text-white/40'}`}>
                            {r.currentStageGroup}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5 justify-center">
                            <div className="w-14 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-[#534AB7] rounded-full" style={{ width: `${r.pct}%` }} />
                            </div>
                            <span className="text-white/40 w-6 text-right">{r.pct}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ALERT_BADGE[r.alert] ?? ''}`}>
                            {ALERT_LABEL[r.alert] ?? r.alert}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
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

// ─── Stage bottlenecks ────────────────────────────────────────────────────────

function StageBottlenecks({ orders }: { orders: Order[] }) {
  const rows = useMemo(() => computeBottlenecks(orders), [orders]);
  const maxPending = Math.max(...rows.map(r => r.pendingCount), 1);

  const grouped: Record<string, StageBottleneckRow[]> = { raw: [], semi: [], finished: [] };
  rows.forEach(r => { grouped[r.group]?.push(r); });

  const groupLabels: Record<string, string> = { raw: 'Raw Material', semi: 'Semi-Finished', finished: 'Finished Goods' };

  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([group, groupRows]) => (
        <div key={group}>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
            group === 'raw' ? 'text-orange-400' : group === 'semi' ? 'text-blue-400' : 'text-green-400'
          }`}>{groupLabels[group]}</p>
          <div className="space-y-2">
            {groupRows.map(r => (
              <div key={r.stageId} className="flex items-center gap-3">
                <div className="w-44 flex-shrink-0">
                  <p className="text-xs text-white/70 truncate">{r.stageName}</p>
                </div>
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      r.pendingCount > 0
                        ? group === 'raw' ? 'bg-orange-500' : group === 'semi' ? 'bg-blue-500' : 'bg-green-500'
                        : 'bg-white/5'
                    }`}
                    style={{ width: `${Math.round((r.pendingCount / maxPending) * 100)}%` }}
                  />
                </div>
                <div className="w-24 flex-shrink-0 flex items-center gap-2">
                  {r.pendingCount > 0 ? (
                    <span className="text-xs font-semibold text-white">{r.pendingCount} waiting</span>
                  ) : (
                    <span className="text-xs text-white/20">clear</span>
                  )}
                </div>
                <div className="w-16 flex-shrink-0 text-right">
                  <span className="text-xs text-white/30">{r.doneCount}/{r.totalCount} done</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
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
        <p className="text-sm text-white/40 mt-0.5">Live insights from your production data</p>
      </div>

      {/* KPI row */}
      <KpiCards orders={orders} />

      {/* Active orders — where each design is right now */}
      <Card title="Active Orders — Current Stage per Design">
        <p className="text-xs text-white/40 mb-4">
          Click a client to expand. Shows exactly which production stage each active design is waiting at.
        </p>
        <ActiveStagesTable orders={orders} />
      </Card>

      {/* Client leaderboard */}
      <Card title="Client Leaderboard">
        <ClientLeaderboard orders={orders} />
      </Card>

      {/* Design popularity */}
      <Card title="Design Popularity — Most Ordered Items">
        <p className="text-xs text-white/40 mb-4">
          Ranked by how many times each design code has been ordered across all clients.
        </p>
        <DesignPopularity orders={orders} />
      </Card>

      {/* Stage bottlenecks */}
      <Card title="Stage Bottlenecks — Where Work is Waiting">
        <p className="text-xs text-white/40 mb-4">
          Each bar shows how many designs are currently waiting at that production stage. Longer bar = more work piled up.
        </p>
        <StageBottlenecks orders={orders} />
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
    </div>
  );
}
