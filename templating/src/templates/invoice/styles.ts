import type { Theme } from "../../types.ts";
import { footerCss } from "./Footer.tsx";
import { headerCss } from "./Header.tsx";
import { linesTableCss } from "./LinesTable.tsx";
import { partyCss } from "./Party.tsx";
import { totalsBlockCss } from "./TotalsBlock.tsx";

/** Base du document : page A4, typographie, utilitaires partagés. */
const baseCss = `
  @page { size: A4; margin: 18mm 14mm; }
  body { font: 10pt/1.45 system-ui, sans-serif; color: #1f2937; }
  .muted { color: #6b7280; }`;

/**
 * Feuille de styles du document : la base + le CSS co-localisé de chaque
 * composant (chacun exporte le sien, à côté de son markup — pas de lib
 * CSS-in-JS, de simples chaînes assemblées ici).
 *
 * Seule valeur dynamique : la couleur du thème client — interpolée dans un
 * contexte CSS où l'échappement HTML ne protège pas ; la sécurité vient de
 * `validateTheme` (format #hex strict), appelé avant tout rendu.
 */
export function documentCss(theme: Theme): string {
  return [
    baseCss,
    headerCss(theme),
    partyCss,
    linesTableCss(theme),
    totalsBlockCss(theme),
    footerCss,
  ].join("\n");
}
