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

/* ============================================================================
   GLI ADESIVI DELLE ESPRESSIONI (§23.1)

   🔷 «Sulla foto, adesivi attaccati delle varie espressioni, come se fosse
      sticker, in basso.»

   Le sei espressioni sono già un asset — l'EXPRESSION SHEET, griglia 3×2 — e
   fino a oggi si vedevano una alla volta, in testa alla chat, quella che
   serviva in quel momento. Tutte insieme sul bordo della foto sono un'altra
   cosa: non «come sta adesso», ma **di quante facce è capace**.

   ⚠️ QUANDO IL FOGLIO NON C'È, GLI ADESIVI RESTANO VUOTI, E NON È UN RIPIEGO.
   `MonFace` da solo ripiegherebbe sul ritratto: sei adesivi con SEI VOLTE LA
   STESSA FACCIA, che è peggio di sei caselle vuote — dice una bugia sul
   contenuto invece di dire che manca. §18A vieta di inventare arte, e sei
   copie di un'immagine spacciate per sei espressioni diverse sono arte
   inventata anche se ogni singolo pixel è vero.

   🔒 Le caselle vuote restano SEI e restano al loro posto: la fila non cambia
   forma quando il foglio arriva, quindi quello che vedi vuoto è esattamente
   dove finirà l'immagine.
   ========================================================================= */

export function ExpressionStickers({ monName, alt }: { monName: string; alt: string }) {
  const sheet = useAssetUrl(monName, 'reaction_pack');

  return (
    <ul className="stickers" aria-label={`Espressioni di ${alt}`}>
      {EXPRESSIONS.map((e, i) => {
        const col = i % EXPRESSION_SPEC.columns;
        const row = Math.floor(i / EXPRESSION_SPEC.columns);
        /* L'inclinazione viene dalla POSIZIONE, non dal caso: gli adesivi
           stanno storti sempre allo stesso modo a ogni apertura. Uno storto a
           caso a ogni render sarebbe un'animazione che nessuno ha chiesto. */
        const tilt = [-7, 4, -3, 6, -5, 3][i];

        return (
          <li
            key={e}
            className={`sticker ${sheet ? '' : 'sticker--empty'}`}
            style={{ ['--tilt' as string]: `${tilt}deg` }}
            title={sheet ? e.toLowerCase() : `${e.toLowerCase()} — non ancora disponibile`}
          >
            {sheet ? (
              <span
                className="sticker__art"
                role="img"
                aria-label={`${alt}, ${e.toLowerCase()}`}
                style={{
                  backgroundImage: `url(${sheet})`,
                  backgroundSize: `${EXPRESSION_SPEC.columns * 100}% ${EXPRESSION_SPEC.rows * 100}%`,
                  backgroundPosition: `${(col * 100) / (EXPRESSION_SPEC.columns - 1)}% ${
                    (row * 100) / (EXPRESSION_SPEC.rows - 1)
                  }%`,
                }}
              />
            ) : (
              <span className="sr-only">{`${e.toLowerCase()} — non ancora disponibile`}</span>
            )}
          </li>
        );
      })}
    </ul>
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
