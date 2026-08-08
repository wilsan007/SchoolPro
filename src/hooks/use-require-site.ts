"use client";

import { useState, useCallback } from "react";

interface SiteOption {
  id: string;
  nom: string;
  code?: string | null;
}

interface UseRequireSiteOptions {
  sites: SiteOption[];
  currentSiteId: string | null | undefined;
  tenantHasSites?: boolean;
}

interface UseRequireSiteResult {
  /** Si true, un site est requis mais non sélectionné — afficher le modal. */
  needsSite: boolean;
  /** Le modal est-il ouvert. */
  modalOpen: boolean;
  /** Ouvrir manuellement le modal. */
  openModal: () => void;
  /** Fermer le modal. */
  closeModal: () => void;
  /** Vérifier avant une action de création. Retourne true si bloqué. */
  checkBeforeCreate: () => boolean;
}

/**
 * Hook pour exiger la sélection d'un site avant une création.
 *
 * Usage dans une page client:
 * ```tsx
 * const { needsSite, modalOpen, closeModal, checkBeforeCreate } = useRequireSite({
 *   sites,
 *   currentSiteId: session.user.siteId,
 *   tenantHasSites: session.user.tenantHasSites,
 * });
 *
 * function handleCreate() {
 *   if (checkBeforeCreate()) return; // modal s'ouvre, action bloquée
 *   // ... procéder à la création
 * }
 * ```
 */
export function useRequireSite({
  sites,
  currentSiteId,
  tenantHasSites,
}: UseRequireSiteOptions): UseRequireSiteResult {
  const [modalOpen, setModalOpen] = useState(false);

  const needsSite = Boolean(
    tenantHasSites &&
      sites.length > 1 &&
      !currentSiteId
  );

  const checkBeforeCreate = useCallback(() => {
    if (needsSite) {
      setModalOpen(true);
      return true;
    }
    return false;
  }, [needsSite]);

  const openModal = useCallback(() => setModalOpen(true), []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  return {
    needsSite,
    modalOpen,
    openModal,
    closeModal,
    checkBeforeCreate,
  };
}
