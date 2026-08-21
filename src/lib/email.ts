/**
 * EcolPro — Normalisation des adresses e-mail
 * ===========================================
 * PostgreSQL compare les chaînes de caractères octet par octet. Une adresse
 * enregistrée « Nom.Prenom@domaine.com » est donc introuvable pour quiconque
 * saisit « nom.prenom@domaine.com » — et le formulaire de connexion répond
 * « Identifiants invalides » alors que le compte existe et qu'il est actif.
 *
 * C'est exactement ce qui a bloqué la connexion en production : les comptes
 * créés avec une majuscule initiale (`Mohamed.abdi…`, `Ilyasadendjama…`)
 * n'étaient joignables par personne, tandis que ceux stockés en minuscules
 * fonctionnaient. La trace était visible dans `audit_logs` sous la forme
 * « Utilisateur introuvable » pour des adresses pourtant présentes en base.
 *
 * Règle : **toute adresse est normalisée en minuscules avant d'être stockée
 * ou recherchée.** La partie locale d'une adresse est certes sensible à la
 * casse selon la RFC 5321, mais aucun fournisseur de messagerie courant ne
 * l'exploite, et la robustesse de la connexion prime ici.
 */
export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase();
}
