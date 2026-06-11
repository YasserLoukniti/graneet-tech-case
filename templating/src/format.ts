/**
 * Formatage pour l'affichage (fr-FR). Les calculs restent en entiers,
 * seul l'affichage convertit en décimal.
 */

const euros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const quantity = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const percent = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// timeZone UTC : une date ISO "2026-06-01" est minuit UTC — sans ça, le
// formatage pourrait afficher la veille selon le fuseau de la machine.
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });

export function formatCents(cents: number): string {
  return euros.format(cents / 100);
}

export function formatQuantityThousandths(thousandths: number): string {
  return quantity.format(thousandths / 1000);
}

export function formatVatRateBps(bps: number): string {
  return `${percent.format(bps / 100)} %`;
}

/** @param isoDate date ISO `YYYY-MM-DD` (le modèle vient d'un snapshot JSON). */
export function formatDate(isoDate: string): string {
  return date.format(new Date(isoDate));
}
