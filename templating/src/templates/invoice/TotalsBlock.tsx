import * as React from "react"; // le loader tsx transpile en React.createElement (transform classique)
import { formatCents, formatVatRateBps } from "../../format.ts";
import type { InvoiceTotals } from "../../totals.ts";
import type { Theme } from "../../types.ts";

export function totalsBlockCss(theme: Theme): string {
  return `
  .totals { display: flex; justify-content: flex-end; margin-top: 16px;
            break-inside: avoid; }
  .totals td { padding: 4px 8px; text-align: right; }
  .grand-total td { font-weight: 700; border-top: 2px solid ${theme.accentColor}; }`;
}

export function TotalsBlock({ totals }: { totals: InvoiceTotals }) {
  return (
    <section className="totals">
      <table>
        <tbody>
          <tr>
            <td>Total HT</td>
            <td>{formatCents(totals.totalExclVatCents)}</td>
          </tr>
          {totals.vatBreakdown.map((entry) => (
            <tr key={entry.rateBps}>
              <td>
                TVA {formatVatRateBps(entry.rateBps)} (base{" "}
                {formatCents(entry.baseCents)})
              </td>
              <td>{formatCents(entry.vatCents)}</td>
            </tr>
          ))}
          <tr className="grand-total">
            <td>Total TTC</td>
            <td>{formatCents(totals.totalInclVatCents)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
