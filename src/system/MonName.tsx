/* ============================================================================
   NOME DI UN .MON — reso come nome di file

   Il nome canonico di una creatura è un nome di file: stem + estensione.
   §9.1 tratta `.verce` allo stesso modo — «the .verce extension is integrated
   as a clickable computer-folder/file object», «a file extension you click to
   enter». `.mon` segue la stessa grammatica.

   Quindi l'estensione NON si butta via: si rende con un peso diverso dallo
   stem, così i due pezzi leggono come un solo oggetto in due pesi.

     VAZIEL.mon
     ^^^^^^     stem: Archivo 900, largo, corsivo, maiuscolo
           ^^^^ estensione: minuscola, light, larghezza normale, dritta

   QUANDO USARLA — dove il nome è IDENTITÀ: reveal, testate, nodi Mindline,
   timeline, Heritage.
   QUANDO NO — dove il nome è una parola dentro una frase, un nome di file
   esportato o un prompt in inglese. Lì resta `displayName()`, che continua a
   esistere apposta.
   ========================================================================= */

import { SPECIES_NAME } from '../engine/generation-config';
import { displayName } from '../engine/types';

interface MonNameProps {
  /** Nome canonico completo, es. `VAZIEL.mon`. */
  name: string;
  /** Nasconde l'estensione dove lo spazio non la regge. */
  hideExtension?: boolean;
  /**
   * 🔷 v1.14 — RIMPICCIOLISCE FINCHÉ CI STA.
   *
   * I nomi generati vanno da 4 a 9 caratteri di stem; con `.mon` fanno da 8 a
   * 13. A corpo display, tredici caratteri su uno schermo da telefono non ci
   * stanno, e il nome — che è la cosa più identitaria che questa app mostri —
   * finiva tagliato o mandato a capo in mezzo.
   *
   * ⚠️ La soluzione NON è accorciare il nome con i puntini: un nome troncato
   * è un nome sbagliato, e questi nomi hanno una regola (iniziano per V,
   * contengono Z, finiscono in `.mon`) che si legge solo se si legge tutto.
   * Quindi si riduce il CORPO, non il testo.
   *
   * Da usare dove il nome è grande e da solo — reveal, testate, evoluzione.
   * Dove è una parola in mezzo a una frase non serve.
   */
  fit?: boolean;
  className?: string;
}

export function MonName({ name, hideExtension, fit, className = '' }: MonNameProps) {
  const stem = displayName(name);

  if (hideExtension) {
    return <span className={className}>{stem}</span>;
  }

  // L'aria-label tiene insieme il nome per chi usa uno screen reader: i due
  // span altrimenti verrebbero letti come due parole separate.
  const inner = (
    <span
      className={`monname ${fit ? 'monname--fit' : ''} ${className}`}
      aria-label={name}
      style={fit ? ({ '--monname-chars': stem.length + 4 } as React.CSSProperties) : undefined}
    >
      <span aria-hidden="true">{stem}</span>
      <span className="monname__ext" aria-hidden="true">
        .mon
      </span>
    </span>
  );

  /* Il wrapper esiste solo per dichiarare la larghezza disponibile alle unità
     `cqi`: senza un contenitore misurabile, `100cqi` cadrebbe sul viewport e
     il nome dentro una colonna stretta resterebbe grande uguale. */
  return fit ? <span className="monname-fit">{inner}</span> : inner;
}

/* --- Nome comune della specie ----------------------------------------------

   Ogni creatura ha il suo nome proprio, ma la specie si chiama `vinz.mon`: si
   possono chiamare tutte così, come si dice «un gatto» di un gatto che ha già
   un nome. Va in minuscolo perché è un nome comune, e tiene la grammatica
   dell'estensione perché è comunque un file.
   -------------------------------------------------------------------------- */

export function SpeciesName({ className = '' }: { className?: string }) {
  return (
    <span className={`species ${className}`} aria-label={SPECIES_NAME}>
      <span aria-hidden="true">vinz</span>
      <span className="species__ext" aria-hidden="true">
        .mon
      </span>
    </span>
  );
}

/* --- Variante SVG ----------------------------------------------------------
   Le etichette dei nodi in MindlineMap sono elementi <text>: un componente
   HTML non ci entra. Servono due <tspan> con attributi di font distinti.
   È anche il punto in cui la lettura «Mindline = albero di file» è più forte.
   -------------------------------------------------------------------------- */

interface MonNameTspanProps {
  name: string;
  /** Dimensione dello stem in px; l'estensione ne eredita la scala. */
  size: number;
}

export function MonNameTspan({ name, size }: MonNameTspanProps) {
  return (
    <>
      <tspan className="mindline__label">{displayName(name)}</tspan>
      <tspan className="mindline__labelext" fontSize={size * 0.92}>
        .mon
      </tspan>
    </>
  );
}
