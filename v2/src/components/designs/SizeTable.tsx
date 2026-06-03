import type { EmbeddedDesign, DesignVariety } from '../../types';
import { aggreagatedSizes, varietyTotalQty } from '../../lib/designUtils';

interface Props {
  design: EmbeddedDesign;
}

export default function SizeTable({ design }: Props) {
  const aggSizes = aggreagatedSizes(design);
  const sizeKeys = Object.keys(aggSizes).filter(k => aggSizes[k] > 0);

  if (!sizeKeys.length && !design.varieties?.length) return null;

  const hasVarieties = (design.varieties?.length ?? 0) > 1 ||
    (design.varieties?.length === 1 && design.varieties[0].name !== 'Default');

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full">
        <thead>
          <tr>
            {hasVarieties && <th className="text-left pr-3 py-1 text-white/40 font-normal">Variety</th>}
            {sizeKeys.map(sz => (
              <th key={sz} className="text-center px-2 py-1 text-white/40 font-normal">{sz}</th>
            ))}
            <th className="text-center px-2 py-1 text-white/40 font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {hasVarieties ? (
            design.varieties!.map((v: DesignVariety) => (
              <tr key={v.id} className="border-t border-white/5">
                <td className="pr-3 py-1 text-white/60 truncate max-w-[100px]">{v.name}</td>
                {sizeKeys.map(sz => (
                  <td key={sz} className="text-center px-2 py-1 text-white/80">
                    {Number(v.sizes?.[sz]) || 0}
                  </td>
                ))}
                <td className="text-center px-2 py-1 text-white font-medium">
                  {varietyTotalQty(v)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              {sizeKeys.map(sz => (
                <td key={sz} className="text-center px-2 py-1 text-white/80">
                  {aggSizes[sz] || 0}
                </td>
              ))}
              <td className="text-center px-2 py-1 text-white font-medium">
                {Object.values(aggSizes).reduce((a, v) => a + v, 0)}
              </td>
            </tr>
          )}
          {/* Totals row for multi-variety */}
          {hasVarieties && (
            <tr className="border-t border-white/10">
              <td className="pr-3 py-1 text-white/40 font-medium">Total</td>
              {sizeKeys.map(sz => (
                <td key={sz} className="text-center px-2 py-1 text-white font-medium">
                  {aggSizes[sz] || 0}
                </td>
              ))}
              <td className="text-center px-2 py-1 text-[#a89fff] font-bold">
                {Object.values(aggSizes).reduce((a, v) => a + v, 0)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
