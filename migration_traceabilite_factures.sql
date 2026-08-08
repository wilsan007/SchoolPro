-- Migration: Traçabilité des factures et paiements
-- Ajout des champs createdById (Facture) et enregitreParId (Paiement)

-- Facture: qui a créé la facture
ALTER TABLE factures ADD COLUMN IF NOT EXISTS "createdById" TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Paiement: qui a enregistré le paiement
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS "enregistreParId" TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_factures_createdById ON factures("createdById");
CREATE INDEX IF NOT EXISTS idx_paiements_enregistreParId ON paiements("enregistreParId");
