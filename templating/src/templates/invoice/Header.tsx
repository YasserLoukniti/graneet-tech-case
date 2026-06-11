import * as React from "react"; // le loader tsx transpile en React.createElement (transform classique)
import { formatDate } from "../../format.ts";
import type { Invoice, Theme } from "../../types.ts";
import { Party } from "./Party.tsx";

export function headerCss(theme: Theme): string {
  return `
  .header { display: flex; justify-content: space-between; gap: 24px; }
  .header h1 { color: ${theme.accentColor}; font-size: 16pt; margin: 0 0 4px; }
  .logo { max-height: 48px; margin-bottom: 8px; }`;
}

export function Header({ invoice, theme }: { invoice: Invoice; theme: Theme }) {
  return (
    <header className="header">
      <div>
        {theme.logoUrl && <img className="logo" src={theme.logoUrl} alt="" />}
        <Party party={invoice.seller} />
      </div>
      <div className="header-right">
        <h1>Facture {invoice.number}</h1>
        <p>Émise le {formatDate(invoice.issueDate)}</p>
        <p>Échéance le {formatDate(invoice.dueDate)}</p>
        <Party party={invoice.buyer} />
      </div>
    </header>
  );
}
