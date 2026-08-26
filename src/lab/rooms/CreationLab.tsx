/* ============================================================================
   🧬 CREATION.LAB

   🔒 FONTE DEL DISEGNO: `docs/lab/design/creation-lab.html`. Cinque schede
   FLOW / BUILD / LEARNED / STATE / HISTORY, il riquadro «COSA SUCCEDE
   DAVVERO QUANDO NASCE UN MON», la legenda dei sette simboli, le trentadue
   righe del flusso con gli ID canonici, e il banco di prova A/B.

   🔷 «Certo, se mancano dei pezzi, magari seguendo il modo in cui li ho
      disegnati, li riempiamo.»

   Ed è quello che succede qui: la pagina è la sua, e dietro ci sono le cose
   vere. Il flusso non è più una lista scritta a mano — dice quali passi ha
   davvero eseguito l'ULTIMA generazione, leggendo `lastTrace`. Il test A/B
   non simula: chiama `generateMon` due volte con lo stesso seme. STATE non
   mostra un `VORZEEK.mon` inventato: mostra il .mon attivo di adesso.

   ⚠️ E DOVE IL MOTORE NON C'È, IL DISEGNO RESTA E LO DICHIARA. Il disegno
   stesso porta il cartello «PRODUCTION = READ ONLY»: non è decorazione, è la
   riga che distingue un controllo collegato da uno che gli somiglia.
   ========================================================================= */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../state/store';
import { FASI, PASSI, type FaseId } from './creationFlow';
import { FAMILIES } from '../../engine/generation-config';
import { keepEnabled } from '../../engine/catalogTuning';
import {
  dimenticaTutto,
  ETICHETTA_ASSE,
  fraseDaInsegnare,
  leggiCarte,
  MINIMO_VISTE,
  preferenze,
  salvaCarta,
  type AsseContato,
  type Carta as CartaSalvata,
  type Giudizio,
} from './training';
import { StepTuning, type AsseDelPasso } from './StepTuning';
import {
  ascoltaJob,
  avviaJob,
  buttaTutto,
  chiediPermesso,
  immagineDi,
  notifica,
  type StatoJob,
} from './duelImages';
import { EYEWEAR_CATEGORIES, HAIRCUTS, HAIR_STATES } from '../../engine/generation-config';
import { LabAssistantPanel } from '../assistant/LabAssistantPanel';
import { TaxonomyLab } from './TaxonomyLab';
import {
  taxonomyDescriptionVersion,
  setTaxonomyDescriptionVersion,
  type TaxonomyDescriptionVersion,
} from '../../engine/taxonomy-versions';
import { labSyncCode } from '../../system/build';
import '../skin/creation.css';

const TABS = [
  { id: 'map', label: 'FLOW' },
  { id: 'taxonomy', label: 'TASSONOMIA' },
  { id: 'train', label: 'BUILD' },
  { id: 'learned', label: 'LEARNED' },
  { id: 'state', label: 'STATE' },
  { id: 'versions', label: 'HISTORY' },
  { id: 'assistant', label: '🤖 ASSISTENTE' },
];

export function CreationLab({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState('map');
  const [catalogVersion, setCatalogVersion] = useState<TaxonomyDescriptionVersion>(() => taxonomyDescriptionVersion());
  /* 🔷 «Un tasto alla fine del flow: genera A/B test, dove lui segue tutto il
     flow che abbiamo impostato e mi genera dodici immagini.»
     Il duello vive in BUILD; questo lo apre già pronto invece di far
     ricostruire il perimetro a mano. */
  const [avvioDalFlusso, setAvvioDalFlusso] = useState(0);

  return (
    <div className="app">
      <header className="top">
        <div className="nav">
          <a
            className="back"
            href="#/lab"
            onClick={(e) => {
              e.preventDefault();
              onBack();
            }}
          >
            ←
          </a>
          <div className="tabs">
            {TABS.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`tab ${t.id === tab ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="engine-version" aria-label="Versione delle descrizioni usata dal motore">
          <span className="mono">MOTORE</span>
          <div>
            {(['v1', 'v2'] as const).map((version) => (
              <button
                type="button"
                key={version}
                className={catalogVersion === version ? 'active' : ''}
                aria-pressed={catalogVersion === version}
                onClick={() => {
                  if (catalogVersion === version) return;
                  setTaxonomyDescriptionVersion(version);
                  setCatalogVersion(version);
                  window.location.reload();
                }}
              >
                {version.toUpperCase()}
              </button>
            ))}
          </div>
          <small>{catalogVersion === 'v2' ? 'AUDIT ATTIVO' : 'ORIGINALE'}</small>
        </div>
      </header>

      <main>
        {tab === 'map' && (
          <Flow
            onAvviaAB={() => {
              setTab('train');
              setAvvioDalFlusso((n) => n + 1);
            }}
          />
        )}
        {tab === 'train' && <Build avvio={avvioDalFlusso} />}
        {tab === 'learned' && <Learned />}
        {tab === 'state' && <State />}
        {tab === 'versions' && <History />}
        {tab === 'assistant' && <LabAssistantPanel />}
        {tab === 'taxonomy' && <TaxonomyLab />}
        <div className="footer mono">
          <strong>SYNC {labSyncCode()}</strong>
          <span> · STESSO MOTORE DI VINZ.MON</span>
        </div>
      </main>
    </div>
  );
}

/* ============================================================================
   FLOW
   ========================================================================= */

/* ============================================================================
   QUALI PASSI SI POSSONO TOCCARE, E CON COSA

   🔷 «Devo poter modificare i vari valori dentro, e magari disabilitare certe
      parti per vedere cosa succede.»

   🔒 LA CHIAVE È IL NUMERO DEL PASSO, non il nome. Gli ID canonici del disegno
   non sono in ordine e non cambiano; i nomi sì. Un aggancio sul nome si
   sarebbe staccato alla prima parola riscritta, in silenzio, e il passo
   sarebbe tornato senza comandi senza che nessuno se ne accorgesse.

   ⚠️ E DOVE UN COMANDO NON C'È, NON SI FINGE. I passi che non compaiono qui
   sotto non hanno manopole: non perché siano meno importanti, ma perché il
   motore, oggi, non ha un punto da cui toccarli. Un cursore che non muove
   niente è peggio di nessun cursore.
   ========================================================================= */
const COMANDI: Record<string, AsseDelPasso[]> = {
  '04': [{ tipo: 'catalogo', asse: 'family', leggi: (d) => String(d.family ?? '') }],
  '06': [{ tipo: 'catalogo', asse: 'affinity', leggi: (d) => String(d.affinity ?? '') }],
  '07': [{ tipo: 'catalogo', asse: 'size', leggi: (d) => String(d.size ?? '') }],
  '08': [{ tipo: 'catalogo', asse: 'role', leggi: (d) => String(d.role ?? '') }],
  /* 🔷 Il passo degli occhiali: quello dell'esempio. Lo stile si accende e si
     spegne; le sedici categorie di ottica si PESANO, perché la richiesta non
     era «togli quelli da sole», era «fai uscire di più quelli da vista». */
  '09': [
    { tipo: 'catalogo', asse: 'fashion', leggi: (d) => String(d.fashion ?? '') },
    {
      tipo: 'peso',
      asse: 'eyewear',
      voci: EYEWEAR_CATEGORIES,
      /* I marcatori stanno DIRETTAMENTE su `CharacterData` — `eyewear`,
         `hair_state`, `haircut` — non dentro un `vinz_markers`. Un lettore che
         punta al posto sbagliato non fallisce: conta zero, e la prova sembra
         dire «gli occhiali non escono mai». */
      leggi: (d) => (d.eyewear as { category?: string } | null)?.category ?? null,
    },
  ],
  '10': [{ tipo: 'catalogo', asse: 'mood', leggi: (d) => String(d.mood_primary ?? '') }],
  '11': [{ tipo: 'catalogo', asse: 'appearance', leggi: (d) => String(d.appearance ?? '') }],
  '11.5': [{ tipo: 'catalogo', asse: 'design', leggi: (d) => String(d.character_design_dna ?? '') }],
  '13': [
    {
      tipo: 'peso',
      asse: 'hairState',
      voci: HAIR_STATES,
      leggi: (d) => (d.hair_state as string | null) ?? null,
    },
    {
      tipo: 'peso',
      asse: 'haircut',
      voci: HAIRCUTS,
      leggi: (d) => (d.haircut as string | null) ?? null,
    },
  ],
};

const AGENTE: Record<string, string> = {
  code: '⚙️ CODE',
  ai: '🧠 AI',
  image: '🎨 IMAGE AI',
  hybrid: '🔀 HYBRID',
};

const CORSA: Record<string, string> = {
  auto: '✅ AUTO',
  optional: '🧪 OPTIONAL',
  runtime: '💬 RUNTIME',
};

function Flow({ onAvviaAB }: { onAvviaAB: () => void }) {
  const trace = useApp((s) => s.lastTrace);
  const famiglieAccese = keepEnabled('family', FAMILIES, (f) => f.id).map((f) => f.id);

  /* 🔒 QUALE PASSO È DAVVERO SUCCESSO. Il disegno mostrava trentadue righe
     tutte uguali; qui quelle che l'ultima generazione ha davvero eseguito
     portano il valore che ne è uscito. È la differenza fra leggere il flusso
     e vederlo. */
  const eseguiti = useMemo(() => {
    const m = new Map<string, string>();
    /* ⚠️ `lastTrace` è un `GenerationTrace`, non una lista: i passi stanno in
       `.steps`, e ogni passo dice `stage` (che cosa stava decidendo) e
       `outcome` (che cosa ha deciso). Sono quelli i due campi da leggere. */
    for (const passo of trace && 'steps' in trace ? trace.steps : []) {
      m.set(String(passo.stage).toUpperCase(), String(passo.outcome));
    }
    return m;
  }, [trace]);

  const valoreDi = (nome: string) => eseguiti.get(nome.toUpperCase()) ?? null;

  const fasi = [...new Set(PASSI.map((p) => p.fase))] as FaseId[];

  return (
    <section className="page active">
      <div className="kicker mono">VINZ.LAB / MON CREATION</div>
      <h1>CREATION.LAB</h1>
      <p className="lead">
        Qui vedi cosa succede davvero quando nasce un .mon, distinguendo ciò che fa il codice da
        ciò che chiama davvero un’AI. Le funzioni AI opzionali restano nello stesso Lab, ma non
        vengono spacciate per passaggi automatici.
      </p>
      {/* 🔒 QUESTO VA PRIMA DEL «READ ONLY», e non è una preferenza di
          impaginazione. Aprendo il flusso la domanda che uno si fa è «perché
          nasce sempre la stessa specie?»; il cartello che dice «guardare non
          genera niente» è utile ma non risponde a quella. Sotto una risposta
          a un'altra domanda, la risposta giusta non si legge. */}
      <CosaEAcceso />

      <div className="notice mono">
        <strong>PRODUCTION = READ ONLY</strong>
        <br />
        Guardare questo flusso non genera niente. La generazione vera parte dalla schiusa, o dal
        banco di prova qui sotto — che scrive solo nella prova, mai nel .mon attivo.
      </div>

      <div className="truthbox">
        <div className="kicker mono">🔥 COSA SUCCEDE DAVVERO QUANDO NASCE UN MON</div>
        <div className="truthline">
          <span className="who code">⚙️ CODE</span>
          <b>genera Character Data + Voice DNA + Bio base + Sigil + Reactions</b>
        </div>
        <div className="trutharrow">↓</div>
        <div className="truthline">
          <span className="who code">⚙️ CODE</span>
          <b>sceglie / compila il prompt disponibile per ogni asset</b>
        </div>
        <div className="trutharrow">↓</div>
        <div className="truthline">
          <span className="who image">🎨 IMAGE AI</span>
          <b>genera gli asset in background, se il token è disponibile</b>
        </div>
        <div className="truthnote">
          🧪 OGGI NON SONO AUTOMATICI NELL’HATCH: <strong>Creative Resolver AI</strong>,{' '}
          <strong>Written Bio AI</strong> e <strong>Prompt Rewrite AI</strong>. Restano qui perché
          fanno parte del sistema di creazione e puoi testarli/modificarli.
        </div>
      </div>

      <div className="legend mono">
        <span>⚙️ CODE = funzione / regola</span>
        <span>🧠 AI = modello testo/reasoning</span>
        <span>🎨 IMAGE AI = modello immagini</span>
        <span>🔀 HYBRID = code orchestra + AI decide</span>
        <span>✅ AUTO = succede nell’hatch reale</span>
        <span>🧪 OPTIONAL = esiste, ma hatch non lo chiama</span>
        <span>💬 RUNTIME = succede quando il .mon vive/parla</span>
      </div>

      <div className="kicker mono" style={{ marginTop: 22 }}>
        ACTUAL CREATION FLOW
      </div>
      <p className="lead" style={{ fontSize: 12, marginTop: 8 }}>
        L’ordine verticale segue il codice reale. Il numero a sinistra resta l’ID canonico e può non
        essere crescente.{' '}
        {trace
          ? 'Le righe con un valore a destra sono quelle che l’ULTIMA generazione ha davvero eseguito.'
          : 'Nessuna generazione ancora in questa sessione: i valori compaiono dopo la prima.'}
      </p>

      <div id="steps">
        {fasi.map((f) => (
          <section className="phase" key={f}>
            <div className="phasehead">
              <span className="num mono">{f}</span>
              <div>
                <b className="mono">{FASI[f][0]}</b>
                <small>{FASI[f][1]}</small>
              </div>
            </div>

            {PASSI.filter((p) => p.fase === f).map((p) => {
              const v = valoreDi(p.nome);
              const kindLabel = p.kind.includes('derived')
                ? 'DERIVED'
                : p.kind.includes('downstream')
                  ? 'DOWNSTREAM'
                  : p.kind.includes('control')
                    ? 'CONTROL'
                    : 'STEP';
              return (
                <details
                  className={`step ${p.kind}${p.run === 'optional' ? ' optional-step' : ''}${p.run === 'runtime' ? ' runtime-step' : ''}`}
                  key={p.id + p.nome}
                >
                  <summary>
                    <span className="num mono">{p.id}</span>
                    <span>
                      <span className="title">{p.nome}</span>
                      <span className="sub">{p.sub}</span>
                      <span className="stepmeta">
                        <span className={`who ${p.agent}`}>{AGENTE[p.agent] ?? p.agent}</span>
                        <span className={`runbadge ${p.run}`}>{CORSA[p.run] ?? p.run}</span>
                        <span className="kindtag mono">{kindLabel}</span>
                      </span>
                    </span>
                    <span className={`state mono ${v ? 'changed' : ''}`}>
                      {COMANDI[p.id] ? '⚙︎ ' : ''}
                      {v ? 'RAN' : 'R0'}
                    </span>
                  </summary>

                  <div className="detail">
                    <div className="box soft">
                      <span className="label mono">BASELINE · R0</span>
                      <div className="rule">{p.istruzione}</div>
                      <div className="execnote mono">
                        {p.run === 'optional'
                          ? '🧪 Funzione reale disponibile, ma NON viene chiamata automaticamente da hatch() oggi.'
                          : p.run === 'runtime'
                            ? '💬 Succede dopo la nascita, quando il .mon vive o parla.'
                            : p.agent === 'image'
                              ? '🎨 Chiamata automatica al modello immagini quando token/backend sono disponibili.'
                              : p.agent === 'hybrid'
                                ? '🔀 Il codice prepara/valida la richiesta, ma la decisione creativa viene dal modello AI.'
                                : '⚙️ Questa decisione è prodotta dal codice senza chiamare un modello generativo.'}
                      </div>
                    </div>

                    {/* 🔒 Il disegno metteva qui un «ESEMPIO OUTPUT» scritto a
                        mano. Al suo posto c'è quello VERO: cosa ha deciso
                        questo passo nell'ultima generazione. Un esempio finto
                        e un risultato vero occupano lo stesso spazio, ma solo
                        uno dei due si accorge quando il motore cambia. */}
                    <div className="box">
                      <span className="label mono">ULTIMA GENERAZIONE</span>
                      <div className="outputline mono">{v ?? '— nessuna in questa sessione'}</div>
                    </div>

                    {COMANDI[p.id] && (
                      <div className="box">
                        <span className="label mono">MODIFICA E PROVA</span>
                        <StepTuning assi={COMANDI[p.id]!} />
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </section>
        ))}
      </div>

      {/* 🔷 «Alla fine del flow: genera A/B test, dove lui segue tutto il flow
          che abbiamo impostato e mi genera dodici immagini da cui faccio A/B,
          e poi cerca di capire, genera delle lezioni, io le leggo, le approvo
          e vengono inserite.»

          🔒 STA IN FONDO, e non è impaginazione: è il gesto che si fa DOPO
          aver guardato e toccato il flusso. Un pulsante che costa dodici
          immagini messo in cima si preme prima di aver deciso cosa provare. */}
      <div className="test" style={{ marginTop: 24 }}>
        <h3>PROVA IL FLUSSO</h3>
        <p>
          Segue il flusso <b>com’è impostato adesso</b> — {famiglieAccese.join(' · ')} — e disegna
          dodici creature. Le guardi una alla volta e dici sì o no. Alla fine, da quello che hai
          scelto, esce una lezione che leggi e approvi tu.
        </p>
        <button type="button" className="btn dark" style={{ width: '100%', marginTop: 8 }} onClick={onAvviaAB}>
          GUARDA 12 CREATURE · UNA ALLA VOLTA
        </button>
      </div>
    </section>
  );
}

/* ============================================================================
   BUILD — il banco di prova, col generatore vero
   ========================================================================= */

/** Una creatura del mazzo, di passaggio. */
type Carta = {
  seed: number;
  /* Il record serve solo a compilare il prompt dell'immagine: la creatura
     resta di passaggio, non entra nella storia. */
  record: import('../../engine/types').MonRecord;
  righe: string[];
  valori: Partial<Record<AsseContato, string>>;
};

/* 🔷 «Devo poter sbloccare o bloccare delle famiglie, e adesso metti bloccate
      quelle che sono bloccate. Cerca la strada più semplice.»

   🔴 E la strada che avevo preso era complicata: avevo aggiunto un secondo
   meccanismo — una «fase di prova» da accendere e spegnere — accanto a quello
   che già c'era. Due modi di dire la stessa cosa, con due parole diverse, per
   un utente solo.

   Adesso il meccanismo è UNO: le liste con acceso / spento, quelle che
   esistevano già per affinità, ruolo e stile. Le Family bloccate oggi sono
   semplicemente SPENTE nella lista, e si accendono con un tocco. */
function CosaEAcceso() {
  const accese = keepEnabled('family', FAMILIES, (f) => f.id).map((f) => f.id);
  const taglie = keepEnabled('size', ['TINY', 'MEDIUM', 'GIANT'] as const, (x) => x);
  return (
    <div className="notice mono">
      <strong>ADESSO NASCE: {accese.join(' · ')} · {taglie.join(' · ')}</strong>
      <br />
      {accese.length === 1
        ? `Una Family sola accesa: è per questo che nasce sempre un ${accese[0]}. Le altre sono spente nella lista del passo 04, e si accendono con un tocco.`
        : `${accese.length} Family accese su ${FAMILIES.length}. Si accendono e si spengono dalla lista del passo 04.`}
    </div>
  );
}

/* ============================================================================
   BUILD + TRAIN — il duello

   🔷 «Un A/B test dovrebbe funzionare che mi genera random dei mon ed io
      scelgo quale mi piace, così lui inizia ad imparare.»

   🔴 Ed era già disegnato: `docs/lab/design/creation-lab.html`, scheda BUILD.
   Il perimetro con gli assi da bloccare, DUELS e SEED, le due carte con la
   traccia «WHY THIS?», i quattro voti, i commenti, il registro. Io ci avevo
   messo un confronto a parità di seme — due colonne identiche per
   costruzione, che non imparano niente.

   🔒 COME SI BLOCCA IL PERIMETRO, DAVVERO. Non c'è un parametro «generami un
   ANGEL»: la Family la sceglie il motore dal catalogo. Quindi per allenare gli
   ANGEL si spegne tutto il resto del catalogo per il tempo della generazione e
   poi si rimette com'era — è lo stesso meccanismo di DEV → CATALOGHI, usato
   dal di dentro. Il restauro sta in un `finally`: una prova che lascia il
   motore mezzo spento avrebbe cambiato la produzione.
   ========================================================================= */

function Build({ avvio = 0 }: { avvio?: number }) {
  const [famiglia, setFamiglia] = useState('');
  const [archetipo, setArchetipo] = useState('');
  const [taglia, setTaglia] = useState('');
  const [quante, setQuante] = useState(12);
  const [seme, setSeme] = useState('184723');

  const [mazzo, setMazzo] = useState<Carta[] | null>(null);
  const [passo, setPasso] = useState(0);
  const [carte, setCarte] = useState<CartaSalvata[]>(() => leggiCarte());
  const [gira, setGira] = useState(false);
  const [guasto, setGuasto] = useState<string | null>(null);
  const [insegnando, setInsegnando] = useState(false);
  const [insegnato, setInsegnato] = useState<string | null>(null);

  const [conImmagini, setConImmagini] = useState(false);
  const [job, setJob] = useState<StatoJob | null>(null);
  const [foto, setFoto] = useState<Record<number, string>>({});
  const token = useApp((s) => s.token);
  const imageModel = useApp((s) => s.imageModel);
  const teachResolver = useApp((s) => s.teachResolver);

  const scope = [famiglia || 'ALL', archetipo, taglia].filter(Boolean).join(' / ');
  const prefs = useMemo(() => preferenze(carte), [carte]);

  useEffect(() => ascoltaJob(setJob), []);

  useEffect(() => {
    if (!mazzo) return;
    void (async () => {
      const prese: Record<number, string> = {};
      for (const c of mazzo) {
        const url = await immagineDi(c.seed);
        if (url) prese[c.seed] = url;
      }
      setFoto(prese);
    })();
  }, [mazzo, job?.fatte]);

  const [liste, setListe] = useState<{ famiglie: string[]; archetipi: string[] }>({ famiglie: [], archetipi: [] });
  useEffect(() => {
    void (async () => {
      const { FAMILIES: F } = await import('../../engine/generation-config');
      setListe({
        famiglie: F.map((f) => f.id),
        archetipi: famiglia ? (F.find((f) => f.id === famiglia)?.archetypes.map((a) => a.id) ?? []) : [],
      });
    })();
  }, [famiglia]);

  /* ==========================================================================
     IL MAZZO

     🔶 ERA UN DUELLO A COPPIE. Il duello ti costringe a scegliere anche quando
     fanno schifo tutte e due — e infatti aveva due voti (BOTH, NO) che non
     contavano niente, cioè metà dei gesti buttati.

     🔷 «Facciamo tipo Tinder: vediamo vari risultati e ci accorgiamo se
        qualcosa è una merda.»
     ====================================================================== */
  /* 🔴 «Sto generando le immagini ma le sta generando in una pagina in cui
     avevo selezionato ALL con le family, ma in realtà avevo cliccato nel flow
     dove non c'erano tutte.» — Il pulsante di FLOW faceva `setFamiglia('')`
     e poi chiamava `genera()` nello stesso istante: `genera()` chiude su
     `famiglia` di QUESTO render, che React non ha ancora aggiornato — quindi
     generava ancora con l'eventuale Family scelta a mano in una sessione
     BUILD precedente, mentre lo schermo (aggiornato al render successivo)
     mostrava «ALL». Ora chi chiama passa il valore esplicito, non spera che
     lo stato sia già cambiato. */
  const genera = async (forza?: { quante?: number; immagini?: boolean; famiglia?: string; archetipo?: string; taglia?: string }) => {
    const quanteOra = forza?.quante ?? quante;
    const immaginiOra = forza?.immagini ?? conImmagini;
    const famigliaOra = forza?.famiglia ?? famiglia;
    const archetipoOra = forza?.archetipo ?? archetipo;
    const tagliaOra = forza?.taglia ?? taglia;

    setGira(true);
    setGuasto(null);
    setInsegnato(null);

    const { AXES, CATALOG_AXES, isEnabled, resetCatalog, setCatalogEnabled, senzaSpingereSulServer } =
      await import('../../engine/catalogTuning');
    const spenti = CATALOG_AXES.flatMap((a) =>
      AXES[a].all.filter((id) => !isEnabled(a, id)).map((id) => [a, id] as const),
    );

    try {
      const { generateFirstMon } = await import('../../engine/characterGenerator');
      const { generatorInput } = await import('../../state/store');
      const input = generatorInput(useApp.getState());

      if (famigliaOra) {
        senzaSpingereSulServer(() => {
          for (const id of AXES.family.all) if (id !== famigliaOra) setCatalogEnabled('family', id, false);
        });
      }

      const base = Number(seme) || 1;
      const fuori: Carta[] = [];
      let n = 0;
      let tentativi = 0;

      while (fuori.length < quanteOra && tentativi < quanteOra * 40) {
        tentativi += 1;
        const seed = base + n++;
        const r = generateFirstMon({
          input,
          mindlineNodeId: 'lab-mazzo',
          originNodeId: null,
          lineageNames: [],
          seed,
          devUnlockAll: false,
          hiddenEvent: false,
          ...(archetipoOra ? { allowedArchetypes: [archetipoOra] } : {}),
        });
        const d = r.record.data;
        if (tagliaOra && d.size !== tagliaOra) continue;

        fuori.push({
          seed,
          record: r.record,
          valori: {
            family: d.family,
            family_archetype: d.family_archetype,
            affinity: d.affinity,
            size: d.size,
            role: d.role,
            fashion: d.fashion,
            appearance: d.appearance,
            ...(d.eyewear ? { eyewear: d.eyewear.category } : {}),
          },
          righe: [
            `${d.name}`,
            `${d.family} · ${d.family_archetype} · ${d.affinity}`,
            `${d.size} · ${d.role} · ${d.fashion}`,
            `${d.appearance} · ${d.rarity}${d.eyewear ? ` · ${d.eyewear.category}` : ''}`,
          ],
        });
      }

      if (fuori.length === 0) {
        setGuasto('Con questo perimetro non esce niente: allarga il campo.');
      } else {
        setMazzo(fuori);
        setPasso(0);
        if (immaginiOra) {
          await chiediPermesso();
          void avviaJob({
            carte: fuori.map((c) => ({ seed: c.seed, record: c.record })),
            token,
            imageModel,
            onNotifica: (t, b) => void notifica(t, b),
          });
        }
      }
    } catch (e) {
      setGuasto(String(e));
    } finally {
      senzaSpingereSulServer(() => {
        resetCatalog();
        for (const [a, id] of spenti) setCatalogEnabled(a, id, false);
      });
      setGira(false);
    }
  };

  useEffect(() => {
    if (avvio === 0) return;
    setFamiglia('');
    setArchetipo('');
    setTaglia('');
    setQuante(12);
    setConImmagini(true);
    void genera({ quante: 12, immagini: true, famiglia: '', archetipo: '', taglia: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avvio]);

  const giudica = (g: Giudizio) => {
    if (!mazzo) return;
    const c = mazzo[passo]!;
    setCarte(
      salvaCarta({
        at: new Date().toISOString(),
        scope,
        giudizio: g,
        valori: c.valori,
        commento: '',
      }),
    );
    if (passo + 1 < mazzo.length) setPasso(passo + 1);
    else setMazzo(null);
  };

  const insegna = async () => {
    const frase = fraseDaInsegnare(prefs, scope === 'ALL' ? '' : scope, carte.length);
    if (!frase) return;
    setInsegnando(true);
    setInsegnato(null);
    try {
      const out = await teachResolver(frase, []);
      setInsegnato(
        out.reply ? 'Lezione salvata: la trovi in LEARNED.' : `Non è riuscito: ${out.detail ?? out.failure ?? 'nessuna risposta'}`,
      );
    } finally {
      setInsegnando(false);
    }
  };

  const corrente = mazzo?.[passo];

  return (
    <section className="page active">
      <div className="kicker mono">RESOLVER TRAINING / MANUAL SCOPE</div>
      <h1>BUILD + TRAIN</h1>
      <p className="lead">
        Costruisci il perimetro, genera un mazzo, e guardale una alla volta: sì o no. Quello che
        non scegli resta libero di variare.
      </p>

      <div className="builderpath">
        <span className="label mono">CURRENT SCOPE</span>
        <div className="breadcrumb mono">CREATION / {scope || 'ALL'}</div>
        <button type="button" className="clearbuild" onClick={() => { setFamiglia(''); setArchetipo(''); setTaglia(''); }}>
          CLEAR
        </button>
      </div>

      <Asse titolo="01 · FAMILY" nota="Che tipo di corpo stiamo allenando?" scelto={famiglia || 'ALL'}>
        <Pick on={!famiglia} onClick={() => { setFamiglia(''); setArchetipo(''); }} label="ALL" nota="lascia libero" />
        {liste.famiglie.map((f) => (
          <Pick key={f} on={famiglia === f} onClick={() => { setFamiglia(f); setArchetipo(''); }} label={f} />
        ))}
      </Asse>

      {famiglia && (
        <Asse titolo="02 · ARCHETYPE" nota="Restringi dentro la Family scelta." scelto={archetipo || 'ALL'}>
          <Pick on={!archetipo} onClick={() => setArchetipo('')} label="ALL" nota="lascia libero" />
          {liste.archetipi.map((a) => (
            <Pick key={a} on={archetipo === a} onClick={() => setArchetipo(a)} label={a} />
          ))}
        </Asse>
      )}

      <Asse titolo="04 · SIZE" nota="Opzionale. Lascia ALL per esplorare tutte le taglie." scelto={taglia || 'ALL'}>
        <Pick on={!taglia} onClick={() => setTaglia('')} label="ALL" nota="lascia libero" />
        {['TINY', 'MEDIUM', 'GIANT'].map((t) => (
          <Pick key={t} on={taglia === t} onClick={() => setTaglia(t)} label={t} />
        ))}
      </Asse>

      <div className="trainconfig">
        <div className="configrow">
          <label className="mono">
            QUANTE
            <select value={quante} onChange={(e) => setQuante(Number(e.target.value))}>
              {[6, 12, 24].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="mono">
            SEED
            <input value={seme} inputMode="numeric" onChange={(e) => setSeme(e.target.value)} />
          </label>
        </div>

        <label className="mono" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' }}>
          <input type="checkbox" checked={conImmagini} onChange={(e) => setConImmagini(e.target.checked)} />
          CON IMMAGINI · {quante} da disegnare e da pagare
        </label>

        <button type="button" className="trainstart" onClick={() => void genera()} disabled={gira}>
          {gira ? 'GENERO…' : 'GENERA IL MAZZO'}
        </button>

        {conImmagini && !token && (
          <p className="hint">Senza chiave non si disegna: il mazzo parte lo stesso, con le sole etichette.</p>
        )}
      </div>

      {guasto && <p className="hint">{guasto}</p>}

      {job && !job.finito && !job.errore && (
        <div className="notice mono">
          <strong>STO DISEGNANDO · {job.fatte}/{job.totale}</strong>
          <br />
          Puoi già giudicare: le carte si riempiono man mano. Se chiudi l’app il disegno si ferma,
          ma quello che è già fatto resta.
        </div>
      )}
      {job?.errore && (
        <div className="notice mono">
          <strong>DISEGNO FERMO</strong>
          <br />
          {job.errore}
        </div>
      )}

      {corrente && (
        <div className="deck">
          <div className="deck__head">
            <span>{passo + 1} / {mazzo!.length}</span>
            <span>{scope || 'ALL'}</span>
          </div>

          <div className="deck__art">
            {foto[corrente.seed] ? (
              <img src={foto[corrente.seed]} alt={corrente.righe[0]} />
            ) : (
              <span>{conImmagini ? 'in disegno…' : 'SOLO DATI'}</span>
            )}
          </div>

          <div className="deck__meta">
            {corrente.righe.map((r) => (
              <div key={r}>{r}</div>
            ))}
          </div>

          <div className="deck__vote">
            <button type="button" onClick={() => giudica('NO')}>💩 NO</button>
            <button type="button" className="si" onClick={() => giudica('SI')}>❤️ SÌ</button>
          </div>

          <div className="deck__bar">
            <i style={{ width: `${((passo + 1) / mazzo!.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* --- Cosa ha imparato --------------------------------------------- */}
      <div className="traininglog">
        <span className="label mono">
          COSA HO IMPARATO · {carte.length} CARTE · {Math.round(prefs.media * 100)}% DI SÌ
        </span>

        {prefs.piaciute.length === 0 && prefs.bocciate.length === 0 ? (
          <p className="hint">
            {carte.length === 0
              ? 'Nessuna carta ancora. Genera un mazzo e comincia a dire sì o no.'
              : `Ancora niente di solido: una voce deve essere comparsa almeno ${MINIMO_VISTE} volte e staccarsi dalla tua media. Se dici sì all’80% di tutto, una voce all’80% non ti piace: è nella media.`}
          </p>
        ) : (
          <>
            {prefs.piaciute.map((p) => (
              <div className="chip" key={`p-${p.asse}-${p.valore}`}>
                ❤️ {ETICHETTA_ASSE[p.asse]} · {p.valore} · {p.si}/{p.viste}
              </div>
            ))}
            {prefs.bocciate.map((p) => (
              <div className="chip" key={`b-${p.asse}-${p.valore}`}>
                💩 {ETICHETTA_ASSE[p.asse]} · {p.valore} · {p.si}/{p.viste}
              </div>
            ))}

            <div className="box soft" style={{ marginTop: 10 }}>
              <span className="label mono">COSA STO PER INSEGNARGLI</span>
              <pre className="promptcode" style={{ whiteSpace: 'pre-wrap' }}>
                {fraseDaInsegnare(prefs, scope === 'ALL' ? '' : scope, carte.length)}
              </pre>
            </div>

            <button
              type="button"
              className="btn dark"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => void insegna()}
              disabled={insegnando}
            >
              {insegnando ? 'INSEGNO…' : 'APPROVA E INSERISCI'}
            </button>
            {insegnato && <p className="hint">{insegnato}</p>}

            <button
              type="button"
              className="chip"
              style={{ marginTop: 8 }}
              onClick={() => {
                dimenticaTutto();
                void buttaTutto();
                setCarte([]);
                setFoto({});
              }}
            >
              DIMENTICA TUTTO
            </button>
          </>
        )}
      </div>

      <div className="notice mono" style={{ marginTop: 14 }}>
        <strong>PRODUCTION = READ ONLY</strong>
        <br />
        Le creature del mazzo non entrano nella tua storia, e i giudizi stanno in una memoria loro.
        Diventano una lezione vera solo quando premi APPROVA.
      </div>
    </section>
  );
}

/* I due mattoni del builder, con le classi del disegno. */
function Asse({
  titolo,
  nota,
  scelto,
  children,
}: {
  titolo: string;
  nota: string;
  scelto: string;
  children: ReactNode;
}) {
  const [aperto, setAperto] = useState(true);
  return (
    <div className="axisblock">
      <button type="button" className={`axishead ${aperto ? 'active' : ''}`} onClick={() => setAperto((v) => !v)}>
        <span>
          <b>{titolo}</b>
          <small>{nota}</small>
        </span>
        <span>{scelto}</span>
      </button>
      <div className={`axisoptions ${aperto ? 'open' : ''}`}>{children}</div>
    </div>
  );
}

function Pick({ on, onClick, label, nota }: { on: boolean; onClick: () => void; label: string; nota?: string }) {
  return (
    <button type="button" className={`pick ${on ? 'selected' : ''}`} onClick={onClick}>
      {label}
      {nota && <small>{nota}</small>}
    </button>
  );
}

/* ============================================================================
   LEARNED — le lezioni vere
   ========================================================================= */

function Learned() {
  const lessons = useApp((s) => s.lessons);
  const forgotten = useApp((s) => s.forgottenLessons);

  return (
    <section className="page active">
      <div className="kicker mono">RESOLVER MEMORY</div>
      <h1>LEARNED</h1>
      <p className="lead">
        Quello che hai insegnato al resolver, e che si applica alle creature che nascono da adesso
        in poi. Sono lezioni vere: le legge il prompt del resolver.
      </p>

      {lessons.length === 0 ? (
        <div className="notice mono">
          <strong>NIENTE ANCORA</strong>
          <br />
          Le lezioni si scrivono commentando le decisioni del resolver, non aprendo questa scheda.
        </div>
      ) : (
        lessons.map((l) => (
          <div className="lesson" key={l.id}>
            <strong className="mono">{l.about ?? 'GENERALE'}</strong>
            <p>{l.text}</p>
          </div>
        ))
      )}

      {forgotten.length > 0 && (
        <p className="lead mono" style={{ fontSize: 11 }}>
          {forgotten.length} lezioni dimenticate di proposito.
        </p>
      )}
    </section>
  );
}

/* ============================================================================
   STATE — il .mon vero
   ========================================================================= */

function State() {
  const activeMonName = useApp((s) => s.activeMonName);
  const mon = useApp((s) => (s.activeMonName ? s.mons[s.activeMonName] : null));

  if (!mon) {
    return (
      <section className="page active">
        <div className="kicker mono">CURRENT CHARACTER DATA</div>
        <h1>STATE</h1>
        <div className="notice mono">
          <strong>NESSUN .MON ATTIVO</strong>
          <br />
          Non c’è ancora una creatura: qui non si inventa un VORZEEK di esempio.
        </div>
      </section>
    );
  }

  const d = mon.data;
  const righe: [string, string][] = [
    ['NAME', d.name],
    ['FAMILY', d.family],
    ['ARCHETYPE', d.family_archetype],
    ['AFFINITY', d.affinity],
    ['RARITY', d.rarity],
    ['APPEARANCE', d.appearance],
    ['SIZE', d.size],
    ['ROLE', d.role],
    ['FASHION', d.fashion],
    ['MOOD', d.mood_primary],
  ];

  return (
    <section className="page active">
      <div className="kicker mono">CURRENT CHARACTER DATA</div>
      <h1>STATE</h1>
      <p className="lead">Il .mon attivo di adesso, letto dallo store vero: {activeMonName}.</p>

      <div className="tokenlist">
        {righe.map(([k, v]) => (
          <div className="row" key={k}>
            <div>
              <b>{k}</b>
            </div>
            <span className="value mono">{v}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================================
   HISTORY
   ========================================================================= */

function History() {
  const mons = useApp((s) => s.mons);
  const nodes = useApp((s) => s.nodes);

  const forme = Object.values(mons);

  return (
    <section className="page active">
      <div className="kicker mono">LINEAGE</div>
      <h1>HISTORY</h1>
      <p className="lead">
        Le forme che questa entità ha avuto, in ordine di comparsa. Non è una collezione di
        creature diverse: è la stessa, in configurazioni diverse.
      </p>

      {forme.length === 0 ? (
        <div className="notice mono">
          <strong>NESSUNA FORMA</strong>
          <br />
          La storia comincia alla prima schiusa.
        </div>
      ) : (
        <div className="tokenlist">
          {forme.map((m) => {
            const nodo = nodes.find((n) => n.monName === m.data.name);
            return (
              <div className="row" key={m.data.name}>
                <div>
                  <b>{m.data.name}</b>
                  <small>
                    {m.data.family} · {m.data.rarity}
                  </small>
                </div>
                <span className="value mono">{nodo ? `G${nodo.day} · ${nodo.label}` : '—'}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
