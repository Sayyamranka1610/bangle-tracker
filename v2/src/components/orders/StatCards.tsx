import type { OrderStats } from '../../lib/orderUtils';

interface Props {
  stats: OrderStats;
  activeFilter: string;
  onFilter: (f: string) => void;
}

const cards = [
  { key: 'all',  label: 'Total',    colorClass: 'border-white/10 hover:border-white/20' },
  { key: 'ok',   label: 'On Track', colorClass: 'border-green-500/30 hover:border-green-500/60' },
  { key: 'warn', label: 'Due Soon', colorClass: 'border-yellow-500/30 hover:border-yellow-500/60' },
  { key: 'late', label: 'Late',     colorClass: 'border-red-500/30 hover:border-red-500/60' },
  { key: 'done', label: 'Done',     colorClass: 'border-indigo-500/30 hover:border-indigo-500/60' },
];

const countKey: Record<string, keyof OrderStats | 'total'> = {
  all: 'total', ok: 'onTrack', warn: 'soon', late: 'late', done: 'done',
};

export default function StatCards({ stats, activeFilter, onFilter }: Props) {
  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {cards.map(card => {
        const count = stats[countKey[card.key] as keyof OrderStats];
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
