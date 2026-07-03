#!/bin/bash
# Test EcolPro v3 - Actions reelles avec selecteurs precis
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
echo "URL: $($B url)"

echo ""
echo "=== 2. Parametres - Ajouter enseignant ==="
$B goto "$BASE/parametres"
$B wait --networkidle
sleep 2
# Click the "Utilisateurs" tab
$B snapshot -i
# Find and click the "Ajouter un utilisateur" button
$B click 'button:has-text("Ajouter un utilisateur")'
sleep 2
$B snapshot -i
# Fill form - use ID selectors
$B fill '#name' "Awa Diallo"
sleep 0.3
$B fill '#email' "awa.diallo@lycee-demo.ecolpro.app"
sleep 0.3
$B select '#role' "TEACHER"
sleep 0.3
$B fill '#phone' "771234567"
sleep 0.3
$B fill '#password' "Demo@2026!"
sleep 0.5
$B screenshot /tmp/v3-01-teacher-form.png
echo "Submitting teacher..."
$B click 'button[type="submit"]'
sleep 4
$B screenshot /tmp/v3-02-teacher-result.png
echo "Console errors:"
$B console --errors
echo "Network (POST only):"
$B network | grep POST

echo ""
echo "=== 3. Ajouter parent ==="
$B click 'button:has-text("Ajouter un utilisateur")'
sleep 2
$B fill '#name' "Fatou Ndiaye"
sleep 0.3
$B fill '#email' "fatou.ndiaye@lycee-demo.ecolpro.app"
sleep 0.3
$B select '#role' "PARENT"
sleep 0.3
$B fill '#phone' "779876543"
sleep 0.3
$B fill '#password' "Demo@2026!"
sleep 0.5
$B screenshot /tmp/v3-03-parent-form.png
echo "Submitting parent..."
$B click 'button[type="submit"]'
sleep 4
$B screenshot /tmp/v3-04-parent-result.png
echo "Console errors:"
$B console --errors

echo ""
echo "=== 4. Messagerie - Creer conversation ==="
$B goto "$BASE/messages"
$B wait --networkidle
sleep 2
$B snapshot -i
$B screenshot /tmp/v3-05-messages.png
# Click "Nouveau message" button
$B click 'button:has-text("Nouveau message")'
sleep 2
$B snapshot -i
$B screenshot /tmp/v3-06-new-conv-modal.png
# The modal has a search input and user list buttons
# Fill the search to find users
$B fill 'input[placeholder* "Nom ou r"]' "Awa"
sleep 1
$B snapshot -i
$B screenshot /tmp/v3-07-conv-search.png
# Click the first user button in the list (type="button" inside the list)
$B click 'button[type="button"]:has-text("Awa")'
sleep 1
# Fill subject
$B fill 'input[placeholder* "ujet"]' "Test absence eleve"
sleep 0.3
# Fill message - find textarea
$B fill 'textarea' "Bonjour, votre enfant a ete absent aujourd'hui. Merci de justifier cette absence."
sleep 0.5
$B screenshot /tmp/v3-08-conv-filled.png
echo "Submitting conversation..."
$B click 'button[type="submit"]'
sleep 3
$B screenshot /tmp/v3-09-conv-result.png
echo "Console errors:"
$B console --errors
echo "Network (POST only):"
$B network | grep POST

echo ""
echo "=== 5. Communication - Envoyer notification ==="
$B goto "$BASE/communication"
$B wait --networkidle
sleep 2
$B snapshot -i
$B screenshot /tmp/v3-10-comm.png
# Click "Créer le premier message" or "Nouveau message"
$B click 'button:has-text("Créer")'
sleep 2
$B snapshot -i
$B screenshot /tmp/v3-11-comm-modal.png
# Fill titre
$B fill 'input[placeholder* "Ex"]' "Notification d absence"
sleep 0.3
# Fill contenu
$B fill 'textarea[placeholder* "Saisissez"]' "Chers parents, votre enfant a ete absent en cours aujourd hui. Merci de justifier cette absence."
sleep 0.5
# Select canal SMS
$B click 'button:has-text("SMS")'
sleep 0.3
# Select cible PARENTS
$B click 'button:has-text("Parents")'
sleep 0.5
$B screenshot /tmp/v3-12-comm-filled.png
echo "Submitting notification..."
$B click 'button:has-text("Envoyer maintenant")'
sleep 5
$B screenshot /tmp/v3-13-comm-result.png
echo "Console errors:"
$B console --errors
echo "Network (POST only):"
$B network | grep POST

echo ""
echo "=== 6. Absences - Faire l appel ==="
$B goto "$BASE/absences"
$B wait --networkidle
sleep 2
$B snapshot -i
# Click "Faire l'appel" link
$B click 'a:has-text("Faire l")'
sleep 3
$B wait --networkidle
$B snapshot -i
$B screenshot /tmp/v3-14-appel.png
echo "Appel page:"
$B text

echo ""
echo "=== 7. Resume final ==="
echo "Console errors:"
$B console --errors
echo ""
echo "Screenshots: /tmp/v3-*.png"
