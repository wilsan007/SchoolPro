# Annexe B — Inventaire noté des 86 pages du tableau de bord

Généré le 2026-09-11 sur le commit `4976316`. Analyse de la page **et des composants qu'elle importe directement**.

## Grille

Départ 10. Retraits : pas de `guardPage` (−1 si la route est couverte par le registre du middleware ou un contrôle client, −3 sinon) · aucun `error.tsx` dans l'application (−1, s'applique à toutes les pages) · pas de `loading.tsx` sur le segment (−0,5) · aucun appel i18n (−1) · couleurs Tailwind brutes hors jetons de DESIGN.md (> 10 : −0,5 ; > 50 : −1) · boutons icône sans `aria-label` (−0,5) · modales maison sans `role="dialog"` (−0,5). Pages `/test-*` plafonnées à 6.

> Le seuil 9,7 exige en plus : test Playwright de la page pour chaque rôle autorisé **et** refusé, contrôle axe-core sans violation « serious/critical », capture validée contre DESIGN.md.

**Moyenne : 7.78** · 0/86 pages à 9,7 ou plus · la meilleure note possible aujourd'hui est 9,0 tant qu'aucun `error.tsx` n'existe.

| Score | Page | Motifs |
|---:|---|---|
| 6.0 | `/super-admin` | pas de guardPage (registre middleware / contrôle client seulement) · aucun error.tsx dans l'application · 242 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé · 1 modale(s) maison sans role="dialog" |
| 6.0 | `/test-telegram` | page de test présente en production · pas de guardPage (registre middleware / contrôle client seulement) · aucun error.tsx dans l'application |
| 6.0 | `/test-whatsapp` | page de test présente en production · pas de guardPage (registre middleware / contrôle client seulement) · aucun error.tsx dans l'application |
| 6.5 | `/parametres/journal-emails` | pas de guardPage (registre middleware / contrôle client seulement) · aucun error.tsx dans l'application · aucun appel i18n · 13 couleurs brutes |
| 7.0 | `/admissions` | aucun error.tsx dans l'application · 113 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé · 3 modale(s) maison sans role="dialog" |
| 7.0 | `/alumni` | aucun error.tsx dans l'application · 112 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé · 1 modale(s) maison sans role="dialog" |
| 7.0 | `/communication` | aucun error.tsx dans l'application · 82 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé · 1 modale(s) maison sans role="dialog" |
| 7.0 | `/cours` | aucun error.tsx dans l'application · 102 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé · 2 modale(s) maison sans role="dialog" |
| 7.0 | `/emploi-du-temps` | aucun error.tsx dans l'application · 335 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé · 2 modale(s) maison sans role="dialog" |
| 7.0 | `/examens` | aucun error.tsx dans l'application · 139 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé · 2 modale(s) maison sans role="dialog" |
| 7.0 | `/inventaire` | aucun error.tsx dans l'application · 119 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé · 1 modale(s) maison sans role="dialog" |
| 7.0 | `/mon-emploi` | aucun error.tsx dans l'application · 347 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé · 2 modale(s) maison sans role="dialog" |
| 7.0 | `/secretariat/inscriptions` | aucun error.tsx dans l'application · 64 couleurs brutes hors jetons · 4 bouton(s) icône sans libellé · 2 modale(s) maison sans role="dialog" |
| 7.0 | `/vie-scolaire` | aucun error.tsx dans l'application · 110 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé · 1 modale(s) maison sans role="dialog" |
| 7.5 | `/analytics` | aucun error.tsx dans l'application · 142 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/cahier-journal` | aucun error.tsx dans l'application · 322 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/comparateur` | aucun error.tsx dans l'application · 82 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/conseil-augmente` | aucun error.tsx dans l'application · 208 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/direction` | aucun error.tsx dans l'application · 153 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/dossier-progression/[eleveId]` | aucun error.tsx dans l'application · 187 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/eleve` | aucun error.tsx dans l'application · 103 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/eleves/[id]/modifier` | aucun error.tsx dans l'application · 18 couleurs brutes · 2 bouton(s) icône sans libellé · 1 modale(s) maison sans role="dialog" |
| 7.5 | `/eleves/[id]` | aucun error.tsx dans l'application · 84 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/eleves/nouveau` | aucun error.tsx dans l'application · 18 couleurs brutes · 2 bouton(s) icône sans libellé · 1 modale(s) maison sans role="dialog" |
| 7.5 | `/gouvernance` | aucun error.tsx dans l'application · 83 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/ma-classe` | aucun error.tsx dans l'application · 96 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/mentorat` | aucun error.tsx dans l'application · 74 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/mon-espace` | aucun error.tsx dans l'application · 113 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/orientation` | aucun error.tsx dans l'application · 90 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/parametres/audit` | pas de guardPage (registre middleware / contrôle client seulement) · aucun error.tsx dans l'application · 35 couleurs brutes |
| 7.5 | `/parent` | aucun error.tsx dans l'application · 153 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/parents` | aucun error.tsx dans l'application · 91 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/profil/securite` | pas de guardPage (registre middleware / contrôle client seulement) · aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 7.5 | `/rapports` | aucun error.tsx dans l'application · 107 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/rh` | aucun error.tsx dans l'application · 95 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 7.5 | `/veille-assiduite` | aucun error.tsx dans l'application · 66 couleurs brutes hors jetons · 2 bouton(s) icône sans libellé |
| 8.0 | `/absences/appel` | aucun error.tsx dans l'application · 31 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/acces-bloque` | pas de guardPage (registre middleware / contrôle client seulement) · aucun error.tsx dans l'application |
| 8.0 | `/caisse` | aucun error.tsx dans l'application · 11 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/comptabilite` | aucun error.tsx dans l'application · 23 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/conseiller` | aucun error.tsx dans l'application · 21 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/couverture` | aucun error.tsx dans l'application · 12 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/eleves/comptes` | aucun error.tsx dans l'application · 21 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/eleves` | aucun error.tsx dans l'application · 19 couleurs brutes · 5 bouton(s) icône sans libellé |
| 8.0 | `/entrainement` | aucun error.tsx dans l'application · 15 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/evaluations/[id]` | aucun error.tsx dans l'application · 24 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/evaluations` | aucun error.tsx dans l'application · 74 couleurs brutes hors jetons |
| 8.0 | `/exploitation` | aucun error.tsx dans l'application · 13 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/facturation/[id]` | aucun error.tsx dans l'application · 17 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/facturation` | aucun error.tsx dans l'application · 29 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/fournitures/enseignant` | aucun error.tsx dans l'application · 14 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/fournitures` | aucun error.tsx dans l'application · 17 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/intelligence` | aucun error.tsx dans l'application · 37 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/ma-journee` | aucun error.tsx dans l'application · 15 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/messages` | aucun error.tsx dans l'application · 16 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/notes/bulletins` | aucun error.tsx dans l'application · 13 couleurs brutes · 7 bouton(s) icône sans libellé |
| 8.0 | `/parametres/reinscription` | aucun error.tsx dans l'application · 24 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/parent/factures/[id]` | aucun error.tsx dans l'application · 16 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/parent/reinscription` | pas de guardPage (registre middleware / contrôle client seulement) · aucun error.tsx dans l'application |
| 8.0 | `/recommandations` | aucun error.tsx dans l'application · 21 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/revision-semaine` | aucun error.tsx dans l'application · 11 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/rubriques-evaluation` | aucun error.tsx dans l'application · 16 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/secretariat` | aucun error.tsx dans l'application · 41 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/taches` | aucun error.tsx dans l'application · 34 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/travail` | aucun error.tsx dans l'application · 15 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.0 | `/vie-scolaire/exclusions` | aucun error.tsx dans l'application · 23 couleurs brutes · 2 bouton(s) icône sans libellé |
| 8.5 | `/absences` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/chatbot-direction` | aucun error.tsx dans l'application · 3 bouton(s) icône sans libellé |
| 8.5 | `/curriculum` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/dashboard` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/devoirs` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/eleves/attestations` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/eleves/cartes` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/eleves/transfert` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/examens/rapport-classe` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/facturation/nouvelle` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/infirmerie` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/inspection` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/ma-matiere` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/notes` | aucun error.tsx dans l'application · 4 bouton(s) icône sans libellé |
| 8.5 | `/parametres/demandes-lien` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/parametres` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/plans-lecon` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/profil` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/propositions-ia` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
| 8.5 | `/vie-scolaire/convocations` | aucun error.tsx dans l'application · 2 bouton(s) icône sans libellé |
