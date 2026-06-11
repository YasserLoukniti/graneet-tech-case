/**
 * Démo locale : génère une facture réaliste (assez de lignes pour paginer)
 * et écrit le HTML + le XML CII dans `examples/out/`.
 *
 *   npm run demo
 *
 * Ouvrir ensuite `examples/out/facture.html` dans un navigateur :
 * Ctrl+P → « Enregistrer au format PDF » montre exactement ce que le worker
 * produira (même moteur de rendu), en-têtes de tableau répétés inclus.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderInvoiceHtml } from "../src/templates/invoice.tsx";
import { renderInvoiceCiiXml } from "../src/templates/invoice-cii.ts";
import type { Invoice, InvoiceLine } from "../src/types.ts";

const TRADES = [
  ["Pose de cloison placo", "m²", 4_550, 2000],
  ["Enduit + bandes", "m²", 1_280, 2000],
  ["Peinture 2 couches", "m²", 2_390, 1000],
  ["Dépose cloison existante", "m²", 1_850, 1000],
  ["Fourniture rail R48", "ml", 320, 2000],
  ["Heure de main d'œuvre", "h", 5_200, 550],
] as const;

const lines: InvoiceLine[] = Array.from({ length: 60 }, (_, i) => {
  const [label, unit, unitPriceCents, vatRateBps] = TRADES[i % TRADES.length];
  return {
    label: `${label} — zone ${Math.floor(i / TRADES.length) + 1}`,
    quantityThousandths: 1_000 + ((i * 333) % 14_000), // quantités variées, dont fractionnaires
    unit,
    unitPriceCents,
    vatRateBps,
  };
});

const invoice: Invoice = {
  number: "F-2026-0042",
  issueDate: "2026-06-01",
  dueDate: "2026-07-01",
  seller: {
    name: "Bâti Pro SARL",
    addressLines: ["1 rue des Artisans", "75011 Paris"],
    legalMentions: ["SIREN 123 456 789", "TVA FR12 123456789"],
  },
  buyer: {
    name: "Promoteur & Fils",
    addressLines: ["8 avenue du Chantier", "69003 Lyon"],
  },
  lines,
  footerNotes: [
    "Pénalités de retard : 3 fois le taux d'intérêt légal. Indemnité forfaitaire de recouvrement : 40 €.",
    "Escompte pour paiement anticipé : néant.",
  ],
};

const outDir = join(import.meta.dirname, "out");
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, "facture.html"), renderInvoiceHtml(invoice, { accentColor: "#b45309" }));
writeFileSync(join(outDir, "facture.xml"), renderInvoiceCiiXml(invoice));

console.log(`✔ ${lines.length} lignes rendues`);
console.log(`  HTML : ${join(outDir, "facture.html")}  (ouvrir dans un navigateur, Ctrl+P pour le PDF)`);
console.log(`  XML  : ${join(outDir, "facture.xml")}   (la moitié « machine » du Factur-X)`);
