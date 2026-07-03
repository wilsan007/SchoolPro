#!/bin/bash
# Test EcolPro - Actions reelles (messagerie, notification, appel)
# Usage: bash run-tests-v2.sh

B="$HOME/.claude/skills/gstack/browse/dist/browse"
BASE="http://localhost:3002"

echo "=== 1. Login admin ==="
$B goto "$BASE/login"
$B wait --networkidle
$B fill 'input[type="email"]' "admin@lycee-demo.ecolpro.app"
$B fill 'input[type="password"]' "Demo@2026!"
$B click 'button[type="submit"]'
$B wait --networkidle
sleep 2
$B url
$B screenshot /tmp/v2-01-login.png

echo ""
echo "=== 2. Parametres - Ajouter enseignant ==="
$B goto "$BASE/parametres"
$B wait --networkidle
sleep 1
$B snapshot -i
# Click "Ajouter un utilisateur" button
$B click 'button:has-text("Ajouter")'
sleep 2
$B snapshot -i
$B screenshot /tmp/v2-02-add-form.png

# Fill the form
$B fill 'input#name' "Awa Diallo"
sleep 0.5
$B fill 'input#email' "awa.diallo@lycee-demo.ecolpro.app"
sleep 0.5
$B select 'select#role' "TEACHER"
sleep 0.5
$B fill 'input#phone' "771234567"
sleep 0.5
$B fill 'input#password' "Demo@2026!"
sleep 0.5
$B screenshot /tmp/v2-03-form-filled.png

# Submit
echo "Submitting teacher form..."
$B click 'button[type="submit"]'
sleep 3
$B screenshot /tmp/v2-04-teacher-result.png
$B console --errors
echo "Network errors:"
$B network

echo ""
echo "=== 3. Ajouter parent ==="
$B snapshot -i
$B click 'button:has-text("Ajouter")'
sleep 2
$B fill 'input#name' "Fatou Ndiaye"
sleep 0.5
$B fill 'input#email' "fatou.ndiaye@lycee-demo.ecolpro.app"
sleep 0.5
$B select 'select#role' "PARENT"
sleep 0.5
$B fill 'input#phone' "779876543"
sleep 0.5
$B fill 'input#password' "Demo@2026!"
sleep 0.5
$B screenshot /tmp/v2-05-parent-form.png
echo "Submitting parent form..."
$B click 'button[type="submit"]'
sleep 3
$B screenshot /tmp/v2-06-parent-result.png
$B console --errors

echo ""
echo "=== 4. Messagerie - Creer une conversation ==="
$B goto "$BASE/messages"
$B wait --networkidle
sleep 2
$B snapshot -i
$B screenshot /tmp/v2-07-messages.png

# Click "Nouveau message" or "Nouvelle conversation"
echo "Clicking new conversation button..."
$B click 'button:has-text("Nouveau")'
sleep 2
$B snapshot -i
$B screenshot /tmp/v2-08-new-conv.png

# Check if a modal/form appeared
echo "Modal content:"
$B text

# Try to fill subject if field exists
$B fill 'input[placeholder*="ujet"]' "Test notification absence" 2>/dev/null || true
$B fill 'input[placeholder*="titre"]' "Test notification absence" 2>/dev/null || true
$B fill 'textarea' "Bonjour, votre enfant a ete absent aujourd'hui. Merci de justifier cette absence." 2>/dev/null || true
sleep 1
$B screenshot /tmp/v2-09-conv-filled.png

# Try to select a recipient (click first option in any dropdown/list)
$B click 'select' 2>/dev/null || true
sleep 1
$B snapshot -i

# Submit the form
$B click 'button:has-text("Envoyer")' 2>/dev/null || true
$B click 'button:has-text("Créer")' 2>/dev/null || true
$B click 'button[type="submit"]' 2>/dev/null || true
sleep 3
$B screenshot /tmp/v2-10-conv-result.png
$B console --errors

echo ""
echo "=== 5. Communication - Envoyer une notification ==="
$B goto "$BASE/communication"
$B wait --networkidle
sleep 2
$B snapshot -i
$B screenshot /tmp/v2-11-communication.png

# Click "Créer le premier message" or "Nouveau message"
echo "Clicking create message..."
$B click 'button:has-text("Créer")' 2>/dev/null || true
$B click 'button:has-text("Nouveau")' 2>/dev/null || true
sleep 2
$B snapshot -i
$B screenshot /tmp/v2-12-comm-form.png
echo "Form content:"
$B text

# Fill notification form
$B fill 'input[name="titre"]' "Notification d'absence" 2>/dev/null || true
$B fill 'input[placeholder*="titre"]' "Notification d'absence" 2>/dev/null || true
$B fill 'input[placeholder*="ujet"]' "Notification d'absence" 2>/dev/null || true
$B fill 'textarea' "Chers parents, votre enfant a ete absent en cours aujourd'hui. Merci de bien vouloir justifier cette absence dans les plus brefs delais." 2>/dev/null || true
sleep 1
$B screenshot /tmp/v2-13-comm-filled.png

# Try to select channel and target
$B click 'button:has-text("Email")' 2>/dev/null || true
$B click 'button:has-text("SMS")' 2>/dev/null || true
$B click 'button:has-text("In-App")' 2>/dev/null || true
$B click 'button:has-text("Parent")' 2>/dev/null || true
$B click 'button:has-text("Tous")' 2>/dev/null || true
sleep 1

# Submit
$B click 'button:has-text("Envoyer")' 2>/dev/null || true
$B click 'button:has-text("Créer")' 2>/dev/null || true
$B click 'button[type="submit"]' 2>/dev/null || true
sleep 3
$B screenshot /tmp/v2-14-comm-result.png
$B console --errors

echo ""
echo "=== 6. Absences - Faire l'appel ==="
$B goto "$BASE/absences"
$B wait --networkidle
sleep 2
$B snapshot -i
# Click "Faire l'appel"
echo "Clicking 'Faire l'appel'..."
$B click '@e26' 2>/dev/null || $B click 'a:has-text("Faire")' 2>/dev/null || true
sleep 2
$B wait --networkidle
$B snapshot -i
$B screenshot /tmp/v2-15-appel.png
echo "Appel page content:"
$B text

echo ""
echo "=== 7. Verifier les erreurs ==="
$B console --errors
$B network

echo ""
echo "=== Screenshots: /tmp/v2-*.png ==="
echo "Voir: open /tmp/v2-*.png"
