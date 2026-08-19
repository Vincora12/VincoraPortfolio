/* ============================================================================
   DA QUANTO STA ASPETTANDO

   🔷 «Il prompt carica ma non va.»

   ⚠️ I puntini che si muovono dicono «è vivo», ma non dicono la cosa che qui
   serve davvero: DA QUANTO. E il numero conta perché c'è una soglia precisa —
   Netlify ferma una funzione sincrona a dieci secondi — e sapere se si è
   fermata al nono o al quarantesimo separa due problemi che non hanno niente
   in comune:

     muore verso i 10   → è il muro della piattaforma, e non si supera
                          sintonizzando: si cambia dove gira
     muore molto prima  → è la chiave, il modello, il tetto. Il tempo non
                          c'entra, e cercarlo lì è mezz'ora persa

   Senza questo numero le due cose sono lo stesso schermo che gira. Con questo
   numero si vedono a occhio.
   ========================================================================= */

import { useEffect, useState } from 'react';

/**
 * ⚠️ La soglia qui sotto NON è più «dieci secondi».
 *
 * 🔷 «Ora va, anche se è arrivato a 17 secondi.» — e una chiamata che torna a
 * diciassette dimostra che il tetto di questo sito è più alto di diciassette.
 * Avevo ripetuto «dieci» prendendolo dalla documentazione generale invece che
 * dal sito vero.
 *
 * 🔒 Quindi la riga non annuncia più un limite: dice i secondi, e da un certo
 * punto in poi dice che è tanto. Il numero è vero comunque; il limite era una
 * mia convinzione.
 */

/** Secondi interi da quando `active` è diventato vero. Zero quando è falso. */
export function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const from = Date.now();
    setSeconds(0);
    const id = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - from) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [active]);

  return seconds;
}

/**
 * L'attesa detta a parole, con il muro dei dieci secondi nominato quando lo si
 * supera.
 *
 * 🔒 Il numero da solo non basta: «14s» non dice a nessuno che quattordici è
 * oltre il limite. La frase sì, e arriva nell'unico momento in cui si può
 * ancora guardare lo schermo mentre succede.
 */
export function waitingText(label: string, seconds: number): string {
  if (seconds >= 20) return `${label}… ${seconds}s — sta per finire il tempo della funzione`;
  if (seconds >= 10) return `${label}… ${seconds}s — più del solito`;
  return seconds > 0 ? `${label}… ${seconds}s` : `${label}…`;
}
