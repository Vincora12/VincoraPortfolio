/* ============================================================================
   LE STATISTICHE DELLA NASCITA (MASTER SPEC v1.15 §21.3)

   🔷 «Non le ha le statistiche? Tipo quanto è forte o agile? Sono tipo le mie
   statistiche della sua nascita stampate su di lui.»

   Le sei statistiche esistono da sempre — FORM, ATK, SPD, DEF, REC, CARE — ma
   vivevano solo nella schermata ME, dove sono **le tue di adesso**. Il .mon non
   ne aveva.

   ════════════════════════════════════════════════════════════════════════════
   E LA DIFFERENZA È TUTTO IL PUNTO, non un dettaglio di implementazione.

     ME    le tue statistiche di OGGI. Cambiano ogni giorno.
     MON   le tue statistiche del GIORNO IN CUI È NATO. Non cambiano mai.

   Un .mon è la fotografia di un momento: è stato estratto da com'eri quel
   giorno, e quei numeri sono la sua anatomia. Se seguissero i tuoi di oggi
   non sarebbero suoi — sarebbero un pannello della tua salute con sopra una
   faccia, e la creatura smetterebbe di essere una cosa nata e diventerebbe
   un grafico animato.

   Il fatto che i due numeri divergano NON è un difetto da nascondere: è la
   cosa più interessante che questa schermata possa dire. «Ecco com'eri
   quando è arrivato lui» — e più tempo passa, più quella frase pesa.
   ════════════════════════════════════════════════════════════════════════════

   🔒 NIENTE SCHEMA NUOVO. §13 tiene chiuso il Character Data e §27 ne fissa i
   ventisette campi: aggiungere `birth_stats` avrebbe voluto dire allargare un
   contratto che è chiuso di proposito. Non serve — il dato c'è già due volte:
   `generated_at_day` sul record, e `health.history` che conserva un anno di
   campioni giornalieri. Basta guardare nel posto giusto.

   ⚠️ Dopo 365 giorni il campione della nascita esce dalla finestra e il dato
   non c'è più. Non lo si inventa e non si mostrano i numeri di oggi al suo
   posto: si dice che è troppo lontano. Un `.mon` di due anni che mostra le
   statistiche di stamattina sarebbe una bugia precisa.
   ========================================================================= */

import type { HealthState, Signal, StatKey } from './types';
import { STAT_KEYS, isKnown } from './types';

export interface BirthStat {
  key: StatKey;
  value: Signal;
  /** 0–100 normalizzato per la barra. `null` quando il valore è sconosciuto. */
  bar: number | null;
}

export interface BirthStats {
  day: number;
  stats: BirthStat[];
  /** Quanti dei sei erano noti quel giorno: dice quanto ti conosceva. */
  known: number;
  /** Il campione non c'è più (oltre un anno) o non c'è mai stato. */
  lost: boolean;
}

/**
 * Le statistiche come erano il giorno in cui questo .mon è nato.
 *
 * Si cerca il campione ESATTO di quel giorno. Se non c'è — un giorno saltato,
 * la storia troncata — si prende il più vicino PRECEDENTE, mai uno successivo:
 * un .mon non può portare addosso numeri di giorni che non aveva ancora
 * vissuto.
 */
export function birthStatsFor(health: HealthState, bornOnDay: number): BirthStats {
  const before = health.history.filter((s) => s.day <= bornOnDay);
  const sample = before.length > 0 ? before[before.length - 1] : null;

  if (!sample) {
    return { day: bornOnDay, stats: [], known: 0, lost: true };
  }

  const stats: BirthStat[] = STAT_KEYS.map((key) => {
    const value = sample.stats[key];
    return {
      key,
      value,
      bar: isKnown(value) ? Math.max(0, Math.min(100, Math.round(value))) : null,
    };
  });

  return {
    day: sample.day,
    stats,
    known: stats.filter((s) => s.bar !== null).length,
    lost: false,
  };
}

/**
 * Quanto i numeri di oggi si sono allontanati da quelli della nascita.
 *
 * Serve a una riga sola in interfaccia, e va detta con attenzione: è un
 * CONFRONTO, non un voto. §28 vieta di trasformarlo in «sei peggiorato» —
 * qui si conta soltanto quanto è cambiato, senza direzione morale.
 */
export function driftFromBirth(health: HealthState, birth: BirthStats): number | null {
  if (birth.lost) return null;

  const pairs = birth.stats
    .map((s) => ({ then: s.value, now: health.stats[s.key]?.value ?? 'unknown' }))
    .filter((p) => isKnown(p.then) && isKnown(p.now)) as { then: number; now: number }[];

  if (pairs.length === 0) return null;

  const total = pairs.reduce((n, p) => n + Math.abs(p.now - p.then), 0);
  return Math.round(total / pairs.length);
}
