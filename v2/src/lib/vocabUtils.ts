import type { Order, Vocabulary } from '../types';

// Mirrors Phase 1 rebuildVocab() — re-derives vocabulary from all orders,
// merges with manual entries. Pure — the caller merges the result into a
// single saveAppData() call alongside the orders it was derived from.
export function rebuildVocab(orders: Order[], manual: Vocabulary): Vocabulary {
  const clients  = new Set<string>(manual.clients ?? []);
  const dnames   = new Set<string>(manual.dnames  ?? []);
  const dcodes   = new Set<string>(manual.dcodes  ?? []);
  const vendors  = new Set<string>(manual.vendors ?? []);

  orders.forEach(o => {
    if (o.client) clients.add(o.client);
    (o.designs ?? []).forEach(d => {
      if (d.name) dnames.add(d.name);
      if (d.code) dcodes.add(d.code);
      (d.stages ?? []).forEach(s => {
        if (s.vendor) vendors.add(s.vendor);
      });
    });
  });

  return {
    clients:  [...clients].sort(),
    dnames:   [...dnames].sort(),
    dcodes:   [...dcodes].sort(),
    vendors:  [...vendors].sort(),
    units:    manual.units ?? ['pcs', 'pairs', 'jotta'],
  };
}
