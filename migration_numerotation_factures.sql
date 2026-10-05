-- ============================================================
-- Numérotation des factures : compteur en base sous verrou + unicité stricte
-- ============================================================
-- Les numéros étaient calculés par `count() + 1` : ni atomique (deux créations
-- simultanées obtenaient le même numéro), ni stable (une suppression faisait
-- réémettre un numéro), et rien en base n'interdisait un doublon.
--
-- Idempotent : peut être rejoué sans effet.
-- Application : node --env-file=.env --env-file=.env.local scripts/appliquer-migration-numerotation-factures.cjs --apply

-- 1. Doublons existants -------------------------------------------------------
-- Seuls doublons constatés : les mensualités de démonstration « F-MMAA-NNNN »
-- (scripts/demo/07-facturation-2026.ts), numérotées d'après les 4 derniers
-- chiffres du matricule — identiques sur deux sites. Le code du site (préfixe
-- du matricule) est inséré : « F-1026-0002 » → « F-1026-ARH-0002 ».
-- Réversible : il suffit de retirer ce segment.
UPDATE factures f
   SET numero = substring(f.numero FROM '^F-\d{4}') || '-' || split_part(e.matricule, '-', 1) || '-' || right(f.numero, 4)
  FROM eleves e
 WHERE e.id = f."eleveId"
   AND f.id LIKE 'fact-2026-%'
   AND f.numero ~ '^F-\d{4}-\d{4}$';

-- 2. Compteur -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facture_sequences (
  "tenantId"  TEXT NOT NULL,
  prefixe     TEXT NOT NULL,
  dernier     INTEGER NOT NULL CHECK (dernier >= 0),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  CONSTRAINT facture_sequences_pkey PRIMARY KEY ("tenantId", prefixe)
);

-- Aucune politique : la table n'est lisible par aucun rôle soumis à la RLS.
-- Seule la fonction ci-dessous (SECURITY DEFINER) y touche.
ALTER TABLE facture_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE facture_sequences FROM PUBLIC;

-- Réserve `p_nombre` numéros consécutifs et renvoie le premier. À la première
-- utilisation d'un préfixe, repart du plus grand numéro « FAC-<préfixe>-N »
-- déjà émis par l'établissement, tous sites confondus.
CREATE OR REPLACE FUNCTION next_facture_numeros(p_tenant TEXT, p_prefixe TEXT, p_nombre INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_dernier INTEGER;
BEGIN
  IF p_tenant IS NULL OR p_prefixe IS NULL OR p_prefixe !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'next_facture_numeros: tenant ou préfixe invalide (%)', p_prefixe;
  END IF;
  IF p_nombre IS NULL OR p_nombre < 1 OR p_nombre > 50000 THEN
    RAISE EXCEPTION 'next_facture_numeros: nombre invalide (%)', p_nombre;
  END IF;

  -- Sérialise l'initialisation d'un préfixe encore absent de la table ;
  -- ensuite, le verrou de ligne de l'UPDATE suffit.
  PERFORM pg_advisory_xact_lock(hashtext('facture_sequences:' || p_tenant || ':' || p_prefixe));

  UPDATE facture_sequences
     SET dernier = dernier + p_nombre, "updatedAt" = now() AT TIME ZONE 'utc'
   WHERE "tenantId" = p_tenant AND prefixe = p_prefixe
   RETURNING dernier INTO v_dernier;

  IF NOT FOUND THEN
    SELECT COALESCE(MAX(substring(numero FROM '(\d+)$')::INTEGER), 0) + p_nombre
      INTO v_dernier
      FROM factures
     WHERE "tenantId" = p_tenant
       AND numero ~ ('^FAC-' || p_prefixe || '-\d{1,9}$');
    INSERT INTO facture_sequences ("tenantId", prefixe, dernier)
    VALUES (p_tenant, p_prefixe, v_dernier);
  END IF;

  RETURN v_dernier - p_nombre + 1;
END
$fn$;

REVOKE ALL ON FUNCTION next_facture_numeros(TEXT, TEXT, INTEGER) FROM PUBLIC;

DO $$
DECLARE r TEXT;
BEGIN
  -- Rôles exposés par l'API Supabase : ni la table ni la fonction.
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE facture_sequences FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION next_facture_numeros(TEXT, TEXT, INTEGER) FROM %I', r);
    END IF;
  END LOOP;
  -- Rôle applicatif du VPS (docker/postgres/init/02-roles.sh) : la fonction seule.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecolpro_app') THEN
    REVOKE ALL ON TABLE facture_sequences FROM ecolpro_app;
    GRANT EXECUTE ON FUNCTION next_facture_numeros(TEXT, TEXT, INTEGER) TO ecolpro_app;
  END IF;
END $$;

-- 3. Unicité stricte ----------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "factures_tenantId_numero_key" ON factures ("tenantId", numero);
