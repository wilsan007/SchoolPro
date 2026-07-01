-- ============================================================
-- EcolPro — RLS (Row Level Security) Setup
-- Active l'isolation multi-tenant au niveau base de données
-- ============================================================

-- 1. Fonction pour setter le tenant context dans la session
CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fonction pour récupérer le tenant context (utilisée par les policies)
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.tenant_id', true);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 3. Activation RLS + Policies pour toutes les tables tenant
-- ============================================================

-- TENANTS (lecture seule sur son propre tenant)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_own" ON public.tenants;
CREATE POLICY "tenant_select_own" ON public.tenants
  FOR SELECT USING (id = current_tenant_id());

-- ANNEES SCOLAIRES
ALTER TABLE public.annees_scolaires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "annees_tenant_isolation" ON public.annees_scolaires;
CREATE POLICY "annees_tenant_isolation" ON public.annees_scolaires
  FOR ALL USING ("tenantId" = current_tenant_id());

-- PERIODES (pas de tenantId direct, via annee → pas de RLS simple, on gère via app)
-- Les périodes sont liées à une année scolaire qui a un tenantId
-- On laisse l'application filtrer pour cette table

-- USERS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_tenant_isolation" ON public.users;
CREATE POLICY "users_tenant_isolation" ON public.users
  FOR ALL USING ("tenantId" = current_tenant_id() OR "tenantId" IS NULL);

-- CLASSES
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "classes_tenant_isolation" ON public.classes;
CREATE POLICY "classes_tenant_isolation" ON public.classes
  FOR ALL USING ("tenantId" = current_tenant_id());

-- MATIERES
ALTER TABLE public.matieres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "matieres_tenant_isolation" ON public.matieres;
CREATE POLICY "matieres_tenant_isolation" ON public.matieres
  FOR ALL USING ("tenantId" = current_tenant_id());

-- ELEVES
ALTER TABLE public.eleves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eleves_tenant_isolation" ON public.eleves;
CREATE POLICY "eleves_tenant_isolation" ON public.eleves
  FOR ALL USING ("tenantId" = current_tenant_id());

-- PARENTS
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parents_tenant_isolation" ON public.parents;
CREATE POLICY "parents_tenant_isolation" ON public.parents
  FOR ALL USING ("tenantId" = current_tenant_id());

-- ELEVE_PARENTS (via eleve → tenantId)
ALTER TABLE public.eleve_parents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eleve_parents_tenant" ON public.eleve_parents;
CREATE POLICY "eleve_parents_tenant" ON public.eleve_parents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.eleves e WHERE e.id = "eleveId" AND e."tenantId" = current_tenant_id())
  );

-- ENSEIGNANTS
ALTER TABLE public.enseignants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "enseignants_tenant_isolation" ON public.enseignants;
CREATE POLICY "enseignants_tenant_isolation" ON public.enseignants
  FOR ALL USING ("tenantId" = current_tenant_id());

-- EMPLOIS TEMPS
ALTER TABLE public.emplois_temps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "emplois_tenant_isolation" ON public.emplois_temps;
CREATE POLICY "emplois_tenant_isolation" ON public.emplois_temps
  FOR ALL USING ("tenantId" = current_tenant_id());

-- ABSENCES
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "absences_tenant_isolation" ON public.absences;
CREATE POLICY "absences_tenant_isolation" ON public.absences
  FOR ALL USING ("tenantId" = current_tenant_id());

-- EVALUATIONS
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "evaluations_tenant_isolation" ON public.evaluations;
CREATE POLICY "evaluations_tenant_isolation" ON public.evaluations
  FOR ALL USING ("tenantId" = current_tenant_id());

-- NOTES
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes_tenant_isolation" ON public.notes;
CREATE POLICY "notes_tenant_isolation" ON public.notes
  FOR ALL USING ("tenantId" = current_tenant_id());

-- BULLETINS
ALTER TABLE public.bulletins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bulletins_tenant_isolation" ON public.bulletins;
CREATE POLICY "bulletins_tenant_isolation" ON public.bulletins
  FOR ALL USING ("tenantId" = current_tenant_id());

-- BULLETIN MATIERES (via bulletin → tenantId)
ALTER TABLE public.bulletin_matieres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bulletin_matieres_tenant" ON public.bulletin_matieres;
CREATE POLICY "bulletin_matieres_tenant" ON public.bulletin_matieres
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.bulletins b WHERE b.id = "bulletinId" AND b."tenantId" = current_tenant_id())
  );

-- EXAMENS
ALTER TABLE public.examens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "examens_tenant_isolation" ON public.examens;
CREATE POLICY "examens_tenant_isolation" ON public.examens
  FOR ALL USING ("tenantId" = current_tenant_id());

-- SESSIONS EXAMEN (via examen → tenantId)
ALTER TABLE public.sessions_examen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sessions_examen_tenant" ON public.sessions_examen;
CREATE POLICY "sessions_examen_tenant" ON public.sessions_examen
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.examens e WHERE e.id = "examId" AND e."tenantId" = current_tenant_id())
  );

-- FACTURES
ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "factures_tenant_isolation" ON public.factures;
CREATE POLICY "factures_tenant_isolation" ON public.factures
  FOR ALL USING ("tenantId" = current_tenant_id());

-- INCIDENTS
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "incidents_tenant_isolation" ON public.incidents;
CREATE POLICY "incidents_tenant_isolation" ON public.incidents
  FOR ALL USING ("tenantId" = current_tenant_id());

-- NOTIFICATIONS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_tenant_isolation" ON public.notifications;
CREATE POLICY "notifications_tenant_isolation" ON public.notifications
  FOR ALL USING ("tenantId" = current_tenant_id());

-- EVENEMENTS
ALTER TABLE public.evenements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "evenements_tenant_isolation" ON public.evenements;
CREATE POLICY "evenements_tenant_isolation" ON public.evenements
  FOR ALL USING ("tenantId" = current_tenant_id());

-- CONVERSATIONS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversations_tenant_isolation" ON public.conversations;
CREATE POLICY "conversations_tenant_isolation" ON public.conversations
  FOR ALL USING ("tenantId" = current_tenant_id());

-- MESSAGES (via conversation → tenantId)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_tenant" ON public.messages;
CREATE POLICY "messages_tenant" ON public.messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = "conversationId" AND c."tenantId" = current_tenant_id())
  );

-- CONVERSATION PARTICIPANTS (via conversation → tenantId)
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conv_participants_tenant" ON public.conversation_participants;
CREATE POLICY "conv_participants_tenant" ON public.conversation_participants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = "conversationId" AND c."tenantId" = current_tenant_id())
  );

-- DEVICE TOKENS
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "device_tokens_tenant" ON public.device_tokens;
CREATE POLICY "device_tokens_tenant" ON public.device_tokens
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = "userId" AND (u."tenantId" = current_tenant_id() OR u."tenantId" IS NULL))
  );

-- ============================================================
-- Note: La service_role key bypass automatiquement le RLS.
-- Les policies s'appliquent quand on utilise l'anon key ou
-- quand on set le tenant context via set_tenant_context().
-- ============================================================
