import * as React from "react"; // le loader tsx transpile en React.createElement (transform classique)
import {
  formatCents,
  formatQuantityThousandths,
  formatVatRateBps,
} from "../../format.ts";
import type { InvoiceLine, Theme } from "../../types.ts";

export function linesTableCss(theme: Theme): string {
  return `
  .lines { width: 100%; border-collapse: collapse; margin-top: 24px; }
  .lines th { text-align: right; border-bottom: 2px solid ${theme.accentColor};
              padding: 6px 8px; }
  .lines td { text-align: right; border-bottom: 1px solid #e5e7eb;
              padding: 6px 8px; }
  .lines .col-label { text-align: left; width: 45%; }
  .lines tr { break-inside: avoid; }`;
}

interface LinesTableProps {
  lines: InvoiceLine[];
  /** Totaux par ligne issus de `computeTotals` — jamais recalculés ici. */
  lineTotalsCents: number[];
}

export function LinesTable({ lines, lineTotalsCents }: LinesTableProps) {
  return (
    <table className="lines">
      <thead>
        <tr>
          <th className="col-label">Désignation</th>
          <th>Qté</th>
          <th>Unité</th>
          <th>PU HT</th>
          <th>TVA</th>
          <th>Total HT</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, i) => (
          <tr key={i}>
            <td className="col-label">{line.label}</td>
            <td>{formatQuantityThousandths(line.quantityThousandths)}</td>
            <td>{line.unit}</td>
            <td>{formatCents(line.unitPriceCents)}</td>
            <td>{formatVatRateBps(line.vatRateBps)}</td>
            <td>{formatCents(lineTotalsCents[i])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
