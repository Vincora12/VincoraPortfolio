/* ============================================================================
   IL .MON VIVO — sprite di riposo ed espressioni (MASTER SPEC v1.9 §23.1)

   Due componenti, un solo principio: **il .mon deve sembrare presente, non
   disegnato.** Un'illustrazione ferma in testa alla chat è un'icona; la stessa
   illustrazione che respira e cambia faccia quando risponde è qualcuno.

   🔒 §18A resta valido: se l'asset manca NON si inventa arte. Ma «non inventare
   arte» non vuol dire «stare fermi»: senza sprite si anima ciò che c'è già —
   il Character Master respira col solo trasformarsi, e il segnaposto tecnico
   resta un segnaposto tecnico. Non si disegna niente che non ci sia.

   Perché due componenti e non uno:
   • `IdleMon` è il corpo intero che respira — schermata d'ingresso.
   • `MonFace` è il busto che cambia espressione — testa della chat.
   Sono due asset diversi (`idle_animation`, `reaction_pack`) con due griglie
   diverse, e mescolarli produrrebbe un componente che non sa cosa sta facendo.
   ========================================================================= */

import { AssetSlot, useAssetUrl } from './AssetSlot';
import {
  EXPRESSION_SPEC,
  EXPRESSIONS,
  IDLE_SPEC,
  type Expression,
} from '../engine/assets';

/* --- Corpo intero che respira ---------------------------------------------- */

export function IdleMon({
  monName,
  alt,
  /**
   * ⚠️ FERMA, SENZA RESPIRO NÉ CICLO.
   *
   * 🔷 «Non farlo fluttuare, tienilo fisso.»
   *
   * Sulla schermata di casa il movimento serve: una creatura ferma lì è un
   * ritaglio. Sulla SCHEDA no — è il documento della creatura, e una cosa che
   * si guarda per leggerla non deve muoversi mentre la leggi. Sono due usi
   * diversi della stessa immagine, e per questo è un parametro e non una
   * regola globale.
   */
  still = false,
}: {
  monName: string;
  alt: string;
  still?: boolean;
}) {
  const strip = useAssetUrl(monName, 'idle_animation');

  // Con lo sprite: animazione a passi, un frame per passo. `steps()` è
  // l'unico modo di far scattare un background senza interpolare fra i frame.
  if (strip && !still) {
    return (
      <span
        className="idlemon idlemon--sprite"
        role="img"
        aria-label={alt}
        style={{
          backgroundImage: `url(${strip})`,
          backgroundSize: `${IDLE_SPEC.frames * 100}% 100%`,
          animationDuration: `${(IDLE_SPEC.frames * 2) / IDLE_SPEC.fps}s`,
          ['--idle-frames' as string]: IDLE_SPEC.frames,
          ['--idle-step' as string]: `${100 / (IDLE_SPEC.frames - 1)}%`,
        }}
      />
    );
  }

  // Senza sprite: il master respira. Nessun disegno inventato, solo il
  // movimento che l'asset porterebbe.
  return (
    <span className={still ? 'idlemon' : 'idlemon idlemon--breathing'}>
      <AssetSlot monName={monName} type="character_master" alt={alt} className="idlemon__art" />
    </span>
  );
}

/* --- Busto che cambia espressione ------------------------------------------ */

export function MonFace({
  monName,
  expression,
  alt,
  size = 44,
}: {
  monName: string;
  expression: Expression;
  alt: string;
  size?: number;
}) {
  const sheet = useAssetUrl(monName, 'reaction_pack');
  const index = EXPRESSIONS.indexOf(expression);

  if (sheet && index >= 0) {
    // Griglia 3×2: la posizione percentuale di un riquadro in un background
    // ingrandito di (colonne × righe) si calcola sulle celle-1, non sulle celle.
    const col = index % EXPRESSION_SPEC.columns;
    const row = Math.floor(index / EXPRESSION_SPEC.columns);
    return (
      <span
        className="monface monface--sheet"
        role="img"
        aria-label={`${alt}, ${expression.toLowerCase()}`}
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${sheet})`,
          backgroundSize: `${EXPRESSION_SPEC.columns * 100}% ${EXPRESSION_SPEC.rows * 100}%`,
          backgroundPosition: `${(col * 100) / (EXPRESSION_SPEC.columns - 1)}% ${
            (row * 100) / (EXPRESSION_SPEC.rows - 1)
          }%`,
        }}
      />
    );
  }

  /* Senza foglio: solo il ritratto.

     🔷 v1.10 — qui sotto c'era `expression.slice(0, 3)`, che stampava NEU,
     AMU, ALE accanto a ogni battuta. Era pensato come una dichiarazione
     onesta di cosa mancava, ma nella pratica era una sigla di debug nel punto
     più intimo del prodotto: nessuno può sapere cosa vuol dire «ALE», e
     quando l'immagine arriverà non servirà comunque a niente. L'espressione
     resta nel `title`, dove non disturba e resta ispezionabile. */
  return (
    <span
      className="monface monface--fallback"
      style={{ width: size, height: size }}
      title={`${alt} — ${expression.toLowerCase()}`}
    >
      <AssetSlot
        monName={monName}
        type="profile_portrait"
        fallbackTypes={['character_master']}
        alt={alt}
        fit="cover"
        compactPlaceholder
      />
    </span>
  );
}
