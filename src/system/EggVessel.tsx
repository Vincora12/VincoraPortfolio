/* ============================================================================
   L'UOVO CHE CAMBIA (MASTER SPEC v1.10 §7.3)

   🔷 «L'uovo giorno per giorno si riempie, così vedi che cambia, e poi si
   schiude.»

   Il problema che risolve: l'incubazione chiedeva sette giorni di racconto e
   ne restituiva un numero e una barra a segmenti. Il numero non si sente
   addosso. Un guscio che si incrina davanti a te sì.

   ⚠️ IL VINCOLO CHE COMANDA TUTTO IL DISEGNO — §12/01 vieta di anticipare la
   forma futura. Quindi qui NON si può disegnare una sagoma: niente profilo,
   niente occhi, niente ali che si intravedono. Quello che cresce dentro è una
   MASSA, e deve restare illeggibile come figura. Se un giorno qualcuno guarda
   questo componente e riconosce una creatura, il componente è rotto.

   Cosa cambia, allora, e perché regge lo stesso:

   1. LE CREPE. Una per ogni giorno sincronizzato, in posizioni fisse e
      deterministiche. È il progresso, disegnato: la barra a segmenti diceva
      la stessa cosa e viene tolta.
   2. LA MASSA DENTRO. Guadagna presenza — mai forma. Al primo giorno è un
      alone, al settimo è densa e occupa il guscio.
   3. IL RESPIRO. Il periodo si accorcia man mano: lento e sordo all'inizio,
      corto e presente alla fine. È l'unica cosa che dice «è vivo» senza
      mostrare cosa.
   4. LO SCATTO. Quando arriva una crepa nuova, il guscio ha un sussulto —
      una volta sola, non un ciclo. Chiudere la giornata deve *vedersi*.

   Tutto è SVG generato: nessun asset, nessuna arte inventata (§18A).
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';

/** Le crepe non sono casuali a ogni render: la stessa partita fa lo stesso uovo. */
function crackPaths(total: number): { d: string; length: number }[] {
  /* Posizioni scelte a mano, non estratte: devono nascere dall'alto e scendere,
     come si romperebbe davvero un guscio, e non devono mai incrociarsi in modo
     da chiudere una forma leggibile. L'ordine è l'ordine in cui compaiono. */
  const SEGMENTS = [
    'M50 16 L54 27 L49 34',
    'M54 27 L63 31 L67 40',
    'M49 34 L41 41 L43 52',
    'M67 40 L70 52 L64 60',
    'M43 52 L35 58 L38 68',
    'M64 60 L58 70 L60 79',
    'M38 68 L47 74 L45 84',
  ];
  return SEGMENTS.slice(0, total).map((d) => ({ d, length: 40 }));
}

export function EggVessel({
  /** 0–1: quanti giorni sincronizzati su quelli che servono. */
  progress,
  /** Quanti giorni sono stati chiusi. Decide il numero di crepe. */
  days,
  total,
  size = 200,
}: {
  progress: number;
  days: number;
  total: number;
  size?: number;
}) {
  const cracks = crackPaths(Math.min(days, 7));
  const ready = days >= total;

  /* Lo scatto quando arriva una crepa: si arma sul cambio di `days` e si
     disarma da sé. Senza questo il guscio cambierebbe fra un fotogramma e
     l'altro, cioè non si vedrebbe cambiare affatto. */
  const [jolt, setJolt] = useState(false);
  const previous = useRef(days);
  useEffect(() => {
    if (days > previous.current) {
      setJolt(true);
      const id = window.setTimeout(() => setJolt(false), 700);
      return () => window.clearTimeout(id);
    }
    previous.current = days;
    return undefined;
  }, [days]);
  useEffect(() => {
    previous.current = days;
  }, [days]);

  // Il respiro accelera avvicinandosi: 5.2s al primo giorno, 2.4s all'ultimo.
  const breath = 5.2 - progress * 2.8;

  return (
    <div
      className={`egg ${jolt ? 'egg--jolt' : ''} ${ready ? 'egg--ready' : ''}`}
      style={{ width: size, height: size, ['--egg-breath' as string]: `${breath}s` }}
      role="img"
      aria-label={
        ready
          ? 'Il guscio è pieno di crepe: è pronto.'
          : `Guscio con ${days} ${days === 1 ? 'crepa' : 'crepe'} su ${total}.`
      }
    >
      <svg viewBox="0 0 100 108" className="egg__svg">
        {/* La massa dentro. Due aloni sfalsati: da vicino non è niente, da
            lontano è qualcosa che occupa spazio. Mai una sagoma. */}
        <defs>
          <radialGradient id="egg-mass" cx="50%" cy="62%" r="52%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
            <stop offset="55%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <clipPath id="egg-clip">
            <path d="M50 4c22 0 34 27 34 50a34 34 0 0 1-68 0C16 31 28 4 50 4z" />
          </clipPath>
        </defs>

        <g clipPath="url(#egg-clip)" className="egg__inside">
          <ellipse
            cx="50"
            cy="66"
            rx={20 + progress * 22}
            ry={18 + progress * 22}
            fill="url(#egg-mass)"
            style={{ opacity: 0.15 + progress * 0.85 }}
          />
          <ellipse
            cx="43"
            cy="58"
            rx={10 + progress * 14}
            ry={9 + progress * 13}
            fill="url(#egg-mass)"
            style={{ opacity: 0.1 + progress * 0.5 }}
          />
        </g>

        {/* Il guscio. Sempre lo stesso: è la cosa che NON cambia, ed è quello
            che rende leggibile tutto il resto. */}
        <path
          d="M50 4c22 0 34 27 34 50a34 34 0 0 1-68 0C16 31 28 4 50 4z"
          className="egg__shell"
        />

        {/* Le crepe. Ognuna si disegna quando arriva, non appare e basta. */}
        <g className="egg__cracks">
          {cracks.map((c, i) => (
            <path
              key={c.d}
              d={c.d}
              className="egg__crack"
              style={{ ['--crack-i' as string]: String(i) }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
