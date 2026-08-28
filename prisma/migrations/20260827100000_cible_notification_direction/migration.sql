-- Ajout de la cible DIRECTION pour les notifications destinées
-- aux membres de la direction (TENANT_ADMIN + PRINCIPAL).
ALTER TYPE "CibleNotification" ADD VALUE 'DIRECTION';
