#!/bin/bash
# Test EcolPro - Appel avec notification automatique
# 1) Initialise les liens élève-parent via API
# 2) Fait l'appel (1 absent, 1 retard, autres présents)
# 3) Vérifie les notifications enregistrées
B="$HOME/.claude/skills/gstack/browse/dist/browse"
BASE="http://localhost:3002"

echo "=== 1. Login admin ==="
$B goto "$BASE/login"
$B wait --networkidle
sleep 1
$B fill 'input[type="email"]' "admin@lycee-demo.ecolpro.app"
$B fill 'input[type="password"]' "Demo@2026!"
$B click 'button[type="submit"]'
$B wait --networkidle
sleep 2
echo "Logged in: $($B url)"

echo ""
echo "=== 2. Initialiser les liens élève-parent ==="
$B goto "$BASE/api/test/setup-links"
$B wait --networkidle
sleep 2
echo "Setup result:"
$B text

echo ""
echo "=== 3. Faire l'appel ==="
$B goto "$BASE/absences/appel"
$B wait --networkidle
sleep 2
$B snapshot -i
$B screenshot /tmp/t4-04-appel.png

# Select first class (1ère L)
echo "Selecting first class (1ère L)..."
$B click 'button:has-text("1ère L")'
sleep 1
$B snapshot -i
$B screenshot /tmp/t4-05-appel-classe.png

# Mark all as present first
echo "Marking all as present..."
$B click 'button:has-text("Tous présents")'
sleep 1

# Mark first student as ABSENT (3rd button in first row = absent)
echo "Marking first student as ABSENT..."
$B click '@e36'
sleep 0.5

# Mark second student as RETARD (2nd button in second row = retard)
echo "Marking second student as RETARD..."
$B click '@e38'
sleep 0.5

$B screenshot /tmp/t4-06-appel-marked.png
echo "Appel state after marking:"
$B snapshot -i

# Submit
echo ""
echo "Submitting appel..."
$B click 'button:has-text("Valider l")'
sleep 5
$B wait --networkidle
$B screenshot /tmp/t4-07-appel-result.png
echo "Result after submit:"
$B snapshot -i
echo "Console errors:"
$B console --errors
echo "Network (POST only):"
$B network | grep POST

echo ""
echo "=== 4. Vérifier notifications dans Communication ==="
$B goto "$BASE/communication"
$B wait --networkidle
sleep 2
$B snapshot -i
$B screenshot /tmp/t4-08-communication.png
echo "Communication - notifications:"
$B text | head -40

echo ""
echo "=== 5. Vérifier absences enregistrées ==="
$B goto "$BASE/absences"
$B wait --networkidle
sleep 2
$B snapshot -i
$B screenshot /tmp/t4-09-absences.png
echo "Absences page:"
$B text | head -30

echo ""
echo "=== Screenshots: /tmp/t4-*.png ==="
