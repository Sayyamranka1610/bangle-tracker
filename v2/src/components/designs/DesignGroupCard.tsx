import { useState } from 'react';
import type { DesignEntry } from '../../lib/designUtils';
import type { DesignStage } from '../../types';
import { designTotalQty, designPct, STATUS_CONFIG, stageGroup, aggreagatedSizes, exportDesignCSV, printDesignGroup } from '../../lib/designUtils';
import SizeTable from './SizeTable';
import StagePanel from './StagePanel';

interface Props {
  code: string;
  entries: DesignEntry[];
  canEdit: boolean;
  onStageUpdate: (orderIndex: number, designIndex: number, stageIndex: number, patch: Partial<DesignStage>) => void;
}

export default function DesignGroupCard({ code, entries, canEdit, onStageUpdate }: Props) {
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const firstName = entries[0]?.design.name ?? '';
  const allImages = entries.flatMap(e => [
    ...(e.design.images ?? []),
    ...(e.design.varieties ?? []).flatMap(v => v.images ?? []),
  ]);
  const thumbnail = allImages[0]?.data;

  // Stage dot summary for a design (one dot per stage)
  function StageDots({ stages }: { stages: DesignStage[] }) {
    return (
      <div className="flex gap-0.5 flex-wrap">
        {stages.map((s, i) => {
          const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.pending;
          const gid = stageGroup(s.stageId);
          const groupColor = gid === 'raw' ? '' : gid === 'semi' ? 'ring-1 ring-white/10' : '';
          return (
            <span
              key={i}
              title={`${s.stageId}: ${cfg.label}`}
              className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ${groupColor}`}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      {/* Group header */}
      <div className="px-4 py-3 bg-white/3 border-b border-white/10 flex items-center gap-3">
        {thumbnail && (
          <img
            src={thumbnail}
            alt={code}
            className="w-10 h-10 rounded object-cover flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-semibold truncate">{code}</h3>
          {firstName && firstName !== code && (
            <p className="text-xs text-white/50 truncate">{firstName}</p>
          )}
        </div>
        <div className="text-xs text-white/40 flex-shrink-0">
          {entries.length} order{entries.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={() => exportDesignCSV(code, entries)}
          className="text-[10px] font-medium text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded px-2 py-1 flex-shrink-0 transition-colors"
        >
          📥 Export
        </button>
        <button
          onClick={() => printDesignGroup(code, entries)}
          className="text-[10px] font-medium text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded px-2 py-1 flex-shrink-0 transition-colors"
        >
          🖨️ Print
        </button>
      </div>

      {/* One entry per order */}
      <div className="divide-y divide-white/5">
        {entries.map(entry => {
          const { design, order, orderIndex, designIndex } = entry;
          const key = `${order.id}-${design.id}`;
          const isExpanded = expandedEntry === key;
          const pct = designPct(design);
          const qty = designTotalQty(design);
          const sizes = aggreagatedSizes(design);
          const hasSizes = Object.values(sizes).some(v => v > 0);

          return (
            <div key={key}>
              {/* Entry summary row */}
              <button
                onClick={() => setExpandedEntry(isExpanded ? null : key)}
                className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {/* Order ref */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-[#a89fff]">{order.orderId}</span>
                      <span className="text-xs text-white/50">{order.client}</span>
                      <span className="text-xs text-white/30">{order.startDate}</span>
                    </div>

                    {/* Size quantities inline */}
                    {hasSizes && (
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {Object.entries(sizes)
                          .filter(([, v]) => v > 0)
                          .map(([sz, v]) => (
                            <span key={sz} className="text-xs text-white/60">
                              <span className="text-white/30">{sz}:</span> {v}
                            </span>
                          ))}
                        <span className="text-xs font-medium text-white">{qty} pcs</span>
                      </div>
                    )}
                  </div>

                  {/* Stage dots + progress */}
                  <div className="flex-shrink-0 text-right space-y-1">
                    <StageDots stages={design.stages} />
                    <div className="flex items-center gap-1.5 justify-end">
                      <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            pct === 100 ? 'bg-green-500' : 'bg-[#534AB7]'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-white/40 w-7 text-right">{pct}%</span>
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <span className={`text-white/30 text-xs flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3">
                  {/* Images */}
                  {allImages.length > 0 && (
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                      {allImages.map((img, ii) => (
                        <img
                          key={ii}
                          src={img.data}
                          alt={img.name ?? `Image ${ii + 1}`}
                          className="h-20 w-20 object-cover rounded flex-shrink-0 border border-white/10"
                        />
                      ))}
                    </div>
                  )}

                  {/* Size table */}
                  {hasSizes && (
                    <div className="mb-3 bg-white/3 rounded-lg p-3">
                      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Quantities</p>
                      <SizeTable design={design} />
                    </div>
                  )}

                  {/* Stages */}
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Production stages</p>
                    <StagePanel
                      design={design}
                      order={order}
                      canEdit={canEdit}
                      onStageUpdate={(si, patch) => onStageUpdate(orderIndex, designIndex, si, patch)}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
