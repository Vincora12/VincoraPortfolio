import type { BioFile, CharacterData } from './types';
import { displayName } from './types';

/** Narrative consumer only. These readings never feed the visual resolver or RNG. */
const CULTURAL_TASTE: Record<string, { likes: string; dislikes: string }> = {
  FF_KH: { likes: 'i giochi in cui un’amicizia conta quanto la missione', dislikes: 'le vittorie che non cambiano niente' },
  SHAMAN_KING: { likes: 'gli oggetti comuni che nelle storie diventano compagni', dislikes: 'le cose trattate come se fossero tutte intercambiabili' },
  MAGICAL_GIRL: { likes: 'le trasformazioni teatrali e la pop culture senza vergogna', dislikes: 'chi scambia la leggerezza per stupidità' },
  RANGERS: { likes: 'le entrate in scena esagerate e i gruppi che trovano il proprio ritmo', dislikes: 'chi vuole prendersi tutto il merito' },
  Y2K: { likes: 'la grafica digitale che prometteva un futuro improbabile', dislikes: 'le interfacce tutte uguali e senza carattere' },
  RAVE: { likes: 'i bassi insistenti e i posti dove la notte perde l’orario', dislikes: 'le playlist che non rischiano mai niente' },
  QUEER_FASHION: { likes: 'la moda come esperimento e le scene che inventano le proprie regole', dislikes: 'il buon gusto usato per tenere fuori qualcuno' },
  STREET_BOOTLEG: { likes: 'le fanzine, la grafica da strada e le copie reinventate', dislikes: 'le cose troppo perfette per essere toccate' },
  NAPOLI: { likes: 'le storie di quartiere e i piccoli rituali scaramantici', dislikes: 'il folklore ridotto a souvenir' },
  YOKAI: { likes: 'le storie in cui il quotidiano nasconde qualcosa di strano', dislikes: 'i misteri spiegati troppo in fretta' },
  TAROT_MYTH: { likes: 'i simboli che cambiano significato a seconda di chi li legge', dislikes: 'le profezie vendute come certezze' },
  OBSOLETE_TECH: { likes: 'l’elettronica dimenticata e gli oggetti che si possono ancora riparare', dislikes: 'buttare via qualcosa soltanto perché è vecchio' },
  EYEWEAR_FASHION: { likes: 'il design degli oggetti quotidiani e le idee che ne cambiano l’uso', dislikes: 'il lusso che ha soltanto il prezzo da raccontare' },
  SACRED_ANATOMY: { likes: 'gli spazi rituali che lasciano più domande che risposte', dislikes: 'la solennità usata per impedire domande' },
  COSMIC: { likes: 'la fantascienza che lascia spazio all’incomprensibile', dislikes: 'le spiegazioni che fanno sembrare piccolo tutto' },
};
const FALLBACK = { likes: 'le idee strane che diventano utili', dislikes: 'le risposte sicure prima ancora della domanda' };

export function bioTasteSeeds(data: Pick<CharacterData, 'cultural_dna'>) {
  const references = Array.isArray(data.cultural_dna) ? data.cultural_dna : [];
  return references.flatMap((id) => CULTURAL_TASTE[id] ? [{ referenceId: id, ...CULTURAL_TASTE[id]! }] : []).slice(0, 3);
}

/** Conservative output guard; physical generation data never enters the writer input. */
export function hasPhysicalBioDescription(text: string): boolean {
  return /\b(occhi|capelli|anatomia|anatomico|silhouette|sagoma|pupille|iridi|corna|ali|zampe|pelliccia|pelle|muscoli|eyewear|eyes|hair|anatomy|silhouette)\b/i.test(text)
    || /\b(indosso|vesto|vestito di|il mio corpo|le mie mani|my body|my clothes)\b/i.test(text);
}

/** New births only; historical Bio records are not rewritten or migrated. */
export function generateCharacterBio(data: CharacterData, day = data.generated_at_day): BioFile {
  const tastes = bioTasteSeeds(data);
  const first = tastes[0] ?? FALLBACK;
  const second = tastes[1];
  const origins = [...new Set((data.heritage_traits ?? []).map((item) => displayName(item.from_mon)))].slice(0, 2);
  return {
    story: [`Mi piacciono ${first.likes}.`, second ? `Mi incuriosiscono anche ${second.likes}.` : 'Preferisco capire cosa mi attira prima di decidere come chiamarlo.',
      `Non sopporto ${first.dislikes}.`, `Dal giorno ${day} questa è la mia maniera di scegliere cosa merita attenzione.`].join(' '),
    annotations: [`Da tenere vicino: ${first.likes}.`, `Da evitare: ${first.dislikes}.`],
    rememberedDetails: origins.length ? [`Continuo il percorso di ${origins.join(' e ')}: stessa coscienza, un’altra prospettiva.`] : ['Prima forma del percorso; nessun ricordo precedente inventato.'],
    tags: [`#${data.family}`, `#${data.affinity}`, `#${data.role}`, `#${displayName(data.name)}`],
  };
}
