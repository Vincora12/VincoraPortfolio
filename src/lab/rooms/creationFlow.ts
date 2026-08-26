/* ============================================================================
   IL FLUSSO DI CREAZIONE, COM'È DISEGNATO

   🔒 COPIATO DA `docs/lab/design/creation-lab.html` — l'array `S`, riga per
   riga, con le nove fasi di `phases`. Non è una descrizione di seconda mano:
   sono le stesse trentadue righe, gli stessi ID canonici (che NON sono in
   ordine crescente, ed è voluto: l'ordine verticale segue il codice, il
   numero resta l'identità del passo), gli stessi testi.

   ⚠️ E DICE LA COSA CHE NESSUN ALTRO POSTO DICE: quali passi partono DA SOLI
   alla schiusa e quali no. `run: 'optional'` vuol dire che quel passo esiste,
   funziona, e `hatch()` NON lo chiama — resolver creativo, Bio scritta
   dall'AI, riscrittura del prompt. Confonderli con i passi automatici è
   l'equivoco che questa pagina è nata per togliere.
   ========================================================================= */

export type FaseId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export const FASI: Record<FaseId, [string, string]> = {
  A: ['INPUT', '⚙️ CODE · automatic reads before generation'],
  B: ['GENERATOR · CORE', '⚙️ CODE · automatic seeded selection'],
  C: ['GENERATOR · CONSTRUCTION', '⚙️ CODE · automatic construction axes'],
  D: ['GENERATOR · DNA + VOICE', '⚙️ CODE · automatic canonical identity'],
  E: ['GENERATOR · CLOSURE', '⚙️ CODE · automatic rarity/name/freeze'],
  F: ['MON RECORD', '⚙️ CODE · automatic canonical derivatives'],
  G: ['OPTIONAL AI TOOLS', '🧪 available creation tools · not automatic in hatch today'],
  H: ['AUTOMATIC VISUAL GENERATION', '⚙️ CODE chooses prompts · 🎨 IMAGE AI renders'],
  I: ['RUNTIME VOICE', '💬 happens after birth when the .mon speaks'],
};

export type Passo = {
  id: string;
  fase: FaseId;
  nome: string;
  sub: string;
  critico: boolean;
  istruzione: string;
  kind: string;
  agent: string;
  run: string;
};

export const PASSI: Passo[] = [
  { id: "01", fase: "A", nome: "User State", sub: "confidence · bond · giorni attivi · segnali", critico: true, istruzione: "Build the normalized signal vector from current user data. Unknown data stays unknown.", kind: "", agent: "code", run: "auto" },
  { id: "02", fase: "A", nome: "Mindline State", sub: "depth · branch · novelty memory", critico: true, istruzione: "Read Mindline depth, branch count and novelty memory before generation.", kind: "", agent: "code", run: "auto" },
  { id: "04", fase: "B", nome: "Family", sub: "grammatica anatomica principale", critico: true, istruzione: "Resolve Family from fit, novelty, cultural modifier and controlled noise. Family defines primary anatomy.", kind: "", agent: "code", run: "auto" },
  { id: "05", fase: "B", nome: "Archetype", sub: "specializzazione interna alla Family", critico: true, istruzione: "Resolve an Archetype only inside the selected Family.", kind: "", agent: "code", run: "auto" },
  { id: "06", fase: "B", nome: "Affinity", sub: "contaminazione anatomica cross-family", critico: false, istruzione: "Affinity contaminates anatomy without replacing Family. Translate it into meaningful anatomical systems, not surface theming.", kind: "", agent: "code", run: "auto" },
  { id: "07", fase: "B", nome: "Size", sub: "TINY · MEDIUM · GIANT come grammatica", critico: false, istruzione: "Size changes proportional grammar rather than scaling the same body.", kind: "", agent: "code", run: "auto" },
  { id: "08", fase: "B", nome: "Role", sub: "funzione narrativa / comportamentale", critico: false, istruzione: "Role influences posture, function and behavior without overriding anatomy.", kind: "", agent: "code", run: "auto" },
  { id: "09", fase: "B", nome: "Fashion + VINZ Markers", sub: "styling · eyewear · hair-equivalent", critico: false, istruzione: "Translate Fashion through anatomy. Add VINZ markers only when anatomically plausible.", kind: "", agent: "code", run: "auto" },
  { id: "10", fase: "B", nome: "Mood", sub: "stato emotivo al momento della generazione", critico: false, istruzione: "Resolve Mood from recent latents. Below the confidence floor prefer neutral instead of inventing a strong state.", kind: "", agent: "code", run: "auto" },
  { id: "19", fase: "B", nome: "Continuity Guard", sub: "ancore + controllo anti-forma-identica", critico: true, istruzione: "Continuity anchors are applied while eligible axes resolve. After Mood, force one eligible free axis to change if everything remained identical.", kind: "control", agent: "code", run: "auto" },
  { id: "11", fase: "C", nome: "Appearance", sub: "linguaggio di resa", critico: false, istruzione: "Appearance controls rendering language and surface treatment, not anatomy.", kind: "", agent: "code", run: "auto" },
  { id: "5.5", fase: "C", nome: "Humanoidity", sub: "SÌ / NO · probabilità 50%", critico: false, istruzione: "Roll a binary body mode. YES preserves an immediately readable human body plan. NO lets Family and Archetype control a coherent non-human body plan.", kind: "", agent: "code", run: "auto" },
  { id: "11.5", fase: "C", nome: "Character Design DNA", sub: "costruzione · proporzioni · masse · faccia", critico: false, istruzione: "Choose character-design language independently from user signals.", kind: "", agent: "code", run: "auto" },
  { id: "11.7", fase: "C", nome: "Cultural DNA", sub: "pochi riferimenti attivi e distanti", critico: false, istruzione: "Select a small active set of cultural references and translate them rather than quote literally.", kind: "", agent: "code", run: "auto" },
  { id: "12", fase: "D", nome: "Heritage", sub: "tratti ereditati tradotti", critico: false, istruzione: "Translate inherited traits into the current Family and Affinity.", kind: "", agent: "code", run: "auto" },
  { id: "13", fase: "D", nome: "Character DNA", sub: "silhouette · gimmick · face · motif · traits · drives", critico: true, istruzione: "Generate the persistent identity grammar that makes this .mon memorable as an individual.", kind: "", agent: "code", run: "auto" },
  { id: "13.5", fase: "D", nome: "Palette DNA", sub: "subito dopo Character DNA nello stesso blocco", critico: false, istruzione: "Generate palette DNA immediately after Character DNA from Family, Affinity and Mood.", kind: "", agent: "code", run: "auto" },
  { id: "14", fase: "D", nome: "Voice DNA", sub: "preset + 12 assi mutati", critico: false, istruzione: "Choose a baseline Voice preset from Character DNA and Mood, then mutate all twelve axes. No language model is called here.", kind: "", agent: "code", run: "auto" },
  { id: "03", fase: "E", nome: "Rarity Eligibility", sub: "ID canonico 03 · fisicamente calcolato qui", critico: false, istruzione: "Build the unlocked rarity pool here, after Voice DNA, together with the rarity block.", kind: "control", agent: "code", run: "auto" },
  { id: "15", fase: "E", nome: "Rarity Score", sub: "0–100 → cap", critico: false, istruzione: "Compute rarity score from freshness, tensions, confidence, heritage, voice deviations and events.", kind: "", agent: "code", run: "auto" },
  { id: "16", fase: "E", nome: "Rarity Roll", sub: "estrazione nel pool sbloccato", critico: false, istruzione: "Roll final rarity inside the unlocked normalized pool. Score is a cap, not a guarantee.", kind: "", agent: "code", run: "auto" },
  { id: "17", fase: "E", nome: "Name", sub: "V…Z.mon · unico nel lineage", critico: false, istruzione: "Generate the name only after identity is resolved.", kind: "", agent: "code", run: "auto" },
  { id: "18", fase: "E", nome: "Character Data", sub: "freeze del record canonico", critico: true, istruzione: "Assemble and freeze canonical Character Data. The readable generation reason is a field of this record.", kind: "", agent: "code", run: "auto" },
  { id: "20", fase: "F", nome: "Bio Base", sub: "generateBio(data, ctx)", critico: true, istruzione: "Build the deterministic Bio from canonical data and generation-time signals while creating the MonRecord.", kind: "", agent: "code", run: "auto" },
  { id: "21", fase: "F", nome: "Sigil", sub: "generateSigil(data, previous)", critico: false, istruzione: "Derive the deterministic Sigil from the Mon identity and lineage context.", kind: "", agent: "code", run: "auto" },
  { id: "22", fase: "F", nome: "Reactions Base", sub: "generateReactions(rng, mood)", critico: false, istruzione: "Generate deterministic textual reaction fallbacks for the new MonRecord.", kind: "", agent: "code", run: "auto" },
  { id: "23", fase: "G", nome: "Creative Resolver", sub: "21 decisioni visive salvate", critico: true, istruzione: "A separate AI resolver can transform Character Data into a CreativeResolution. Today hatch() does not call this automatically.", kind: "optional-step", agent: "hybrid", run: "optional" },
  { id: "20.5", fase: "G", nome: "Written Bio", sub: "riscrittura AI opzionale", critico: false, istruzione: "A text model can rewrite the deterministic Bio once, without inventing facts. This happens only when explicitly requested.", kind: "optional-step derived", agent: "ai", run: "optional" },
  { id: "24.5", fase: "G", nome: "Prompt Rewrite", sub: "riscrittura AI opzionale per asset", critico: false, istruzione: "A text model can rewrite an asset prompt. Deterministic compilation remains the fallback, so hatch does not require this.", kind: "optional-step derived", agent: "ai", run: "optional" },
  { id: "24", fase: "H", nome: "Prompt Selection / Compiler", sub: "promptFor(record, assetType)", critico: true, istruzione: "Code selects the best available prompt source. A saved CreativeResolution is used only if it already exists; otherwise deterministic compilation still works.", kind: "downstream", agent: "code", run: "auto" },
  { id: "25", fase: "H", nome: "Asset Generation", sub: "CEL master → Toy · Doodle · Expressions", critico: true, istruzione: "Background image generation requests the canonical assets in order. The master is generated first and becomes reference for dependent images.", kind: "downstream", agent: "image", run: "auto" },
  { id: "14.5", fase: "I", nome: "Voice Brief", sub: "Voice DNA → tendenze leggibili", critico: false, istruzione: "At runtime, code deterministically translates Voice DNA into a behavioral brief. This does not call another AI.", kind: "runtime-step derived", agent: "code", run: "runtime" },
];
