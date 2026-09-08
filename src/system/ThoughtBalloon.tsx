/* ============================================================================
   IL FUMETTO — l'unica forma con cui VINZ ti parla di sua iniziativa

   🔷 «Mi piace l'estetica di adesso, vorrei che ogni automazione avesse questa
   estetica.»

   Non è una scheda in una lista: è il .mon che ti dice una cosa. Il fumetto con
   il bordo spesso e la codina, la riga in monospazio che dice CHI parla, la
   frase grande, un solo pulsante, e la creatura disegnata accanto.

   🔒 STAVA DENTRO `App.tsx`, LEGATO AGLI INSIGHT. Estratto qui perché adesso lo
   usano due cose diverse — i pensieri delle macchine e i risultati delle
   automazioni — e duplicarlo avrebbe prodotto due estetiche che divergono alla
   prima modifica.

   ⚠️ UNA FRASE, NON UN DOCUMENTO. Il fumetto è tarato su `34ch` e un corpo
   grande: dentro non ci va un digest di cinque notizie, ci va la riga che te lo
   annuncia. Il contenuto lungo vive in chat, dove si legge e si scorre.
   ========================================================================= */

import { useEffect, useRef, type ReactNode } from 'react';

import { EXPRESSION_SPEC } from '@/engine/assets';
import { useApp } from '@/state/store';
import { useAssetUrlChain } from '@/system/AssetSlot';

export function ThoughtBubble({
  kicker,
  statement,
  titleId,
  actionLabel,
  onAction,
}: {
  kicker: string;
  statement: string;
  titleId: string;
  actionLabel?: string;
  onAction?: () => void;
}): ReactNode {
  const activeMonName = useApp((state) => state.activeMonName ?? 'VINZ.MON');
  const art = useAssetUrlChain(activeMonName, ['reaction_pack', 'character_master']);

  return (
    <>
      <div className="machine-insight-balloon__thought">
        <span id={titleId}>{kicker}</span>
        <p>{statement}</p>
        {actionLabel && onAction ? (
          <button type="button" className="machine-insight-balloon__discuss" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="machine-insight-balloon__mon" aria-label={activeMonName}>
        {art.url && art.resolvedType === 'reaction_pack' ? (
          <span
            aria-hidden="true"
            style={{
              backgroundImage: `url(${art.url})`,
              backgroundSize: `${EXPRESSION_SPEC.columns * 100}% ${EXPRESSION_SPEC.rows * 100}%`,
              backgroundPosition: `${100 / (EXPRESSION_SPEC.columns - 1)}% 0%`,
            }}
          />
        ) : art.url ? (
          <img src={art.url} alt="" />
        ) : (
          <strong>{activeMonName}</strong>
        )}
      </div>
    </>
  );
}

/** Il fumetto a schermo intero, con la trappola del focus e la chiusura con Esc. */
export function ThoughtBalloon({
  kicker,
  statement,
  actionLabel,
  onAction,
  onClose,
  titleId = 'thought-balloon-title',
}: {
  kicker: string;
  statement: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
  titleId?: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () =>
      dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
          )
        : [];
    focusable()[0]?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="machine-insight-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="machine-insight-balloon"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button type="button" className="machine-insight-balloon__close" onClick={onClose} aria-label="Chiudi">
          CHIUDI
        </button>
        <ThoughtBubble
          kicker={kicker}
          statement={statement}
          titleId={titleId}
          actionLabel={actionLabel}
          onAction={onAction}
        />
      </section>
    </div>
  );
}
