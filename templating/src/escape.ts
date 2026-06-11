/**
 * Échappement XML (les 5 entités sensibles). Côté HTML, JSX échappe
 * nativement — ce module ne sert qu'au générateur CII.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeXml(raw: string): string {
  return raw.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}
