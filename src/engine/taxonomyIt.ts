/* ============================================================================
   DESCRIZIONI BREVI IN ITALIANO

   Perché questo file esiste: le descrizioni in `taxonomy.ts` sono scritte in
   inglese perché finiscono nei prompt di generazione immagini (§22.1), dove
   devono essere precise e tecniche. Ma la UI del prototipo parla italiano,
   e mescolare le due lingue in una stessa frase — «logica materica PAPER:
   creases replace joints» — rende il testo illeggibile.

   Quindi ogni asse ha due forme:
   • quella lunga in inglese, in `taxonomy.ts`, destinata ai prompt;
   • quella breve in italiano, qui, destinata alle schermate.

   Le due restano allineate per `id`. Se aggiungi una voce alla tassonomia,
   aggiungila anche qui: il tipo `Record<...>` lo impone a compilazione.
   ========================================================================= */

import type { Affinity, Family, FashionAttitude, Mood, Role } from './taxonomy';

export const FAMILY_IT: Record<Family, string> = {
  ANGEL: 'corpo eretto con ali portanti, attaccate al cinto scapolare',
  BEAST: 'corpo animale, muso e coda che portano l’espressione',
  INSECT: 'esoscheletro segmentato, più di due arti, antenne',
  AQUATIC: 'corpo costruito su pinne e branchie, superficie bagnata',
  REPTILE: 'corpo squamato e piastrato, coda come contrappeso',
  AVIAN: 'cranio a becco, leggerezza, piume come struttura',
  CONSTRUCT: 'corpo assemblato, giunti e pannelli a vista',
  PLANT: 'corpo che cresce: fusto, foglie e radici come arti',
  SPECTRE: 'corpo che non si chiude, estremità che sfumano',
  AMORPHOUS: 'massa senza scheletro, la tensione superficiale fa la sagoma',
};

export const AFFINITY_IT: Record<Affinity, string> = {
  ELECTRIC: 'anatomia conduttiva, percorsi di carica sotto pelle',
  CHROME: 'superficie in metallo lucidato, volumi lavorati a macchina',
  GLASS: 'corpo parzialmente trasparente, struttura interna visibile',
  PAPER: 'corpo di fogli piegati, le pieghe sostituiscono le giunture',
  SMOKE: 'le estremità si disperdono, il nucleo resta denso',
  MAGNETIC: 'tiene insieme detriti per attrazione, non per giunti',
  CERAMIC: 'superficie smaltata e cotta, crepe riparate a vista',
  LIQUID: 'volume in movimento, la sagoma cede e si riprende',
  STATIC: 'corpo mal risolto, bordi che si strappano e si ricompongono',
  VELVET: 'pelo fitto, la luce cade di colpo su ogni curva',
  BONE: 'lo scheletro emerge in superficie, piastre e creste esterne',
  NEON: 'tubi luminosi sigillati lungo le linee strutturali',
};

export const ROLE_IT: Record<Role, string> = {
  SCOUT: 'si muove per primo e torna a riferire',
  ARCHIVIST: 'raccoglie, etichetta e non butta via niente',
  PERFORMER: 'recita per un pubblico che può non esistere',
  GUARD: 'si mette sempre in mezzo, in posizione di carico',
  TRICKSTER: 'destabilizza di proposito, per tempi e non per forza',
  MEDIC: 'legge il danno prima dell’identità',
  BUILDER: 'non sopporta una struttura lasciata a metà',
  WANDERER: 'non è legato a nessun nodo',
  CRITIC: 'valuta prima di partecipare',
  HOST: 'organizza lo spazio attorno agli altri',
};

export const MOOD_IT: Record<Mood, string> = {
  FOCUSED: 'postura contenuta, attenzione stretta',
  RESTLESS: 'peso che si sposta, gesti mai finiti',
  WARM: 'spalle aperte, corpo rivolto verso di te',
  GUARDED: 'linea chiusa, una spalla ruotata via',
  ELATED: 'baricentro alto, slancio verso l’alto',
  FLAT: 'peso neutro, energia trattenuta',
  WIRED: 'iper-allerta, tensione tenuta al collo',
  TENDER: 'testa bassa, giunture morbide',
  SARCASTIC: 'peso asimmetrico, un tratto sollevato',
  DEPLETED: 'linea crollata, spalle basse',
};

/* --- Dettagli di styling ---------------------------------------------------
   Chiavi = la stringa inglese memorizzata in `CharacterData.fashion`, che è
   quella che finisce nei prompt. Qui c'è solo la resa breve per la UI, così
   il record non cambia forma e non serve un secondo campo nello schema (§13).
   -------------------------------------------------------------------------- */

export const EYEWEAR_IT: Record<string, string> = {
  'wraparound blade shades': 'occhiali a lama avvolgenti',
  'oversized square frames': 'montatura quadrata oversize',
  'thin oval wire frames': 'montatura ovale sottile in metallo',
  'sports goggles with strap': 'maschera sportiva con elastico',
  'half-rim rectangular frames': 'montatura rettangolare a mezzo bordo',
  'tinted round frames': 'tondi colorati',
  'shield visor across the optical area': 'visiera a scudo sugli occhi',
  'thick rectangular acetate frames': 'acetato rettangolare spesso',
  'clip-on flip-up lenses': 'lenti a clip ribaltabili',
  'narrow micro-lens frames': 'micro-lenti strette',
  'safety goggles with side vents': 'occhiali da lavoro con prese laterali',
  'single-lens monocle rig': 'monocolo montato',
};

export const ACCESSORY_IT: Record<string, string> = {
  'crossbody utility pouch': 'marsupio a tracolla',
  'stacked wrist bands': 'braccialetti impilati',
  'oversized ear cuff': 'ear cuff oversize',
  'clip-on data tag': 'targhetta dati a clip',
  'wrapped scarf at the throat': 'sciarpa avvolta alla gola',
  'chain with a small pendant': 'catenina con ciondolo',
  'gloves with cut fingertips': 'guanti con le dita tagliate',
  'shoulder-mounted small speaker': 'cassa piccola montata sulla spalla',
  'folded map tucked into a strap': 'mappa piegata infilata in una cinghia',
  'enamel pin cluster': 'grappolo di spille smaltate',
};

export const FOOTWEAR_IT: Record<string, string> = {
  'chunky technical sneakers': 'sneaker tecniche massicce',
  'worn high-top trainers': 'high-top consumate',
  'heavy lug-sole boots': 'anfibi con suola carrarmato',
  'thin retro running shoes': 'running retrò sottili',
  'moulded slip-on shells': 'gusci slip-on stampati',
  'strapped sport sandals over socks': 'sandali sportivi sopra i calzini',
  'bare structural feet, no footwear': 'piedi nudi, nessuna calzatura',
};

export const HAIR_CUT_IT: Record<string, string> = {
  'short textured crop': 'corto scalato',
  'grown-out shag with a centre part': 'shag cresciuto con riga in mezzo',
  'slicked-back medium length': 'medio tirato indietro',
  'cropped sides with volume on top': 'lati rasati con volume sopra',
  'chin-length waves tucked behind the ears': 'onde al mento dietro le orecchie',
  'buzzed with a longer fringe': 'rasato con frangia lunga',
};

export const BLEACH_IT: Record<string, string> = {
  'FULL-BLEACH': 'decolorazione piena, tono uniforme',
  'VISIBLE-ROOTS': 'lunghezze decolorate, ricrescita scura evidente',
  'GROWN-OUT-BLEACH': 'punte chiare superstiti: ricrescita, non ombré',
};

/** Ripiega sulla stringa originale se manca la traduzione: non rompe mai. */
export function it(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '';
  return map[key] ?? key;
}

export const FASHION_IT: Record<FashionAttitude, string> = {
  TECHWEAR: 'gusci tecnici a strati, imbragature, cuciture sigillate',
  WORKWEAR: 'tessuto da lavoro pesante, rinforzi, tasche usate davvero',
  CLUBWEAR: 'taglio aderente, materiali riflettenti e trasparenti',
  SPORTS: 'pannellature da performance, rete, grafiche da squadra',
  TAILORING: 'spalla costruita, grammatica formale portata male',
  'VINTAGE-SPORT': 'forme atletiche vissute, stampe sbiadite',
  UNIFORM: 'logica del capo d’ordinanza, mostrine, gradi',
  'LAYERED-STREET': 'lunghezze impilate, collisione di proporzioni voluta',
  MINIMAL: 'pochi capi, una sola famiglia di materiali',
  COSTUME: 'travestimento portato sul serio, precisione camp',
};
