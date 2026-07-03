#!/bin/bash
# Test EcolPro - Messagerie, Notifications, Appel
# Usage: bash run-tests.sh

B="$HOME/.claude/skills/gstack/browse/dist/browse"
BASE="http://localhost:3002"

if [ ! -x "$B" ]; then
  echo "ERROR: browse binary not found at $B"
  echo "Run: cd ~/.claude/skills/gstack/browse && ./setup"
  exit 1
fi

echo "=== 1. Login admin ==="
$B goto "$BASE/login"
$B snapshot -i
$B fill 'input[type="email"]' "admin@lycee-demo.ecolpro.app"
$B fill 'input[type="password"]' "Demo@2026!"
$B click 'button[type="submit"]'
$B wait --networkidle
$B screenshot /tmp/ecolpro-admin-dashboard.png
echo "Dashboard loaded:"
$B url

echo ""
echo "=== 2. Aller aux Parametres -> Ajouter un enseignant ==="
$B goto "$BASE/parametres"
$B wait --networkidle
$B snapshot -i
$B screenshot /tmp/ecolpro-parametres.png
echo "Clicking 'Ajouter un utilisateur':"
$B click 'button:has-text("Ajouter")'
sleep 1
$B snapshot -i
$B screenshot /tmp/ecolpro-add-user-form.png

echo ""
echo "=== 3. Remplir le formulaire enseignant ==="
$B fill 'input#name' "Awa Diallo"
$B fill 'input#email' "awa.diallo@lycee-demo.ecolpro.app"
$B select 'select#role' "TEACHER"
$B fill 'input#phone' "771234567"
$B fill 'input#password' "Demo@2026!"
$B screenshot /tmp/ecolpro-add-teacher-filled.png
echo "Submitting form..."
$B click 'button[type="submit"]'
$B wait --networkidle
sleep 2
$B screenshot /tmp/ecolpro-teacher-created.png
echo "Teacher created. Console errors:"
$B console --errors

echo ""
echo "=== 4. Ajouter un parent ==="
$B click 'button:has-text("Ajouter")'
sleep 1
$B fill 'input#name' "Fatou Ndiaye"
$B fill 'input#email' "fatou.ndiaye@lycee-demo.ecolpro.app"
$B select 'select#role' "PARENT"
$B fill 'input#phone' "779876543"
$B fill 'input#password' "Demo@2026!"
$B click 'button[type="submit"]'
$B wait --networkidle
sleep 2
$B screenshot /tmp/ecolpro-parent-created.png
echo "Parent created."

echo ""
echo "=== 5. Tester la messagerie ==="
$B goto "$BASE/messages"
$B wait --networkidle
$B snapshot -i
$B screenshot /tmp/ecolpro-messages.png
echo "Messages page loaded."

echo ""
echo "=== 6. Aller aux absences -> faire l'appel ==="
$B goto "$BASE/absences"
$B wait --networkidle
$B snapshot -i
$B screenshot /tmp/ecolpro-absences.png
echo "Absences page loaded."

echo ""
echo "=== 7. Aller a la communication ==="
$B goto "$BASE/communication"
$B wait --networkidle
$B snapshot -i
$B screenshot /tmp/ecolpro-communication.png
echo "Communication page loaded."

echo ""
echo "=== 8. Console errors check ==="
$B console --errors

echo ""
echo "=== Tests termines. Screenshots dans /tmp/ecolpro-*.png ==="
echo "Voir les screenshots avec: open /tmp/ecolpro-*.png"
