import * as React from "react"; // le loader tsx transpile en React.createElement (transform classique)
import type { Party as PartyData } from "../../types.ts";

export const partyCss = `
  .party { font-style: normal; margin-top: 8px; }`;

export function Party({ party }: { party: PartyData }) {
  return (
    <address className="party">
      <strong>{party.name}</strong>
      {party.addressLines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
      {(party.legalMentions ?? []).map((mention, i) => (
        <div key={i} className="muted">
          {mention}
        </div>
      ))}
    </address>
  );
}
