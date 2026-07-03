-- Migration: Ajout du champ telegramChatId sur la table parents
-- Permet d'envoyer des notifications Telegram aux parents

ALTER TABLE "parents" ADD COLUMN "telegramChatId" TEXT;
