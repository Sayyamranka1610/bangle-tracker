import type { AppData, Vocabulary, VendorOrderType } from '../types';

// ─── Masters (Clients / Vendors / Design names / Design codes / Units) ───────
// Ports Phase 1's masterAdd/masterDelete/masterRename exactly (bangle_v19.html
// ~L9383-9484). These lists auto-populate from real orders via rebuildVocab(),
// but can also be manually curated here — manual entries persist across
// rebuilds via `vocabularyManual`, matching Phase 1's design.

export type MasterListKey = 'clients' | 'vendors' | 'dnames' | 'dcodes' | 'units';

function readList(vocab: Vocabulary, key: MasterListKey): string[] {
  return vocab[key] ?? [];
}

export function addMasterEntry(data: AppData, key: MasterListKey, rawValue: string, vendorType?: VendorOrderType): Partial<AppData> {
  const value = rawValue.trim();
  if (!value) return {};

  if (key === 'units') {
    const units = [...(data.vocabulary?.units ?? [])];
    if (!units.includes(value)) units.push(value);
    return { vocabulary: { ...data.vocabulary, units } };
  }

  const manual: Vocabulary = { ...data.vocabularyManual };
  const list = [...(manual[key] ?? [])];
  if (!list.includes(value)) list.push(value);
  manual[key] = list;

  const patch: Partial<AppData> = { vocabularyManual: manual };

  if (key === 'vendors') {
    patch.vendorTypes = { ...data.vendorTypes, [value]: vendorType ?? 'karigar' };
  }

  return patch;
}

export function deleteMasterEntry(data: AppData, key: MasterListKey, value: string): Partial<AppData> {
  if (key === 'units') {
    const units = (data.vocabulary?.units ?? []).filter(u => u !== value);
    return { vocabulary: { ...data.vocabulary, units } };
  }

  const vocabList = readList(data.vocabulary ?? {}, key).filter(v => v !== value);
  const patch: Partial<AppData> = { vocabulary: { ...data.vocabulary, [key]: vocabList } };

  const manualList = (data.vocabularyManual?.[key] ?? []).filter(v => v !== value);
  patch.vocabularyManual = { ...data.vocabularyManual, [key]: manualList };

  if (key === 'vendors' && data.vendorTypes) {
    const vendorTypes = { ...data.vendorTypes };
    delete vendorTypes[value];
    patch.vendorTypes = vendorTypes;
  }

  return patch;
}

// Renames a master entry AND propagates the change through every place it's
// referenced — orders, vendor orders, vendorTypes. Mirrors masterRename()
// exactly, including which fields get updated per list.
export function renameMasterEntry(data: AppData, key: MasterListKey, oldVal: string, newVal: string): Partial<AppData> {
  if (!newVal.trim() || newVal === oldVal) return {};

  const patch: Partial<AppData> = {};

  // 1. Vocabulary + manual list
  if (key === 'units') {
    patch.vocabulary = { ...data.vocabulary, units: (data.vocabulary?.units ?? []).map(u => u === oldVal ? newVal : u) };
  } else {
    patch.vocabulary = { ...data.vocabulary, [key]: readList(data.vocabulary ?? {}, key).map(v => v === oldVal ? newVal : v) };
    patch.vocabularyManual = { ...data.vocabularyManual, [key]: (data.vocabularyManual?.[key] ?? []).map(v => v === oldVal ? newVal : v) };
  }

  // 2. Propagate through real data
  if (key === 'clients') {
    patch.orders = (data.orders ?? []).map(o => o.client === oldVal ? { ...o, client: newVal } : o);
  } else if (key === 'vendors') {
    if (data.vendorTypes?.[oldVal]) {
      const vendorTypes = { ...data.vendorTypes };
      vendorTypes[newVal] = vendorTypes[oldVal];
      delete vendorTypes[oldVal];
      patch.vendorTypes = vendorTypes;
    }
    patch.orders = (data.orders ?? []).map(o => ({
      ...o,
      designs: o.designs.map(d => ({
        ...d,
        assignedVendor: d.assignedVendor === oldVal ? newVal : d.assignedVendor,
        varieties: d.varieties?.map(v => v.assignedVendor === oldVal ? { ...v, assignedVendor: newVal } : v),
      })),
    }));
  } else if (key === 'dnames') {
    patch.orders = (data.orders ?? []).map(o => ({ ...o, designs: o.designs.map(d => d.name === oldVal ? { ...d, name: newVal } : d) }));
    patch.vendorOrders = (data.vendorOrders ?? []).map(vo => ({ ...vo, designs: vo.designs?.map(d => d.name === oldVal ? { ...d, name: newVal } : d) }));
  } else if (key === 'dcodes') {
    patch.orders = (data.orders ?? []).map(o => ({ ...o, designs: o.designs.map(d => d.code === oldVal ? { ...d, code: newVal } : d) }));
    patch.vendorOrders = (data.vendorOrders ?? []).map(vo => ({ ...vo, designs: vo.designs?.map(d => d.code === oldVal ? { ...d, code: newVal } : d) }));
  } else if (key === 'units') {
    const updDesigns = (designs: { unit?: string; varieties?: { unit?: string }[] }[]) =>
      designs.map(d => ({
        ...d,
        unit: d.unit === oldVal ? newVal : d.unit,
        varieties: d.varieties?.map(v => v.unit === oldVal ? { ...v, unit: newVal } : v),
      }));
    patch.orders = (data.orders ?? []).map(o => ({ ...o, designs: updDesigns(o.designs) as typeof o.designs }));
    patch.vendorOrders = (data.vendorOrders ?? []).map(vo => ({ ...vo, designs: vo.designs ? updDesigns(vo.designs) as typeof vo.designs : vo.designs }));
  }

  return patch;
}

// Moves a vendor's default segment AND every existing vendor order of theirs
// to the new type — mirrors setVendorTypeMaster() exactly.
export function setVendorTypeMaster(data: AppData, vendorName: string, type: VendorOrderType): Partial<AppData> {
  const vendorTypes = { ...data.vendorTypes, [vendorName]: type };
  const vendorOrders = (data.vendorOrders ?? []).map(vo =>
    vo.vendor === vendorName && (vo.type ?? 'karigar') !== type ? { ...vo, type } : vo,
  );
  return { vendorTypes, vendorOrders };
}

export function vendorTypeOf(data: AppData, vendorName: string): VendorOrderType {
  return data.vendorTypes?.[vendorName] ?? 'karigar';
}
