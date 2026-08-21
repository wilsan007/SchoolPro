#!/bin/bash
# ============================================================
# EcolPro — Bilan hebdomadaire
#
# POURQUOI UN MESSAGE QUI DIT « TOUT VA BIEN »
# Toutes les autres alertes du projet ne parlent qu'en cas de problème.
# C'est le bon réglage au quotidien — mais cela crée une ambiguïté
# permanente : un canal silencieux depuis trois semaines signifie-t-il que
# tout va bien, ou que plus rien ne tourne ? Sans réponse, on finit par
# supposer la première, ce qui est exactement l'erreur à ne pas commettre.
#
# Ce bilan tranche : un message par semaine, même quand tout va bien.
# Le recevoir prouve que la chaîne complète fonctionne — ordonnanceur,
# conteneur, réseau sortant, jeton Telegram. Ne PAS le recevoir un
# dimanche matin est, en soi, l'information.
#
# Il tient volontairement en un écran de téléphone : un rapport qu'on ne
# lit pas ne vaut pas mieux qu'un rapport qui n'existe pas.
#
# Exécuté par Ofelia le dimanche. Ne renvoie jamais d'erreur bloquante.
# ============================================================
set -uo pipefail

DB_NAME="${POSTGRES_DB:-ecolpro}"
# Surchargeable pour pouvoir vérifier le contenu du bilan sans envoyer
# de message : NOTIFY=/bin/echo weekly-digest.sh
NOTIFY="${NOTIFY:-/usr/local/bin/notify.sh}"
PSQL="psql -U postgres -d ${DB_NAME} -t -A -X -q"

q() { ${PSQL} -c "$1" 2>/dev/null | head -1; }

L=""
add() { L="${L}$1"$'\n'; }

# --- Sauvegardes ----------------------------------------------------------
if pgbackrest --stanza=ecolpro info >/dev/null 2>&1; then
  INFO=$(pgbackrest --stanza=ecolpro info --output=json 2>/dev/null)
  NB=$(echo "${INFO}" | grep -o '"type":"' | wc -l | tr -d ' ')
  LAST_TS=$(echo "${INFO}" | grep -o '"stop":[0-9]*' | tail -1 | cut -d: -f2)
  if [ -n "${LAST_TS}" ]; then
    AGE_H=$(( ( $(date +%s) - LAST_TS ) / 3600 ))
    add "Sauvegardes : ${NB} conservées, dernière il y a ${AGE_H} h"
  else
    add "Sauvegardes : AUCUNE"
  fi
  if echo "${INFO}" | grep -q '"repo":2'; then
    add "Hors site : actif"
  else
    add "Hors site : ABSENT — perdre le VPS = tout perdre"
  fi
else
  add "Sauvegardes : pgbackrest ne répond pas"
fi

# --- Isolation ------------------------------------------------------------
RLS_ON=$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity;")
POLICIES=$(q "SELECT count(*) FROM pg_policies WHERE schemaname='public';")
add "Isolation RLS : ${RLS_ON:-0} tables, ${POLICIES:-0} politiques"

# --- Volumétrie -----------------------------------------------------------
DB_SIZE=$(q "SELECT pg_size_pretty(pg_database_size('${DB_NAME}'));")
ELEVES=$(q "SELECT count(*) FROM eleves WHERE \"deletedAt\" IS NULL;")
TENANTS=$(q "SELECT count(*) FROM tenants;")
add "Base : ${DB_SIZE:-?}, ${TENANTS:-?} établissement(s), ${ELEVES:-?} élèves actifs"

# --- Activité de la semaine ----------------------------------------------
CONNEXIONS=$(q "SELECT count(*) FROM audit_logs WHERE action ILIKE '%login%' AND \"createdAt\" > now() - interval '7 days';")
[ -n "${CONNEXIONS}" ] && add "Connexions (7 j) : ${CONNEXIONS}"

# --- Santé ----------------------------------------------------------------
ARCH_FAIL=$(q "SELECT failed_count FROM pg_stat_archiver;")
add "Archivage WAL : ${ARCH_FAIL:-?} échec(s) cumulés"

DISK=$(df -h /var/lib/postgresql/data 2>/dev/null | awk 'NR==2 {print $5" utilisé sur "$2}')
[ -n "${DISK}" ] && add "Disque données : ${DISK}"

# --- Audit de sécurité ----------------------------------------------------
# On rejoue l'audit pour donner un verdict, sans renvoyer son détail : les
# problèmes ont déjà déclenché leur propre alerte au moment où ils sont
# apparus. Ici, seul le compte importe.
AUDIT_SCRIPT="/usr/local/bin/security-audit-db.sh"
if [ ! -x "${AUDIT_SCRIPT}" ]; then
  # Ne JAMAIS rapporter « 0 problème » quand l'audit n'a pas tourné :
  # ce serait la fausse assurance que ce bilan est censé éliminer.
  add "Audit sécurité : NON EXÉCUTÉ (${AUDIT_SCRIPT} introuvable)"
else
  AUDIT_OUT=$("${AUDIT_SCRIPT}" 2>&1)
  AUDIT_RC=$?
  GRAVES=$(printf '%s' "${AUDIT_OUT}" | grep -c 'GRAVE')
  ALERTES=$(printf '%s' "${AUDIT_OUT}" | grep -c 'ALERTE')
  if [ "${AUDIT_RC}" -ne 0 ] && [ "${GRAVES}" -eq 0 ]; then
    # Sortie non nulle sans ligne GRAVE : l'audit s'est interrompu.
    add "Audit sécurité : INTERROMPU (code ${AUDIT_RC}) — à vérifier à la main"
  elif [ "${GRAVES}" -eq 0 ]; then
    add "Audit sécurité : aucun problème critique, ${ALERTES} avertissement(s)"
  else
    add "Audit sécurité : ${GRAVES} problème(s) CRITIQUE(S), ${ALERTES} avertissement(s)"
  fi
fi

"${NOTIFY}" info "Bilan hebdomadaire EcolPro" "${L}
Ce message arrive chaque dimanche. Son absence est un signal."  || true

echo "[digest] Bilan envoyé."
exit 0
