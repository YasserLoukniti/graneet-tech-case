/**
 * Données d'entrée du templating.
 *
 * Tous les montants sont en **centimes** (entiers) : on ne manipule jamais
 * de flottants pour des montants contractuels.
 *
 * Les dates sont des chaînes ISO (`YYYY-MM-DD`) : l'entrée du module est un
 * snapshot JSON (cf. décision 3 de l'architecture), et `Date` ne survit pas
 * à un aller-retour `JSON.parse`/`stringify`.
 */

export interface Party {
  name: string;
  addressLines: string[];
  /** SIREN, TVA intracommunautaire... affichés tels quels. */
  legalMentions?: string[];
}

export interface InvoiceLine {
  label: string;
  /** Quantité en millièmes (ex. 1500 = 1,5) pour éviter les flottants. */
  quantityThousandths: number;
  unit: string;
  /** Prix unitaire HT en centimes. */
  unitPriceCents: number;
  /** Taux de TVA en points de base (ex. 2000 = 20 %). */
  vatRateBps: number;
}

export interface Invoice {
  number: string;
  /** Date d'émission, ISO `YYYY-MM-DD`. */
  issueDate: string;
  /** Date d'échéance, ISO `YYYY-MM-DD`. */
  dueDate: string;
  seller: Party;
  buyer: Party;
  lines: InvoiceLine[];
  /** Mentions de pied de page (pénalités de retard, etc.). */
  footerNotes?: string[];
}

/** Personnalisation client (l'équivalent du "thème" Obat). */
export interface Theme {
  accentColor: string;
  logoUrl?: string;
}

export const DEFAULT_THEME: Theme = {
  accentColor: "#1a56db",
};

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;
const SAFE_LOGO_URL = /^(https:\/\/|data:image\/)/;

/**
 * Valide un thème (donnée saisie par un client, stockée en base).
 *
 * L'échappement HTML ne protège pas un contexte CSS : un `accentColor` comme
 * `red;} body{display:none` ne contient aucun caractère échappable. On ne
 * peut pas « échapper » une couleur — on valide son format à l'entrée.
 * Même logique pour le logo : seuls `https:` et `data:image/` sont admis
 * (pas de `http:` interne ni de schéma exotique → pas de SSRF au rendu).
 */
export function validateTheme(theme: Theme): Theme {
  if (!HEX_COLOR.test(theme.accentColor)) {
    throw new Error(
      `Theme.accentColor invalide : "${theme.accentColor}" (attendu : #rgb à #rrggbbaa)`,
    );
  }
  if (theme.logoUrl !== undefined && !SAFE_LOGO_URL.test(theme.logoUrl)) {
    throw new Error(
      "Theme.logoUrl invalide : seuls https:// et data:image/ sont acceptés",
    );
  }
  return theme;
}
