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
   🔷 «Sparsi e un po' storti, come se fossero veri adesivi attaccati.»

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

   🔒 Le caselle vuote restano SEI e restano al loro posto: lo sparpagliamento
   non cambia quando il foglio arriva, quindi quello che vedi vuoto è
   esattamente dove finirà l'immagine.
   ========================================================================= */

/* ----------------------------------------------------------------------------
   DOVE STA OGNI ADESIVO

   🔶 ERANO UNA FILA ORDINATA, tutti della stessa misura, tutti alla stessa
   altezza, con una pendenza appena accennata. Una fila regolare non legge
   come «attaccati»: legge come «disposti». La differenza fra le due cose non
   è la pendenza — è che in una fila regolare si vede la griglia sotto.

   Quindi variano tre cose insieme, perché una sola non basta:
   • la POSIZIONE, sparsa lungo la fascia bassa e a cavallo dei bordi
   • la MISURA, perché adesivi tutti uguali restano una collezione
   • l'INCLINAZIONE, abbastanza da vedersi

   🔒 MA È UNA TABELLA, NON UN SORTEGGIO. Numeri a caso vorrebbero dire adesivi
   che saltano a ogni render — un movimento che nessuno ha chiesto, e nessun
   modo di dire «quello lì a sinistra» perché la volta dopo non c'è più. Sono
   sparsi una volta sola, e restano dove sono.

   ⚠️ TUTTI NELLA METÀ BASSA, e non per timidezza: sopra c'è la faccia della
   creatura, ed è la cosa che questa schermata esiste per far vedere. Un
   adesivo su un occhio è un adesivo che copre il prodotto. `verify:features`
   legge questi numeri e si arrabbia se uno passa il 50%.

   `left` e `bottom` possono uscire dai bordi, ed è voluto: un adesivo che
   sborda è stato attaccato lì, uno allineato dentro è una didascalia.
   -------------------------------------------------------------------------- */

interface Piazzamento {
  /** Da sinistra, in percentuale della foto. Fuori dai bordi è voluto. */
  left: string;
  /** Dal fondo. Negativo = a cavallo del bordo di sotto. */
  bottom: string;
  size: number;
  tilt: number;
}

/* 🔶 LE MISURE SONO QUASI RADDOPPIATE, e non per gusto.

   Una cella del foglio è 512×512. A 36 pixel la rimpicciolivo diciassette
   volte: la testa veniva quindici pixel, l'occhio meno di due. E le sei
   espressioni si distinguono per «tratti che si ammorbidiscono», «lettura
   asimmetrica», «spento» — differenze del volto, che sotto una certa misura
   non esistono proprio. Erano sei macchie colorate uguali.

   Da 56 a 80 la riduzione scende a 6–9 volte, cioè meno di quella della
   faccia in chat, e un'espressione si legge. */
const SCATTER: Piazzamento[] = [
  { left: '-5%', bottom: '8%', size: 72, tilt: -13 },
  { left: '15%', bottom: '-5%', size: 60, tilt: 8 },
  { left: '33%', bottom: '9%', size: 80, tilt: -5 },
  { left: '53%', bottom: '-6%', size: 64, tilt: 12 },
  { left: '71%', bottom: '4%', size: 74, tilt: -9 },
  { left: '90%', bottom: '21%', size: 56, tilt: 6 },
];

export function ExpressionStickers({ monName, alt }: { monName: string; alt: string }) {
  const sheet = useAssetUrl(monName, 'reaction_pack');

  return (
    <ul className="stickers" aria-label={`Espressioni di ${alt}`}>
      {EXPRESSIONS.map((e, i) => {
        const col = i % EXPRESSION_SPEC.columns;
        const row = Math.floor(i / EXPRESSION_SPEC.columns);
        const p = SCATTER[i]!;

        return (
          <li
            key={e}
            className={`sticker ${sheet ? '' : 'sticker--empty'}`}
            style={{
              left: p.left,
              bottom: p.bottom,
              width: p.size,
              height: p.size,
              ['--tilt' as string]: `${p.tilt}deg`,
            }}
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
