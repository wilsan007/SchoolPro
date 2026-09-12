#!/bin/bash
# OWASP ZAP Baseline Scan — SchoolPro
# Scan passif (baseline) de l'application en cours d'exécution
#
# Usage:
#   pnpm audit:zap                    # Scan sur localhost:3000
#   pnpm audit:zap --url https://...  # Scan sur une URL personnalisée
#   pnpm audit:zap --report           # Génère un rapport HTML

set -euo pipefail

ZAP_DIR="$(dirname "$0")/../tools/zap"
# ZAP se extrait dans un sous-dossier versionné (ex: ZAP_2.17.0)
ZAP_SCRIPT=$(find "$ZAP_DIR" -name "zap.sh" -type f 2>/dev/null | head -1)
if [ -z "$ZAP_SCRIPT" ]; then
  ZAP_SCRIPT="$ZAP_DIR/zap.sh"
fi

# Déterminer l'URL cible
TARGET_URL="http://localhost:3000"
GENERATE_REPORT=false

for arg in "$@"; do
  case $arg in
    --url=*)
      TARGET_URL="${arg#*=}"
      ;;
    --report)
      GENERATE_REPORT=true
      ;;
  esac
done

if [ ! -f "$ZAP_SCRIPT" ]; then
  echo "❌ ZAP non installé. Exécutez: cd tools && curl -L -o ZAP_Core.zip https://github.com/zaproxy/zaproxy/releases/download/v2.17.0/ZAP_2.17.0_Core.zip && unzip -q ZAP_Core.zip -d zap && rm ZAP_Core.zip"
  exit 1
fi

REPORT_DIR="$(dirname "$0")/../audit-reports"
mkdir -p "$REPORT_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "🛡️  OWASP ZAP Baseline Scan"
echo "   Target: $TARGET_URL"
echo "   Report: $REPORT_DIR/zap-baseline-$TIMESTAMP"
echo ""

if [ "$GENERATE_REPORT" = true ]; then
  # Scan baseline avec rapport HTML
  "$ZAP_SCRIPT" -cmd \
    -quickurl "$TARGET_URL" \
    -quickout "$REPORT_DIR/zap-baseline-$TIMESTAMP.html" \
    -quickprogress \
    -port 8080 \
    -host 127.0.0.1
else
  # Scan baseline en mode daemon (rapide, passif)
  "$ZAP_SCRIPT" -cmd \
    -quickurl "$TARGET_URL" \
    -quickprogress \
    -port 8080 \
    -host 127.0.0.1 2>&1 | tee "$REPORT_DIR/zap-baseline-$TIMESTAMP.txt"
fi

echo ""
echo "✅ Scan ZAP terminé — Rapport: $REPORT_DIR/zap-baseline-$TIMESTAMP"
