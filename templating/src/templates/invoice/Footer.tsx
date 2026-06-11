import * as React from "react"; // le loader tsx transpile en React.createElement (transform classique)
export const footerCss = `
  .footer { margin-top: 32px; font-size: 8pt; color: #6b7280; }`;

export function Footer({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <footer className="footer">
      {notes.map((note, i) => (
        <p key={i}>{note}</p>
      ))}
    </footer>
  );
}
