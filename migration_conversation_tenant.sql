-- Migration: Rattacher Conversation au tenant (FK + cascade)
-- ============================================================

-- 1. Nettoyer les conversations orphelines (tenantId inexistant)
DELETE FROM conversations WHERE "tenantId" NOT IN (SELECT id FROM tenants);

-- 2. Ajouter la contrainte de clé étrangère
ALTER TABLE conversations
  ADD CONSTRAINT conversations_tenantId_fkey
  FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE CASCADE;
