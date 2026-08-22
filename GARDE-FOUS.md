# Garde-fous inter-projets

## Le problème

Deux projets voisins, issus d'un ancêtre commun, aux noms presque
identiques :

| | **SchoolPro** (ce dépôt) | **EcolPro** |
| --- | --- | --- |
| Dépôt | `wilsan007/SchoolPro` | `wilsan007/EcolPro` |
| Dossier local | `~/Projects/SchoolPro` | `~/Projects/EcolPro-Ops` |
| Base | Supabase / labo local | `ecolemiriam` sur `169.58.208.217` |
| Tables | 116 | 66 |
| LEARNOS | ✅ ~30 tables | ❌ absent |
| État | développement | **PRODUCTION — une école réelle** |

Les schémas ont divergé d'une cinquantaine de tables :

- présentes **seulement ici** : toutes les `learnos_*` ;
- présentes **seulement chez EcolPro** : `cahier_textes`,
  `cahier_texte_commentaires`, `enseignant_affectations`,
  `enseignant_matieres`, `user_permissions`.

> ⚠️ Faux ami : `progressions_eleves` existe dans **les deux**. Elle ne peut
> pas servir de marqueur — cette erreur a produit un faux positif lors de la
> mise en place.

Un `prisma db push` lancé d'ici contre la base d'ecolemiriam créerait des
dizaines de tables absentes et alignerait le schéma existant : **corruption
immédiate** d'une base contenant élèves, parents et comptabilité.

Le cas dangereux n'est pas l'erreur grossière. C'est le **tunnel SSH resté
ouvert** sur `127.0.0.1:16432`, qui fait ressembler la production à une base
locale parfaitement anodine.

---

## Les trois garde-fous

### 1. Empreinte de la base — `scripts/guard-target-db.cjs`

Avant toute écriture, on vérifie **le contenu réel** de la base visée, pas
seulement son adresse :

1. **l'hôte** — liste noire puis liste blanche (instantané, sans réseau) ;
2. **l'empreinte du schéma** — la base contient-elle les tables qui
   caractérisent SchoolPro, et aucune de celles d'EcolPro ?

C'est le second contrôle qui résiste au tunnel : `127.0.0.1` est un hôte
légitime, mais la présence de `cahier_textes` trahit la production.

**Échec fermé** : base injoignable, empreinte illisible ou identité absente
⇒ refus. Une opération bloquée à tort coûte trente secondes ; une base de
production écrasée coûte l'année scolaire.

Carve-out unique : une base **vide** est autorisée — c'est le premier
`db push` sur un conteneur de développement neuf, et il n'y a rien à
corrompre.

Câblé dans `db:push`, `db:migrate`, `db:reset`, `db:seed`,
`db:seed:ambouli`. Vérification manuelle :

```bash
pnpm guard:db
```

### 2. Cible SSH — `make verifier-vps`

25 cibles Make ouvrent une connexion SSH. Toutes dépendent désormais de
`verifier-vps`, qui refuse `169.58.208.217`.

```bash
make status VPS=root@169.58.208.217   # → refusé
```

### 3. Séparation physique

Le matériel d'exploitation d'ecolemiriam a quitté ce dépôt :

| Fichier | Devenu |
| --- | --- |
| `scripts/dev-tunnel-vps.sh` | `~/Projects/EcolPro-Ops/scripts/tunnel-db.sh` |
| `SECURITY-AUDIT-2026-08-21.md` | `~/Projects/EcolPro-Ops/` |

`EcolPro-Ops` possède son propre `.project-identity.json`, **miroir exact**
de celui-ci : marqueurs inversés, Supabase en liste noire. Chaque
compartiment refuse la base de l'autre.

---

## Ajouter une base légitime

Modifier `hotes_autorises` dans `.project-identity.json` — délibérément,
jamais dans l'urgence d'un déploiement bloqué.

## Si un schéma évolue

Les marqueurs sont une **différence ensembliste réelle**, calculée le
2026-08-22. Après une migration importante de part et d'autre, la
recalculer :

```bash
comm -13 <(tables_schoolpro) <(tables_ecolemiriam)
```

Et n'y placer que des tables réellement exclusives.

---

## Ce que ces garde-fous ne couvrent pas

Ils protègent les commandes **de ce dépôt**. Un `psql` lancé à la main, un
client graphique, ou `prisma` invoqué directement sans passer par les
scripts npm les contournent :

```bash
pnpm exec prisma db push   # ← contourne le garde-fou
pnpm db:push               # ← protégé
```

Le garde-fou réduit la surface d'erreur ; il ne remplace pas l'attention
portée à la variable `DATABASE_URL` avant chaque opération d'écriture.
