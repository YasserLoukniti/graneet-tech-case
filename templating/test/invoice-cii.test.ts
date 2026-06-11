import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeTotals } from "../src/totals.ts";
import { renderInvoiceHtml } from "../src/templates/invoice.tsx";
import { renderInvoiceCiiXml, xmlAmount } from "../src/templates/invoice-cii.ts";
import { formatCents } from "../src/format.ts";
import type { Invoice, InvoiceLine } from "../src/types.ts";

function line(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    label: "Pose de cloison",
    quantityThousandths: 1000,
    unit: "m²",
    unitPriceCents: 10_000,
    vatRateBps: 2000,
    ...overrides,
  };
}

function invoice(lines: InvoiceLine[]): Invoice {
  return {
    number: "F-2026-0042",
    issueDate: "2026-06-01",
    dueDate: "2026-07-01",
    seller: { name: "Bâti Pro SARL", addressLines: ["1 rue des Artisans", "75011 Paris"] },
    buyer: { name: "Client & Fils", addressLines: ["8 avenue du Chantier", "69003 Lyon"] },
    lines,
  };
}

describe("renderInvoiceCiiXml", () => {
  it("porte exactement les mêmes totaux que le HTML — la garantie Factur-X", () => {
    // Multi-taux avec arrondis non triviaux : le test qui compte. Si le XML
    // recalculait de son côté, c'est ici que la divergence apparaîtrait.
    const inv = invoice([
      line({ quantityThousandths: 1_333, unitPriceCents: 75 }), // 0,99975 € → arrondi
      line({ quantityThousandths: 12_000, unitPriceCents: 4_550 }),
      line({ unitPriceCents: 20_000, vatRateBps: 1000 }),
    ]);
    const totals = computeTotals(inv);
    const xml = renderInvoiceCiiXml(inv);
    const html = renderInvoiceHtml(inv);

    // Le XML porte les totaux de computeTotals (la source unique)...
    assert.ok(xml.includes(`<ram:GrandTotalAmount>${xmlAmount(totals.totalInclVatCents)}</ram:GrandTotalAmount>`));
    assert.ok(xml.includes(`<ram:TaxTotalAmount currencyID="EUR">${xmlAmount(totals.totalVatCents)}</ram:TaxTotalAmount>`));
    for (const entry of totals.vatBreakdown) {
      assert.ok(xml.includes(`<ram:BasisAmount>${xmlAmount(entry.baseCents)}</ram:BasisAmount>`));
    }
    // ... et le HTML porte les mêmes montants, en format d'affichage fr-FR.
    assert.ok(html.includes(formatCents(totals.totalInclVatCents)));
  });

  it("échappe les données utilisateur dans le XML", () => {
    const xml = renderInvoiceCiiXml(invoice([line({ label: "Plâtre <spécial> & Cie" })]));
    assert.ok(xml.includes("Plâtre &lt;spécial&gt; &amp; Cie"));
    assert.ok(!xml.includes("<spécial>"));
  });

  it("formate montants et dates sans flottant (centimes → décimal, ISO → 102)", () => {
    assert.equal(xmlAmount(87_520), "875.20");
    assert.equal(xmlAmount(5), "0.05");
    assert.equal(xmlAmount(-1_300), "-13.00"); // avoir
    const xml = renderInvoiceCiiXml(invoice([]));
    assert.ok(xml.includes('format="102">20260601<'));
  });
});
