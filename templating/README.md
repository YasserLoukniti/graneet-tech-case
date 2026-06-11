# Brique de templating — données → HTML (et XML Factur-X) prêts pour le rendu

## Lancer en local

```bash
npm i
npm test          # node --test via tsx (12 tests)
npm run demo      # génère examples/out/facture.html (+ .xml) — ouvrir dans un navigateur, Ctrl+P = le PDF
npm run typecheck # tsc --noEmit
```

## Choix de design

**Composants React (TSX) rendus en statique** (`renderToStaticMarkup`),
plutôt qu'un moteur de templates (Handlebars, EJS) ou un DSL maison. React
est la techno du front : mêmes idiomes pour toute l'équipe, review naturelle,
typage de bout en bout (`Invoice` → impossible d'interpoler un champ qui
n'existe pas), échappement natif. Chaque section du document est un composant
dans son propre fichier (`Header`, `LinesTable`, `TotalsBlock`...), **avec
son CSS co-localisé** (chaque composant exporte sa chaîne de styles,
`styles.ts` assemble — de simples chaînes, pas de lib CSS-in-JS) : modifier
une section = toucher un seul fichier, markup et style ensemble. Et les composants sont **partageables avec le front**
pour la preview live de personnalisation (façon Obat) : le client règle sa
couleur, les mêmes composants se re-rendent instantanément dans l'app — la
pagination exacte restant vérifiable via un aperçu PDF serveur.
Le sacrifice : le JSX ne tourne pas dans Node nu — un runtime de
transformation (`tsx`) est nécessaire pour exécuter et tester, et le module
embarque deux dépendances (`react`, `react-dom`).

**Sécurité : échapper ce qui s'échappe, valider le reste.** JSX échappe
toute interpolation ; le seul point d'entrée de HTML brut est
`dangerouslySetInnerHTML` — explicite et greppable en review, réservé au CSS
statique. Mais l'échappement ne protège pas un contexte **CSS** : le thème
client (`accentColor`, `logoUrl`) est donc **validé** à l'entrée
(`validateTheme` : format `#hex` strict, logo limité à `https:`/`data:image/`
— pas de SSRF depuis le worker de rendu).

**Montants en entiers, dates en ISO.** Centimes, millièmes de quantité,
points de base de TVA : aucun flottant dans les calculs contractuels.
L'arrondi est **symétrique** (demi-centime à l'écart de zéro) pour qu'un
avoir annule exactement la facture qu'il crédite — isolé dans `totals.ts` et
testé. Les dates sont des chaînes `YYYY-MM-DD` : l'entrée du module est un
snapshot JSON (immutabilité, décision 3), et `Date` ne survit pas à
`JSON.parse`.

**Le XML CII partage les calculs du HTML.** `invoice-cii.ts` produit la
moitié « machine » d'un Factur-X (squelette EN 16931) en consommant le même
`computeTotals` que les composants : les deux représentations embarquées
dans le PDF/A-3 ne peuvent pas diverger — la norme vérifie la cohérence des
totaux. C'est la raison d'être de l'isolation des calculs hors du rendu.

**Versionnage.** `INVOICE_TEMPLATE = { id, version }` est enregistré en base
avec chaque document émis (immutabilité, décision 3) ; la version est bumpée
dans la même PR que tout changement visuel.

**Découpage.**

```
src/
  types.ts                  modèle d'entrée (Invoice, Theme) + validateTheme
  format.ts                 affichage fr-FR (Intl)
  totals.ts                 calculs (purs, testés isolément)
  escape.ts                 échappement XML (le HTML est couvert par JSX)
  templates/
    invoice.tsx             assemblage du document + INVOICE_TEMPLATE
    invoice-cii.ts          le XML CII (Factur-X) — mêmes totaux que le HTML
    invoice/                un composant par section, CSS co-localisé
      Header.tsx  Party.tsx  LinesTable.tsx  TotalsBlock.tsx  Footer.tsx
      styles.ts             base du document + assemblage des CSS de sections
test/
  invoice.test.ts
  invoice-cii.test.ts
examples/
  demo.ts                   facture réaliste de 60 lignes, HTML + XML
```

## Ce que je choisis de tester (et pourquoi)

1. **Arrondis** : quantité fractionnaire (1,333 × 0,75 €), TVA par taux
   agrégé vs ligne à ligne, et **avoir miroir** (le demi-centime : +13/-13,
   pas +13/-12) — c'est là que les bugs coûtent de l'argent.
2. **Cohérence HTML ↔ XML** : sur une facture multi-taux aux arrondis non
   triviaux, le XML CII porte exactement les totaux de `computeTotals` —
   la garantie qui rend le Factur-X viable.
3. **Échappement et validation** : injection dans un libellé (donnée
   utilisateur) neutralisée par JSX, CSS statique inséré *non* échappé
   (`dangerouslySetInnerHTML`), et rejet d'un thème malveillant (injection
   CSS via `accentColor`, SSRF via `logoUrl`).
4. **Cas limites** : facture à zéro ligne (le document doit rester valide).
5. **Bout en bout** : une `<tr>` par ligne, doctype présent, totaux dans le
   HTML final.
