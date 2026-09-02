/**
 * SchoolPro — Domaine métier pur
 * ============================================================
 *
 * Ce dossier contient la logique métier PURE, sans aucune dépendance
 * à l'infrastructure (Prisma, Next.js, Supabase, Redis, etc.).
 *
 * Règle non négociable n°7 (AGENTS.md) :
 *   « Le domaine métier est pur — aucun import de Prisma dans src/lib/domain/ »
 *
 * Inspiré de GOSE 2.0 (architecture hexagonale) :
 *   src/Domain/ ne contient aucun `use Doctrine\` ni `use Symfony\`.
 *
 * AVANTAGES :
 *   1. Testable sans mocker Prisma — plus rapide, plus fiable
 *   2. Changement d'ORM possible sans réécrire la logique
 *   3. La logique métier est centralisée, pas dispersée dans les routes API
 *   4. Les règles de calcul (notes, moyennes, rangs) sont auditable
 *
 * CE QUE LE DOMAINE CONTIENT :
 *   - note.ts : classe Note (centièmes entiers), calculs de moyennes, rangs
 *   - scoped-where.ts : construction de filtres Prisma avec tenantId + année
 *
 * CE QUE LE DOMAINE NE CONTIENT PAS :
 *   - Aucun `import { PrismaClient } from "@prisma/client"`
 *   - Aucun `import prisma from "@/lib/prisma"`
 *   - Aucun accès à la base de données
 *   - Aucun import de Next.js (next/headers, next/server, etc.)
 *   - Aucun import de Supabase
 *
 * Les fonctions du domaine reçoivent des données en entrée et retournent
 * des résultats. L'infrastructure (routes API, server components) est
 * responsable de lire/écrire en base et d'appeler le domaine.
 */

// Barrel export pour faciliter les imports
export {
  Note,
  calculerMoyennePondereeCentiemes,
  calculerRangsCentiemes,
  apprecierCentiemes,
} from "./note";

export {
  scopedWhere,
  scopedWhereAnnee,
  modeleFiltrableParAnnee,
  MODELES_TENANT_SCOPES,
} from "./scoped-where";
