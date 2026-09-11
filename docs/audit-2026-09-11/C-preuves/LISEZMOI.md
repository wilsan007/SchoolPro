# Preuves par exécution

Ces deux tests **échouent sur le commit `4976316`** : c'est ce qui prouve les défauts. Une fois les corrections faites, ils doivent passer et rester dans la suite comme tests de régression.

| Test | Défaut prouvé | Résultat sur HEAD |
|---|---|---|
| `impersonation-escalation.test.ts` | AUTH-C1 : un `POST /api/auth/session` forgé bascule le jeton sur un autre tenant | `expected 'tenant-VICTIME' to be 'tenant-A'` |
| `relances-cron.test.ts` | AUT-C1 + MET-H4 : 12 passages du cron dans l'heure | `expected 12 to be 1` (niveaux 1 → 2 → 3 en 10 minutes) |

## Exécution

Copier les trois fichiers dans le dépôt (les tests dans `tests/unit/`, la configuration à la racine), puis :

```bash
pnpm exec vitest run --config vitest.poc.config.mts
```

`vitest.poc.config.mts` est nécessaire pour le premier test : il inline `next-auth` et `@auth/core` (sans quoi Vitest ne résout pas `next/server`) et s'exécute en environnement `node`.

> Ces fichiers décrivent une faille non corrigée. Ne les versionner qu'avec, ou après, le correctif AUTH-1.
