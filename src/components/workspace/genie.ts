/**
 * Effet Genie — approximation CSS/JS de l'animation "Genie" de macOS.
 *
 * Au minimise : la fenêtre se déforme et se "fait aspirer" vers le dock.
 * Au restore : animation inverse, la fenêtre "jaillit" du dock.
 *
 * Implémentation : requestAnimationFrame + clip-path polygon + transform scale.
 * Le clip-path crée le rétrécissement asymétrique (plus prononcé du côté du dock).
 */

interface GenieOptions {
  duration?: number;
  reverse?: boolean;
}

/**
 * Anime un élément de sa position actuelle vers une cible (dock item)
 * avec une déformation de type genie.
 *
 * @param sourceEl L'élément DOM de la fenêtre à animer
 * @param targetRect La position cible (dock item)
 * @param options Durée et sens de l'animation
 * @returns Promise résolu à la fin de l'animation
 */
export function genieEffect(
  sourceEl: HTMLElement,
  targetRect: DOMRect,
  options: GenieOptions = {}
): Promise<void> {
  const { duration = 650, reverse = false } = options;

  return new Promise<void>((resolve) => {
    const rect = sourceEl.getBoundingClientRect();

    // Cloner l'élément source pour l'animation
    const clone = sourceEl.cloneNode(true) as HTMLElement;
    clone.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      margin: 0;
      padding: 0;
      z-index: 99999;
      pointer-events: none;
      overflow: hidden;
      transform-origin: bottom center;
      transition: none;
      will-change: transform, clip-path, opacity, border-radius;
    `;
    // Supprimer les IDs pour éviter les doublons
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    document.body.appendChild(clone);

    // Masquer la source pendant l'animation (sauf en reverse où on la révèle à la fin)
    if (!reverse) {
      sourceEl.style.visibility = "hidden";
    }

    // Position de départ (centre de la fenêtre)
    const startX = rect.left;
    const startY = rect.top;
    const startW = rect.width;
    const startH = rect.height;

    // Position cible (centre du dock item)
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const endW = Math.max(targetRect.width, 50);
    const endH = Math.max(targetRect.height, 36);

    // Position finale du coin haut-gauche du clone rétréci
    const endX = targetCenterX - endW / 2;
    const endY = targetCenterY - endH / 2;

    const startTime = performance.now();

    function frame(now: number) {
      const elapsed = now - startTime;
      let t = Math.min(elapsed / duration, 1);

      // En reverse, on va de 1 → 0
      if (reverse) t = 1 - t;

      // Easing : ease-in pour minimise (accélération), ease-out pour restore
      const eased = reverse
        ? 1 - Math.pow(1 - t, 2.5)
        : Math.pow(t, 2.2);

      // Interpolation position/taille
      const x = startX + (endX - startX) * eased;
      const y = startY + (endY - startY) * eased;
      const w = startW + (endW - startW) * eased;
      const h = startH + (endH - startH) * eased;

      const scaleX = w / startW;
      const scaleY = h / startH;

      // Transformer depuis le coin haut-gauche
      const translateX = x - startX;
      const translateY = y - startY;

      clone.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;

      // clip-path genie : rétrécissement asymétrique
      // Le côté proche du dock (bas) se rétrécit plus vite
      const narrow = eased * 0.42;
      const topInset = narrow * 80;
      const midInset = narrow * 55;
      const bottomInset = narrow * 48;

      clone.style.clipPath = `polygon(
        ${topInset}% 0%,
        ${100 - topInset}% 0%,
        ${100 - midInset}% 50%,
        ${100 - bottomInset}% 100%,
        ${bottomInset}% 100%,
        ${midInset}% 50%
      )`;

      // Border radius pour l'effet blob
      clone.style.borderRadius = `${eased * 14}px`;

      // Blur léger pour l'effet liquide
      clone.style.filter = `blur(${eased * 1.2}px)`;

      // Opacity : fade subtil en fin de minimise
      clone.style.opacity = String(1 - eased * 0.15);

      if (t < 1 && t > 0) {
        requestAnimationFrame(frame);
      } else if (reverse && t <= 0) {
        // Restore terminé
        clone.remove();
        sourceEl.style.visibility = "";
        resolve();
      } else if (!reverse && t >= 1) {
        // Minimise terminé
        clone.remove();
        resolve();
      } else {
        // Sécurité : terminer
        clone.remove();
        if (reverse) sourceEl.style.visibility = "";
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}
