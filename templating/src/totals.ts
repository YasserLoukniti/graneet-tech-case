/**
 * Calculs de totaux, isolés du rendu pour être testés indépendamment.
 *
 * Convention d'arrondi : le montant HT de chaque ligne est arrondi au
 * centime (arrondi commercial, demi-centime vers le haut), puis la TVA est
 * calculée **par taux** sur la somme des bases HT — conforme à la pratique
 * de facturation française (la TVA ligne à ligne accumule les écarts
 * d'arrondi).
 */

import type { Invoice, InvoiceLine } from "./types.ts";

export interface VatBreakdownEntry {
  rateBps: number;
  baseCents: number;
  vatCents: number;
}

export interface InvoiceTotals {
  lineTotalsCents: number[];
  totalExclVatCents: number;
  vatBreakdown: VatBreakdownEntry[];
  totalVatCents: number;
  totalInclVatCents: number;
}

/**
 * Arrondi commercial **symétrique** : demi-centime à l'écart de zéro.
 * `Math.round` seul arrondit le demi vers +∞ (round(-12.5) = -12) : un avoir
 * (montants négatifs) ne serait alors pas le miroir exact de la facture
 * qu'il crédite. Ici : round(12.5) = 13 et round(-12.5) = -13.
 */
function roundedDiv(numerator: number, denominator: number): number {
  return Math.sign(numerator) * Math.round(Math.abs(numerator) / denominator);
}

export function lineTotalCents(line: InvoiceLine): number {
  // quantité (millièmes) × PU (centimes) → centi-millièmes, ramenés aux centimes.
  return roundedDiv(line.quantityThousandths * line.unitPriceCents, 1000);
}

export function computeTotals(invoice: Invoice): InvoiceTotals {
  const lineTotalsCents = invoice.lines.map(lineTotalCents);

  const basesByRate = new Map<number, number>();
  invoice.lines.forEach((line, i) => {
    const base = basesByRate.get(line.vatRateBps) ?? 0;
    basesByRate.set(line.vatRateBps, base + lineTotalsCents[i]);
  });

  const vatBreakdown: VatBreakdownEntry[] = [...basesByRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rateBps, baseCents]) => ({
      rateBps,
      baseCents,
      vatCents: roundedDiv(baseCents * rateBps, 10_000),
    }));

  const totalExclVatCents = lineTotalsCents.reduce((sum, c) => sum + c, 0);
  const totalVatCents = vatBreakdown.reduce((sum, e) => sum + e.vatCents, 0);

  return {
    lineTotalsCents,
    totalExclVatCents,
    vatBreakdown,
    totalVatCents,
    totalInclVatCents: totalExclVatCents + totalVatCents,
  };
}
