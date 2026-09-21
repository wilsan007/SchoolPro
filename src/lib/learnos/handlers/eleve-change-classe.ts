/**
 * Handler `eleve.change.classe`
 * ==============================
 *
 * Quand des élèves changent de classe, la composition des classes concernées
 * change — et avec elle les KPI de direction (effectifs, couverture par
 * classe, taux d'absentéisme par classe). On déclenche donc un recalcul des
 * KPI du tenant.
 *
 * Les preuves d'apprentissage (LearningEvidence) restent rattachées à
 * l'élève : le transfert ne les invalide pas, elles suivent l'élève dans sa
 * nouvelle classe via `eleve.classeId`.
 */

import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { EleveChangeClassePayload } from "@/lib/learnos/events";
import { publishEvent } from "@/lib/learnos/events";

export async function onEleveChangeClasse(event: DrainedEvent): Promise<void> {
  const p = event.payload as EleveChangeClassePayload;

  if (!p?.nouvelleClasseId || !Array.isArray(p.eleveIds) || p.eleveIds.length === 0) {
    throw new Error(
      `eleve.change.classe incomplet (événement ${event.id}) : nouvelleClasseId/eleveIds requis`
    );
  }

  await publishEvent({
    tenantId: event.tenantId,
    siteId: event.siteId,
    eventType: "kpi.recalculer",
    aggregateType: "classe",
    aggregateId: p.nouvelleClasseId,
    payload: {
      perimetre: "global",
      type: "eleve_change_classe",
      eleveIds: p.eleveIds,
      ancienneClasseId: p.ancienneClasseId,
      nouvelleClasseId: p.nouvelleClasseId,
    },
  });
}
