import type { CharacterData } from './types';
import { culturalReference } from './generation-config';

export interface FormNameOrigin { root: string; reference: string; reason: string; sourceUrl?: string }
type Root = FormNameOrigin & { families: string[]; culturalIds: string[]; variants: string[] };
const ROOTS: Root[] = [
  {root:'seraf',reference:'Seraph · Final Fantasy XIV',families:['ANGEL'],culturalIds:['FF_KH'],variants:['VESERAF','VESERIEL','VASERAF'],reason:'La forma angelica incontra il riferimento a Seraph nel Cultural DNA Final Fantasy.',sourceUrl:'https://na.finalfantasyxiv.com/jobguide/scholar/'},
  {root:'gabriel',reference:'Gabriele · Luca 1:19',families:['ANGEL'],culturalIds:['SACRED_ANATOMY','TAROT_MYTH'],variants:['VAGABRIELZ','VAGABRIEL','VAGABRIZ'],reason:'La Family angelica e l’immaginario sacro incontrano il nome Gabriele.',sourceUrl:'https://www.biblegateway.com/passage/?search=Luke+1%3A19&version=NIV'},
  {root:'belzebub',reference:'Belzebù · Matteo 12:24',families:['DEMON'],culturalIds:['SACRED_ANATOMY','TAROT_MYTH'],variants:['VELZEBUBZ','VELZEBU','VALZEBUL'],reason:'La Family demoniaca e l’immaginario sacro incontrano Belzebù.',sourceUrl:'https://www.biblegateway.com/verse/en/Matthew%2012%3A24'},
  {root:'eos',reference:'Eos · Final Fantasy XIV',families:['FAIRY'],culturalIds:['FF_KH'],variants:['VEOZ','VEOS','VEOSIEL'],reason:'La Family FAIRY incontra Eos, la fata evocata dallo Scholar.',sourceUrl:'https://na.finalfantasyxiv.com/jobguide/scholar/'},
  {root:'carbuncle',reference:'Carbuncle · Final Fantasy XIV',families:['BEAST','MINERAL'],culturalIds:['FF_KH'],variants:['VARBUNZ','VARBUNEL','VECARBUN'],reason:'Carbuncle offre una radice culturale per questa forma; l’associazione alla Family è una scelta creativa.',sourceUrl:'https://na.finalfantasyxiv.com/jobguide/summoner/'},
  {root:'bahamut',reference:'Bahamut · Final Fantasy XIV',families:['DRAGON'],culturalIds:['FF_KH'],variants:['VAHAMUZ','VAHAMUT','VEHAMUL'],reason:'La forma draconica riprende la radice di Bahamut dal suo immaginario Final Fantasy.',sourceUrl:'https://na.finalfantasyxiv.com/jobguide/summoner/'},
];
/** Conceptual roots, explicitly not names attributed to existing works. */
const CULTURE_ROOTS: Record<string,string> = {FF_KH:'COR',SHAMAN_KING:'SPIRA',MAGICAL_GIRL:'LUNA',RANGERS:'MORFA',Y2K:'PIXEL',RAVE:'RAVA',QUEER_FASHION:'CAMA',STREET_BOOTLEG:'ZINA',NAPOLI:'SCIO',YOKAI:'YOKA',TAROT_MYTH:'ARCANA',OBSOLETE_TECH:'RETRO',EYEWEAR_FASHION:'LENTE',SACRED_ANATOMY:'SACRA',COSMIC:'COSMO'};
export function culturalFormName(input: { family: string; culturalIds: string[]; seed: number; lineageNames: readonly string[]; previous?: CharacterData }): { name: string; origin: FormNameOrigin } {
  const taken = new Set(input.lineageNames.map(n=>n.toLowerCase()));
  const inherited = input.previous?.family === input.family ? input.previous.formNameOrigin : undefined;
  const eligible = ROOTS.filter(r=>r.families.includes(input.family)&&r.culturalIds.some(id=>input.culturalIds.includes(id)));
  const inheritedRoot = inherited && ROOTS.find(r=>r.root===inherited.root&&r.families.includes(input.family));
  const pool = inheritedRoot ? [inheritedRoot,...eligible.filter(r=>r!==inheritedRoot)] : eligible;
  const chosen = pool.length ? pool[(inheritedRoot ? 0 : input.seed>>>0)%pool.length]! : undefined;
  const id = input.culturalIds.find(id=>CULTURE_ROOTS[id]);
  const root = chosen?.root ?? inherited?.root ?? (id ? CULTURE_ROOTS[id]!.toLowerCase() : input.family.toLowerCase());
  const origin: FormNameOrigin = chosen ? {root,reference:chosen.reference,reason:chosen.reason,sourceUrl:chosen.sourceUrl} : inherited ?? {
    root,reference:id ? culturalReference(id)!.it : input.family,
    reason:id ? `Radice sonora originale ispirata a ${culturalReference(id)!.it}, per la Family ${input.family}; non è il nome di un personaggio esistente.` : `Radice sonora della Family ${input.family}; nessuna origine culturale specifica disponibile.`,
  };
  const variants=chosen?.variants ?? [`V${root.toUpperCase()}Z`,`VE${root.toUpperCase()}`,`VA${root.toUpperCase()}`];
  for (const stem of variants) if(!taken.has(`${stem}.mon`.toLowerCase())) return {name:`${stem}.mon`,origin};
  // Vowel-separated endings keep collisions pronounceable, without numeric suffixes.
  for(const vowel of ['A','E','I','O','U']) for(const ending of ['LIN','REL','NO','MI','LA','RIN','VEL','SEN']) {
    const name=`${variants[0]}${vowel}${ending}.mon`;
    if(!taken.has(name.toLowerCase())) return {name,origin};
  }
  throw new Error('Radice del nome esaurita per questa lineage');
}
