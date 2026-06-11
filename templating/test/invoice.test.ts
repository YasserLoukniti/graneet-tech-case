import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeTotals, lineTotalCents } from "../src/totals.ts";
import { renderInvoiceHtml } from "../src/templates/invoice.tsx";
import type { Invoice, InvoiceLine } from "../src/types.ts";

/* -------------------------------- Helpers ------------------------------- */

function line(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    label: "Pose de cloison",
    quantityThousandths: 1000, // 1
    unit: "m²",
    unitPriceCents: 10_000, // 100,00 €
    vatRateBps: 2000, // 20 %
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

/* --------------------------------- Totaux ------------------------------- */

describe("computeTotals", () => {
  it("calcule HT, TVA et TTC sur une facture multi-lignes et multi-taux", () => {
    const totals = computeTotals(
      invoice([
        line({ quantityThousandths: 12_000, unitPriceCents: 4_550 }), // 12 × 45,50 = 546,00 HT, TVA 20 %
        line({ unitPriceCents: 20_000, vatRateBps: 1000 }), // 200,00 HT, TVA 10 %
      ]),
    );

    assert.equal(totals.totalExclVatCents, 74_600);
    assert.deepEqual(
      totals.vatBreakdown.map((e) => [e.rateBps, e.baseCents, e.vatCents]),
      [
        [1000, 20_000, 2_000],
        [2000, 54_600, 10_920],
      ],
    );
    assert.equal(totals.totalInclVatCents, 87_520);
  });

  it("arrondit chaque ligne au centime (quantité fractionnaire)", () => {
    // 1,333 × 0,75 € = 0,99975 € → 1,00 € (100 centimes)
    const cents = lineTotalCents(
      line({ quantityThousandths: 1_333, unitPriceCents: 75 }),
    );
    assert.equal(cents, 100);
  });

  it("calcule la TVA par taux sur la base agrégée, pas ligne à ligne", () => {
    // 3 lignes de 0,33 € HT à 20 % :
    //  - par ligne : 3 × round(6,6) = 3 × 7 = 21 centimes de TVA
    //  - par base  : round(99 × 0,20) = 20 centimes ← attendu
    const totals = computeTotals(
      invoice([
        line({ unitPriceCents: 33 }),
        line({ unitPriceCents: 33 }),
        line({ unitPriceCents: 33 }),
      ]),
    );
    assert.equal(totals.vatBreakdown[0].vatCents, 20);
  });

  it("gère une facture sans ligne (avoir vide / brouillon)", () => {
    const totals = computeTotals(invoice([]));
    assert.equal(totals.totalInclVatCents, 0);
    assert.deepEqual(totals.vatBreakdown, []);
  });

  it("un avoir miroir annule exactement la facture (arrondi symétrique)", () => {
    // 0,5 × 0,25 € = 12,5 centimes : le cas du demi-centime, là où
    // Math.round seul donnerait +13 / -12 et un écart d'un centime.
    const sale = line({ quantityThousandths: 500, unitPriceCents: 25 });
    const credit = { ...sale, quantityThousandths: -500 };

    assert.equal(lineTotalCents(sale), 13);
    assert.equal(lineTotalCents(credit), -13);

    const facture = computeTotals(invoice([sale]));
    const avoir = computeTotals(invoice([credit]));
    assert.equal(facture.totalInclVatCents + avoir.totalInclVatCents, 0);
  });
});

/* ---------------------------- Rendu de bout en bout --------------------- */

describe("renderInvoiceHtml", () => {
  it("rend une ligne par item, libellés échappés par JSX, totaux affichés", () => {
    const doc = renderInvoiceHtml(
      invoice([
        line({ label: "Plâtre & enduit <spécial>" }),
        line({ unitPriceCents: 20_000, vatRateBps: 1000 }),
      ]),
    );

    assert.match(doc, /Plâtre &amp; enduit &lt;spécial&gt;/);
    const bodyRows = doc.match(/<tbody>([\s\S]*?)<\/tbody>/)![1];
    assert.equal(bodyRows.match(/<tr>/g)?.length, 2); // une <tr> par ligne de facture
    assert.match(doc, /Total TTC/);
    assert.doesNotMatch(doc, /<script>/);
  });

  it("contient toutes les mentions obligatoires d'une facture", () => {
    const doc = renderInvoiceHtml(
      invoice([line({ label: "Pose de cloison" })]),
    );

    const required = [
      "F-2026-0042",        // numéro de facture
      "Émise le",           // date d'émission
      "Échéance le",        // date d'échéance
      "Bâti Pro SARL",      // vendeur
      "Client &amp; Fils",  // acheteur (échappé)
      "Pose de cloison",    // désignation
      "TVA",                // détail TVA
      "Total HT",
      "Total TTC",
    ];

    for (const mention of required) {
      assert.match(doc, new RegExp(mention), `mention manquante : ${mention}`);
    }
  });

  it("rend un document valide avec zéro ligne", () => {
    const doc = renderInvoiceHtml(invoice([]));
    assert.match(doc, /<tbody>\s*<\/tbody>/);
    assert.match(doc, /Total TTC/);
    assert.match(doc, /^<!DOCTYPE html>/);
  });

  it("insère le CSS statique sans échappement (dangerouslySetInnerHTML)", () => {
    const doc = renderInvoiceHtml(invoice([]));
    // Le CSS doit rester brut (sélecteurs intacts), avec la couleur validée.
    assert.match(doc, /break-inside: avoid/);
    assert.match(doc, /#1a56db/);
  });

  it("rejette un thème malveillant (l'échappement ne protège pas le CSS)", () => {
    assert.throws(
      () => renderInvoiceHtml(invoice([]), { accentColor: "red;} body{display:none" }),
      /accentColor invalide/,
    );
    assert.throws(
      () => renderInvoiceHtml(invoice([]), {
        accentColor: "#1a56db",
        logoUrl: "http://169.254.169.254/latest/meta-data/", // SSRF vers les credentials AWS
      }),
      /logoUrl invalide/,
    );
  });
});
