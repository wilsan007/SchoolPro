-- ============================================================
-- Unicité ATOMIQUE des factures mensuelles
-- ============================================================
-- POURQUOI CETTE MIGRATION EXISTE
-- `genererMensualites` lit d'abord les factures de l'élève, puis crée la ligne
-- si rien ne porte déjà le même libellé. Ce contrôle APPLICATIF protège du
-- double-clic, pas de la CONCURRENCE : deux passages simultanés (deux onglets,
-- deux instances de l'application) lisent tous les deux « rien à facturer » et
-- insèrent chacun une facture. Sur des données financières, le doublon est
-- découvert par la famille, pas par l'école.
--
-- La garantie doit donc venir de la BASE :
--
--   CREATE UNIQUE INDEX ... WHERE mois IS NOT NULL AND statut <> 'ANNULEE'
--
--   • `mois IS NOT NULL` — seules les factures MENSUELLES (MENSUALITE, CANTINE,
--     TRANSPORT) portent un mois (cf. enum TypeFacture). Les frais
--     d'inscription, de renouvellement et les montants libres ne sont pas
--     soumis à cette contrainte.
--   • `statut <> 'ANNULEE'` — une facture annulée LIBÈRE le mois. Sans cela,
--     une erreur de saisie corrigée interdirait de refacturer ce mois.
--   • `anneeId` est volontairement ABSENT de la clé : `mois` (« 2026-10 »)
--     porte déjà l'année. L'ajouter affaiblirait la contrainte, qui deviendrait
--     « unique par couple mois/année » — donc contournable.
--   • `eleveId` peut être NULL (factures de candidature, créées avant l'élève).
--     En SQL, deux NULL ne sont jamais égaux : ces lignes ne sont jamais vues
--     comme des doublons, et l'admission n'est pas bloquée. Comportement voulu.
--
-- ÉCHEC FERMÉ — AUCUNE DONNÉE N'EST MODIFIÉE
-- Un index unique refuse de se créer sur des données déjà en doublon. Cette
-- migration ne supprime NI ne fusionne aucune facture : elle REFUSE de
-- s'appliquer en le disant, et laisse un humain trancher (quelle facture a été
-- encaissée ?). Supprimer ou annuler un document financier n'est pas une
-- décision qu'une migration doit prendre (règle 6 : cloisonnement par défaut
-- fermé ; règle 5 : migration additive et rejouable).
--
-- Marche à suivre si cette migration échoue :
--   1. lister les groupes en conflit :
--      SELECT "tenantId", "eleveId", type, mois, count(*)
--        FROM factures WHERE mois IS NOT NULL AND statut <> 'ANNULEE'
--       GROUP BY 1,2,3,4 HAVING count(*) > 1;
--   2. annuler les doublons à la main (statut = 'ANNULEE' libère le mois) ;
--   3. rejouer la migration — elle est idempotente.
--   Procédure de reprise Prisma (AGENTS.md) :
--     pnpm prisma migrate resolve --rolled-back 20260929120000_add_facture_mensualite_unicite
--
-- VERROUILLAGE : un CREATE INDEX (non CONCURRENTLY, impossible dans la
-- transaction d'une migration Prisma) prend un verrou bref sur `factures`. Le
-- volume de la table rend ce verrou négligeable ; à revoir au-delà de quelques
-- centaines de milliers de lignes.
-- ============================================================

-- Vue de contrôle, à consulter après coup : elle doit rester VIDE.
CREATE OR REPLACE VIEW public.factures_mensualites_doublons AS
SELECT "tenantId", "eleveId", type, mois, count(*) AS nb
FROM public.factures
WHERE mois IS NOT NULL AND statut <> 'ANNULEE'
GROUP BY "tenantId", "eleveId", type, mois
HAVING count(*) > 1;

-- Index unique partiel, idempotent : rejouer la migration ne fait rien si
-- l'index est déjà en place.
DO $$
DECLARE
  doublons bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'factures_unicite_mensuelle' AND relkind = 'i'
  ) THEN
    RAISE NOTICE 'factures_unicite_mensuelle déjà présent — rien à faire';
    RETURN;
  END IF;

  SELECT count(*) INTO doublons FROM public.factures_mensualites_doublons;

  IF doublons > 0 THEN
    RAISE EXCEPTION
      'Unicité des mensualités NON installée : % groupe(s) en doublon. '
      'Aucune donnée n''a été modifiée. Inspecter avec : '
      'SELECT "tenantId", "eleveId", type, mois, count(*) FROM factures '
      'WHERE mois IS NOT NULL AND statut <> ''ANNULEE'' '
      'GROUP BY 1,2,3,4 HAVING count(*) > 1;',
      doublons;
  END IF;

  CREATE UNIQUE INDEX factures_unicite_mensuelle
    ON public.factures ("tenantId", "eleveId", type, mois)
    WHERE mois IS NOT NULL AND statut <> 'ANNULEE';

  RAISE NOTICE 'Index factures_unicite_mensuelle créé';
END $$;
