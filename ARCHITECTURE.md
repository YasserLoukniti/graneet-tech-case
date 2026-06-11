# Générateur de PDFs — Cadrage & Architecture

*Tech case Full-Stack — Graneet — Yasser*

---

## 1. Cadrage : questions avant la moindre ligne de code

### À l'équipe produit / PO (et au juridique pour le réglementaire)
- **Quelle latence est acceptable ?** Une facture de 2 pages doit-elle apparaître « instantanément » (< 3 s) ou un mode « document en cours de génération » est-il acceptable ? La réponse change l'architecture (sync vs async) et l'UX du front.
- **Qui personnalise les templates ?** Trois profils possibles, et la réponse est structurante : uniquement les devs → templates = code versionné Git, relu en PR ; des internes non-devs (CS, ops, designer) → il faut une UI d'administration et le pari « template = code » tombe en partie ; les clients eux-mêmes (comme Obat : logo, couleurs) → séparer *template structurel* (code) et *thème client* (données en base).
- **Combien de temps garde-t-on les documents ?** 10 ans pour une facture (obligation légale), mais quid des devis non signés, des brouillons ? La rétention dimensionne le stockage et son cycle de vie.

### À l'équipe tech / infra
- **Pourquoi remplace-t-on le générateur existant ?** Quels pain points : performance, coûts, taux d'échec (sur quels documents — les très gros ?), DX ? Reconstruire sans cette réponse, c'est risquer de reproduire les mêmes défauts.
- **Quel est le pic réel ?** Distribution fin de mois, et taille des documents (p50/p99 en pages) ? Le dimensionnement des workers et le routage fast/heavy en dépendent.
- **Qui opère ?** Profil ops dédié, astreinte, monitoring existant, ECS déjà en place ? Équipe petite qui opère elle-même → managé AWS (SQS, S3, ECS) plutôt qu'un broker auto-hébergé (RabbitMQ, Redis/BullMQ).

### Recherches avant de toucher au code (résumé — détail en **annexe A**)

La réforme de la facturation électronique (réception obligatoire 09/2026, émission PME 09/2027) impose à terme le **Factur-X** (PDF/A-3 + XML CII) et le transit des factures B2B par une Plateforme Agréée — le générateur reste central (devis, B2C, partie lisible du Factur-X) et le pipeline doit prévoir une étape de post-traitement. S'y ajoutent les règles de facturation françaises (mentions, numérotation, TVA par taux) et les spécificités BTP (situations de travaux, retenue de garantie, autoliquidation) qui dictent le modèle d'entrée.

---

## 2. Architecture macro

```
                                ┌──────────────────────────────────────────┐
                                │                  AWS                     │
┌─────────┐   POST /documents   │  ┌─────────┐    ┌─────┐    ┌──────────┐  │
│  Front  │────────────────────►│  │ API     │───►│ SQS │───►│ Workers  │  │
│  React  │   202 + documentId  │  │ NestJS  │    │     │    │ NestJS + │  │
└────┬────┘                     │  └────┬────┘    └──┬──┘    │ Chromium │  │
     │                          │       │            │       │ (ECS     │  │
     │  polling                 │       ▼            ▼       │ Fargate) │  │
     │  statut du document      │  ┌─────────┐    ┌─────┐    └────┬─────┘  │
     └─────────────────────────►│  │ Postgres│    │ DLQ │         │        │
                                │  │ (statut,│    └─────┘         ▼        │
     téléchargement (URL signée)│  │snapshot)│               ┌─────────┐   │
     ◄──────────────────────────│  └─────────┘               │   S3    │   │
                                │                            │ (PDFs)  │   │
                                └────────────────────────────└─────────┘───┘
```

**Flux** : l'API valide, **snapshote les données + la version du template** en base (statut `PENDING`), pousse `{ documentId }` dans SQS et répond `202`. Les workers consomment : templating (données → HTML), rendu Chromium, upload S3, statut `DONE`. Le front suit le statut par **polling** et télécharge via URL S3 signée. API et workers = **le même monolithe modulaire NestJS, deux points d'entrée** (l'image worker embarque Chromium en plus).

**Échecs en cours de route** : SQS livre *at-least-once* → workers **idempotents** (claim atomique en base **avec bail** — un `PROCESSING` expiré est re-réclamable, pas de lock orphelin —, clé S3 déterministe), **heartbeat** pendant les rendus longs, et après 3 échecs : DLQ + alerte + statut `FAILED` (cycle `PENDING → PROCESSING → DONE | FAILED`). Pour un document ordinaire, l'échec se traite par re-rendu complet (idempotent, et ~0,5 centime pour 300 pages) ; pour les **très gros documents**, le rendu est **découpé en lots** (chunks rendus séparément puis fusionnés) : le travail perdu en cas d'échec est borné à un lot, pas au document. Mécanique détaillée en **annexe B**.

**Charge & équité** : deux files **fast / heavy** (routage sur le nombre de lignes du snapshot) avec deux pools de workers autoscalés indépendamment sur leur backlog — un devis de 300 pages ne bloque jamais les factures de 2 pages ; équité entre tenants par SQS Fair Queues ou plafond de jobs par client. Dimensionnement et coûts chiffrés en **annexe C** — ordre de grandeur : **~100-120 $/mois**, pics de fin de mois compris.

---

## 3. Décisions structurantes

### Décision 1 — Génération asynchrone via queue (SQS + workers), pas dans l'API

**Options considérées**
1. Génération synchrone dans le process API (simple, latence minimale).
2. **Queue SQS + workers dédiés (ECS Fargate)** ✅
3. BullMQ sur Redis (la solution idiomatique NestJS : `@nestjs/bullmq`, priorités natives).
4. Lambda par document (scale-to-zero, zéro gestion de serveurs).

*(RabbitMQ / Amazon MQ écarté d'office : moins managé que SQS, moins idiomatique NestJS que BullMQ — dominé sur les deux axes.)*

**Choix : SQS + workers ECS.** La contrainte clé est l'isolation : un document de 300 pages qui consomme 2 Go de RAM dans Chromium ne doit jamais dégrader l'API. La queue absorbe les pics de fin de mois (on scale les workers sur sa profondeur) et donne retries + DLQ natifs. **BullMQ** était le vrai challenger : meilleure DX NestJS, priorités natives (qui auraient réglé fast/heavy) — mais un Redis à dimensionner et opérer, et une durabilité à configurer sérieusement pour des documents contractuels, là où SQS n'a aucune infra et une durabilité maximale par défaut. **Lambda** : timeout 15 min rédhibitoire sur les très gros documents, Chromium en Lambda = gymnastique fragile et cold starts en rafale pendant les pics. La queue est derrière une interface `DocumentQueue` : changer d'avis coûte un adaptateur, pas une réécriture.

**Ce que je sacrifie** : la latence perçue (même un petit PDF passe par la queue → UX de statut), de la simplicité opérationnelle (backlog, autoscaling, DLQ à monitorer), et les priorités natives de BullMQ — compensées par les deux files fast/heavy.

### Décision 2 — Rendu HTML → PDF avec Chromium headless (Playwright), auto-opéré

**Options considérées**
1. **Chromium headless via Playwright** ✅
2. `@react-pdf/renderer` — composants React → PDF, sans navigateur.
3. Lib PDF programmatique (PDFKit, pdfmake) — pas de moteur HTML.
4. Service tiers (DocRaptor, PDFMonkey) ou moteur payant (Prince XML).

**Choix : Chromium.** La contrainte « génération à partir d'HTML pour une personnalisation totale » élimine PDFKit (réécrire un moteur de layout = code spaghetti) et écarte `@react-pdf/renderer`, pourtant aligné avec notre stack : il ne rend pas du HTML/CSS mais un sous-ensemble propriétaire (primitives `View`/`Text`, flexbox Yoga), et ses performances sur les documents de centaines de pages sont son point faible documenté — exactement notre cas critique. Un service tiers contredit « l'équipe opère elle-même », coûte par document, et fait sortir des données contractuelles. Chromium donne le CSS complet, s'exécute en local à l'identique (Docker), et l'équipe maîtrise l'écosystème. Son poids est neutralisé par l'architecture : workers dédiés, concurrence 1-2, navigateur gardé chaud entre les rendus, build allégé `chrome-headless-shell`.

**Ce que je sacrifie** : de la RAM/CPU par rendu (dimensionnement à surveiller), et le CSS Paged Media *riche* (marges nommées, contenu courant) inférieur à Prince XML — l'essentiel étant couvert : `<thead>` répété, `break-inside`, numéros de page « X / Y » natifs via le `footerTemplate` de Playwright.

### Décision 3 — Immutabilité : snapshot des données + templates versionnés, PDF archivé sur S3

**Options considérées**
1. Régénérer à la demande depuis les données vivantes (pas de stockage).
2. Stocker uniquement le PDF binaire.
3. **PDF sur S3 (Object Lock) + snapshot JSON des données + référence `templateId@version`** ✅

**Choix : la triple trace.** Un document émis a valeur contractuelle : régénérer depuis des données vivantes est exclu (données et mise en forme évoluent). Le binaire seul suffit légalement, mais on perd l'explicabilité (auditer un total), la source du XML Factur-X, et toute possibilité de re-rendu en cas de litige. Le PDF est la pièce légale (Object Lock mode compliance : ni humain ni bug ne peut l'altérer) ; le snapshot fige les *entrées* du rendu indépendamment des évolutions du schéma applicatif ; les templates vivent dans le repo (TSX relu en PR, testé), chaque document enregistrant la version *réellement utilisée* au rendu.

**Ce que je sacrifie** : du stockage, une complexité de migration (garder les vieilles versions de templates exécutables — via images Docker archivées — ou accepter que seule la trace JSON + PDF reste), et une discipline d'équipe : tout changement de template bump la version, même un fix CSS.

---

## 4. Brique de templating (cf. `templating/`)

**Composants React (TSX) rendus en statique** (`renderToStaticMarkup`) — la techno de template est celle du front, composants partageables avec l'app pour la preview live de personnalisation (façon Obat). Un composant par section, CSS co-localisé, échappement natif JSX, thème client **validé** à l'entrée (l'échappement ne protège pas un contexte CSS), calculs isolés et testés (`totals.ts`, arrondi symétrique) — le même `computeTotals` alimente le XML CII du Factur-X. Chaque template porte `{ id, version }` (décision 3). Exécutable en local : `npm test`, `npm run demo`. Détail dans `templating/README.md`.

---
---

# Annexes

## Annexe A — Réglementaire & métier

- **Facturation électronique (réforme 2026-2027)** : réception obligatoire pour toutes les entreprises au 01/09/2026, émission étendue aux PME/TPE au 01/09/2027 — donc à quasi tous les clients de Graneet. Le flux actuel « l'utilisateur télécharge son PDF et l'envoie lui-même » devient non conforme pour les factures B2B domestiques : elles devront transiter par une **Plateforme Agréée** (PA, ex-PDP) — un éditeur SaaS se positionne en **Opérateur de Dématérialisation** branché sur une PA, pas en PA lui-même. Le générateur reste central : devis et factures B2C ne sont pas concernés (téléchargement classique), et en B2B le PDF devient la partie lisible du Factur-X.
- **Factur-X** : PDF/A-3 (archivable, autonome : polices embarquées, profil ICC, métadonnées XMP) avec XML CII (norme EN 16931) embarqué en pièce jointe (`AFRelationship=Alternative`). Un PDF sorti de Chromium n'est pas PDF/A-3 → **étape de post-traitement dans le worker**, conditionnelle (factures B2B seulement). Outils éprouvés : Gotenberg (MIT, rendu + conversion + embed en un service Docker), mustangproject (Apache, la référence) ; éviter Ghostscript (AGPL). Validation : veraPDF (PDF/A) + Schematron EN 16931 en CI sur des factures « golden ». Contrainte de cohérence : le XML doit porter **exactement les mêmes totaux** que le PDF → un seul module de calcul partagé (`totals.ts`).
- **Règles de facturation françaises** : mentions obligatoires (SIREN, TVA intracommunautaire, pénalités de retard, escompte…), numérotation séquentielle sans trou, TVA calculée par taux. Rétention légale : 10 ans.
- **Spécificités BTP** : situations de travaux (facturation à l'avancement), retenue de garantie (5 %), autoliquidation de la TVA en sous-traitance, taux réduits (5,5 % / 10 %) sur la rénovation. Ces règles vivent dans les données envoyées au générateur, pas dans les templates — mais elles dictent le modèle d'entrée.

Question à trancher avec le produit : à quel horizon produire du Factur-X — utile dès maintenant même sans intégration PA (lisible comme un PDF normal, XML ingéré par le logiciel comptable du destinataire, importable dans la PA choisie par l'utilisateur) — puis quand et avec quelle PA s'intégrer pour la transmission directe ?

## Annexe B — Échecs en cours de route (mécanique détaillée)

**Cycle de vie d'un message SQS** : reçu → invisible pendant le *visibility timeout* → supprimé si succès, sinon redevient visible (= retry automatique) avec compteur de réceptions incrémenté.

- **Idempotence** (SQS = *at-least-once*, la double livraison est normale) : le worker réclame le document par une transition atomique. Attention au **lock orphelin** : si le worker crashe juste après être passé en `PROCESSING`, le message SQS réapparaît mais un claim naïf (`WHERE status='PENDING'`) échouerait à jamais — document bloqué. D'où un claim **avec bail (lease)** : un `PROCESSING` expiré redevient réclamable.

  ```sql
  UPDATE documents SET status='PROCESSING', processing_started_at=now()
  WHERE id=$1 AND (
    status='PENDING'
    OR (status='PROCESSING' AND processing_started_at < now() - interval '10 minutes')
  )
  ```

  Si 0 ligne modifiée, on relit le statut : `DONE`/`FAILED` → on supprime le message (travail déjà fait) ; sinon un bail est en cours → on **repose** le message avec un délai (`ChangeMessageVisibility` ≈ durée restante du bail) au lieu de le supprimer — si le détenteur est mort, le message reviendra après expiration et le claim réussira. (Supprimer sur simple échec de claim recréerait le blocage : plus aucun retry en vol quand le bail expire.) Le bail doit dépasser le rendu le plus long du pool — et pour les rendus chunked qui s'étirent, le tick du heartbeat rafraîchit aussi `processing_started_at` (même battement, deux baux : SQS et Postgres). Postgres fait office de verrou : pas de lock distribué. Clé S3 déterministe → un ré-upload est inoffensif.
- **Heartbeat** : pendant un rendu long, le worker prolonge la visibilité du message (`ChangeMessageVisibility` toutes les 60 s). S'il crashe, les battements cessent → le message réapparaît rapidement → un autre worker reprend. Détection de panne passive, sans superviseur.
- **Poison pill** : après `maxReceiveCount = 3`, le message part en **DLQ** (une seconde file SQS ordinaire, désignée par la *redrive policy*) + alarme CloudWatch + statut `FAILED` — l'utilisateur voit un échec actionnable, jamais un spinner éternel. Les messages DLQ s'inspectent et se rejouent après correction (ils ne contiennent que `{ documentId }`, les données sont en base).
- **Très gros documents — chunking par lots** : l'impression Chromium est atomique (le layout est global), donc un échec en cours de rendu = re-rendu... du *lot*, pas du document : au-delà d'un seuil (calibré sur les métriques : taux d'échec et durée par taille), le worker découpe aux frontières naturelles du métier (lots/sections d'un devis), rend chaque tronçon en PDF, fusionne (`pdf-lib`) et re-tamponne la numérotation « page X / Y » en post-traitement. Chaque tronçon est un checkpoint : le travail perdu est borné. **Reprise après crash** : les tronçons rendus sont sur S3 sous clés déterministes (`doc/chunks/N.pdf`) — au retry, le worker liste ce qui existe, saute, et reprend au premier manquant (la découpe est déterministe car snapshot et version de template sont figés — décision 3). Évolution possible : rendu des tronçons en parallèle (un message par chunk), si les métriques le justifient. Pour les documents ordinaires, le re-rendu complet reste préférable : un retry de 300 pages coûte ~0,5 centime de Fargate, la complexité du chunking ne s'y justifie pas.
- **Backoff** : en cas d'erreur probablement transitoire, le worker règle la visibilité du message à 30-60 s avant de le relâcher — l'échec d'un document ne bloque jamais les autres (le retry est par-message, pas par-file).

## Annexe C — Dimensionnement & coûts (tarifs 06/2026, us-east-1 ; Paris +10-15 %)

```
                routage à l'enqueue (proxy : nb lignes du snapshot)
                                   │
              ≤ 200 lignes ────────┴──────── > 200 lignes
                    ▼                              ▼
        [ SQS documents-fast ]          [ SQS documents-heavy ]
          factures 2-10 pages             devis/situations 100+ pages
          rendu ~0,5-2 s                  rendu 10 s - 5 min
                    │                              │
        autoscaling : backlog            autoscaling : âge du plus
        par tâche (cible ~20)            vieux message
                    ▼                              ▼
        pool FAST — ECS Fargate          pool HEAVY — ECS Fargate
        tâche 1 vCPU / 2 Go              tâche 2 vCPU / 8 Go
        ≈ 0,05 $/h                       ≈ 0,12 $/h
        plancher 2 (jamais de            plancher 0 (démarre à la
        cold start), plafond ~20         demande, ~1 min de warm-up)
                    │                              │
                    └──────────► S3 ◄──────────────┘
```

*(« tâche » = un conteneur worker en marche, avec sa réservation CPU/RAM.)*

**Dimensionnement par les débits**, hypothèses pessimistes : 10 000 docs/jour concentrés sur 10 h ouvrées, heure de pointe ×3 → ~3 000 docs/h au pic ; mix supposé 95 % fast / 5 % heavy (à valider — question p50/p99 du cadrage). Une tâche fast sert ~1 800 docs/h (1 rendu × ~2 s), une heavy ~60/h → **2-4 tâches fast et 2-3 heavy au pic ; 6-8 et 4-6 en fin de mois à volume triplé**. Une erreur d'estimation est absorbée par l'autoscaling, pas une panne. Un document fast qui dépasse son budget de temps est re-routé en heavy (l'erreur de routage s'auto-corrige). Équité entre tenants : **SQS Fair Queues** (`MessageGroupId = entrepriseId`) ou plafond applicatif de jobs simultanés par client.

| Poste | Calcul | / mois |
|---|---|---|
| Pool fast — plancher fixe : 2 tâches 24/7 (1 vCPU / 2 Go) | 2 × 0,05 $/h × 730 h | ≈ 72 $ |
| Rafales de fin de mois (ex. +18 tâches × 4 h × 3 jours) | 216 h × 0,05 $/h | ≈ 11 $ |
| Pool heavy — 0 tâche fixe, à la demande (2 vCPU / 8 Go) | ~150-250 h × 0,12 $/h | ≈ 20-30 $ |
| SQS (~1,5 M de requêtes : send + receive + delete + heartbeats) | 1 M gratuit, puis 0,40 $/M | ≈ 0 $ |
| **Total** | | **≈ 100-120 $** |

L'élasticité fait que le pic de fin de mois coûte une dizaine de dollars, pas un parc surdimensionné à l'année.
