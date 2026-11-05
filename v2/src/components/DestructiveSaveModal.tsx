// Mirrors Phase 1's _confirmDestructiveSave exactly — shown when a save would
// drop a large chunk of orders (the guard added after the Aug 6 2026 incident).

interface Props {
  remote: { orders: number; vendorOrders: number };
  local: { orders: number; vendorOrders: number };
  onResolve: (ok: boolean) => void;
}

export default function DestructiveSaveModal({ remote, local, onResolve }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
      <div className="bg-white border border-red-500/30 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-black/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-red-500/15 text-red-700 flex items-center justify-center text-lg flex-shrink-0">⚠️</div>
          <h2 className="text-[#1a1916] font-semibold">This save would delete data</h2>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-sm text-[#1a1916]/80 leading-relaxed">
            The cloud currently has <strong className="text-[#1a1916]">{remote.orders} customer orders</strong> and{' '}
            <strong className="text-[#1a1916]">{remote.vendorOrders} vendor orders</strong>. What's about to be saved only has{' '}
            <strong className="text-[#1a1916]">{local.orders} customer orders</strong> and{' '}
            <strong className="text-[#1a1916]">{local.vendorOrders} vendor orders</strong>.
          </p>
          <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2.5 leading-relaxed">
            If you didn't intentionally delete orders (e.g. this followed an Undo, or the page just loaded), click Cancel —
            nothing will be lost — then reload the page.
          </p>
          <div className="flex gap-2 pt-1">
            <button onClick={() => onResolve(false)}
              className="flex-1 py-2 rounded-lg border border-black/10 text-[#1a1916]/80 hover:text-[#1a1916] hover:bg-black/5 text-sm transition-colors">
              Cancel — don't save this
            </button>
            <button onClick={() => onResolve(true)}
              className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors">
              Yes, I meant to remove this data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
