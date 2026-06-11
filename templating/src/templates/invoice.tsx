/**
 * Template « facture » : composants React rendus en HTML statique autonome,
 * prêt à être imprimé en PDF par Chromium.
 *
 * Chaque section vit dans son propre composant (`invoice/`) : relisible
 * isolément en review, et partageable tel quel avec le front React
 * (preview live de personnalisation, façon Obat).
 *
 * Notes pagination (documents de plusieurs pages) :
 *  - <thead> est répété par le moteur d'impression en haut de chaque page ;
 *  - `break-inside: avoid` empêche de couper une ligne ou le bloc de totaux.
 */

import * as React from "react"; // le loader tsx transpile en React.createElement (transform classique)
import { renderToStaticMarkup } from "react-dom/server";

import { computeTotals } from "../totals.ts";
import {
  DEFAULT_THEME,
  validateTheme,
  type Invoice,
  type Theme,
} from "../types.ts";
import { Footer } from "./invoice/Footer.tsx";
import { Header } from "./invoice/Header.tsx";
import { LinesTable } from "./invoice/LinesTable.tsx";
import { documentCss } from "./invoice/styles.ts";
import { TotalsBlock } from "./invoice/TotalsBlock.tsx";

/**
 * Identité du template, enregistrée en base avec chaque document émis
 * (immutabilité, décision 3) : `version` est bumpée dans la même PR que
 * tout changement visuel — un fix CSS compris.
 */
export const INVOICE_TEMPLATE = { id: "invoice", version: 1 } as const;

export function renderInvoiceHtml(
  invoice: Invoice,
  theme: Theme = DEFAULT_THEME,
): string {
  validateTheme(theme); // le thème vient de la base (saisie client) : format vérifié, pas échappé
  const totals = computeTotals(invoice);

  return (
    "<!DOCTYPE html>\n" + // renderToStaticMarkup n'émet pas le doctype
    renderToStaticMarkup(
      <html lang="fr">
        <head>
          <meta charSet="utf-8" />
          <title>{`Facture ${invoice.number}`}</title>
          {/* JSX échappe toute interpolation ; dangerouslySetInnerHTML est le
              seul point d'entrée de contenu brut — explicite et greppable en
              review, réservé au CSS statique (couleur validée en amont). */}
          <style dangerouslySetInnerHTML={{ __html: documentCss(theme) }} />
        </head>
        <body>
          <Header invoice={invoice} theme={theme} />
          <LinesTable
            lines={invoice.lines}
            lineTotalsCents={totals.lineTotalsCents}
          />
          <TotalsBlock totals={totals} />
          <Footer notes={invoice.footerNotes ?? []} />
        </body>
      </html>,
    )
  );
}
