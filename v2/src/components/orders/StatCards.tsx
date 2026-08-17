import type { OrderStats } from '../../lib/orderUtils';

// Mirrors Phase 1's renderStats() exactly: Total / Pending / Completed / Archived.
// There is no deadline-based "on track / due soon / late" card at the order level.

interface Props {
  stats: OrderStats;
  activeFilter: string;
  onFilter: (f: string) => void;
}

const cards = [
  { key: 'all',      label: 'Total orders', colorClass: 'border-white/10 hover:border-white/20',       countKey: 'total' as const },
  { key: 'pending',  label: 'Pending',       colorClass: 'border-red-500/30 hover:border-red-500/60',   countKey: 'pending' as const },
  { key: 'done',     label: 'Completed',     colorClass: 'border-indigo-500/30 hover:border-indigo-500/60', countKey: 'done' as const },
  { key: 'archived', label: 'Archived',      colorClass: 'border-white/10 hover:border-white/20',       countKey: 'archived' as const },
];

export default function StatCards({ stats, activeFilter, onFilter }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {cards.map(card => {
        const count = stats[card.countKey];
        const isActive = activeFilter === card.key;
        return (
          <button
            key={card.key}
            onClick={() => onFilter(card.key)}
            className={`bg-white/5 border rounded-xl p-4 text-left transition-all cursor-pointer ${card.colorClass} ${
              isActive ? 'ring-2 ring-white/20 bg-white/10' : ''
            }`}
          >
            <p className="text-2xl font-bold text-white">{count}</p>
            <p className="text-xs text-white/50 mt-1">{card.label}</p>
          </button>
        );
      })}
    </div>
  );
}
