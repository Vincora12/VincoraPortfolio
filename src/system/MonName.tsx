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
  className?: string;
}

export function MonName({ name, hideExtension, className = '' }: MonNameProps) {
  const stem = displayName(name);

  if (hideExtension) {
    return <span className={className}>{stem}</span>;
  }

  return (
    // L'aria-label tiene insieme il nome per chi usa uno screen reader: i due
    // span altrimenti verrebbero letti come due parole separate.
    <span className={`monname ${className}`} aria-label={name}>
      <span aria-hidden="true">{stem}</span>
      <span className="monname__ext" aria-hidden="true">
        .mon
      </span>
    </span>
  );
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
