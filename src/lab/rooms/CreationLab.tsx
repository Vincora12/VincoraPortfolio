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

import { useMemo, useState } from 'react';
import { useApp } from '../../state/store';
import { FASI, PASSI, type FaseId } from './creationFlow';
import '../skin/creation.css';

const TABS = [
  { id: 'map', label: 'FLOW' },
  { id: 'train', label: 'BUILD' },
  { id: 'learned', label: 'LEARNED' },
  { id: 'state', label: 'STATE' },
  { id: 'versions', label: 'HISTORY' },
];

export function CreationLab({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState('map');

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
      </header>

      <main>
        {tab === 'map' && <Flow />}
        {tab === 'train' && <Build />}
        {tab === 'learned' && <Learned />}
        {tab === 'state' && <State />}
        {tab === 'versions' && <History />}
        <div className="footer mono">CREATION.LAB · SAME VINZ.MON ENGINE / SAME REPOSITORY</div>
      </main>
    </div>
  );
}

/* ============================================================================
   FLOW
   ========================================================================= */

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

function Flow() {
  const trace = useApp((s) => s.lastTrace);

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
                    <span className={`state mono ${v ? 'changed' : ''}`}>{v ? 'RAN' : 'R0'}</span>
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
                  </div>
                </details>
              );
            })}
          </section>
        ))}
      </div>
    </section>
  );
}

/* ============================================================================
   BUILD — il banco di prova, col generatore vero
   ========================================================================= */

function Build() {
  const [seed, setSeed] = useState('184723');
  const [esito, setEsito] = useState<{ a: string[]; b: string[]; tarato: boolean } | null>(null);
  const [gira, setGira] = useState(false);
  const [guasto, setGuasto] = useState<string | null>(null);

  /* ==========================================================================
     🔴 DUE BUG IN UNO, E IL PRIMO ERA INVISIBILE.

     1. NON SI VEDEVA NIENTE. Il codice girava, generava e chiamava `setEsito`
        — l'ho verificato con dei log — ma a schermo non compariva niente.
        Nel CSS di Vincenzo `.compare` nasce `display:none` e si accende con
        `.compare.show`: nel suo disegno la classe la metteva il JS. Io avevo
        copiato il markup e non la classe. Premevi, e sembrava rotto.

        ⚠️ È lo stesso difetto dei pulsanti bianchi su bianco: tradurre un
        disegno che si accende da solo e portarsi dietro i tag ma non gli
        interruttori.

     2. NON C'ERA NIENTE DA CONFRONTARE. Generavo due volte con lo STESSO seme
        e le stesse impostazioni: le due colonne erano identiche per
        costruzione. Un A/B che non può mai mostrare una differenza non è un
        test, è una decorazione — e leggerlo come «non va» è la reazione
        giusta.

     🔒 Adesso il confronto è vero: a SINISTRA la creatura che nascerebbe con
     le impostazioni DI SERIE, a DESTRA quella che nasce con le TUE — stesso
     seme, stessi input. Le righe diverse sono marcate.

     Le manopole (cataloghi e soglie di rarità) oggi stanno ancora in DEV, non
     qui: se non hai toccato niente le due colonne SONO uguali, e questo lo
     dice invece di lasciartelo indovinare.
     ====================================================================== */
  const prova = async () => {
    setGira(true);
    setGuasto(null);

    const { AXES, CATALOG_AXES, isEnabled, isOffByDefault, resetCatalog, setCatalogEnabled } =
      await import('../../engine/catalogTuning');
    const { rarityThresholds, isRarityTuned, resetRarityThresholds, setRarityThresholds } =
      await import('../../engine/rarityTuning');

    /* La fotografia di com'è adesso, per rimettercelo esattamente com'era. */
    const spenti = CATALOG_AXES.flatMap((a) =>
      AXES[a].all.filter((id) => !isEnabled(a, id)).map((id) => [a, id] as const),
    );
    const soglie = { ...rarityThresholds() };

    /* 🔴 QUI IL MESSAGGIO MENTIVA. Usavo `isCatalogTuned()`, che risponde
       «c'è qualcosa di spento» — e qualcosa è spento SEMPRE, perché alcune
       voci del catalogo nascono spente di serie (`isOffByDefault`). Quindi su
       un'app appena aperta diceva «hai delle impostazioni tue» a chi non
       aveva toccato niente, e lo mandava a cercare una differenza che non
       poteva esserci.

       La domanda vera è un'altra: quello che è spento adesso è DIVERSO da
       quello che è spento di serie? */
    const catalogoDiverso = CATALOG_AXES.some((a) =>
      AXES[a].all.some((id) => !isEnabled(a, id) !== isOffByDefault(a, id)),
    );
    const tarato = catalogoDiverso || isRarityTuned();

    try {
      const { generateFirstMon } = await import('../../engine/characterGenerator');
      const { generatorInput } = await import('../../state/store');
      const input = generatorInput(useApp.getState());

      const uno = () =>
        generateFirstMon({
          input,
          mindlineNodeId: 'lab-test',
          originNodeId: null,
          lineageNames: [],
          seed: Number(seed) || 1,
          devUnlockAll: false,
          hiddenEvent: false,
        });

      const righe = (r: ReturnType<typeof uno>) => [
        `NOME · ${r.record.data.name}`,
        `FAMILY · ${r.record.data.family}`,
        `ARCHETYPE · ${r.record.data.family_archetype}`,
        `AFFINITY · ${r.record.data.affinity}`,
        `SIZE · ${r.record.data.size}`,
        `ROLE · ${r.record.data.role}`,
        `APPEARANCE · ${r.record.data.appearance}`,
        `RARITY · ${r.record.data.rarity} (${r.record.data.rarity_score})`,
      ];

      /* Prima con le TUE impostazioni, così se qualcosa va storto dopo non
         resta il motore azzerato. */
      const lab = righe(uno());

      resetCatalog();
      resetRarityThresholds();
      const base = righe(uno());

      setEsito({ a: base, b: lab, tarato });
    } catch (e) {
      setGuasto(String(e));
    } finally {
      /* 🔒 SI RIMETTE TUTTO COM'ERA, SEMPRE. Prima si riaccende tutto
         (`reset`), poi si rispengono le voci che erano spente: gli stati
         intermedi hanno più voci accese di quello finale, quindi non possono
         inciampare nel minimo che `setCatalogEnabled` protegge. */
      resetCatalog();
      for (const [a, id] of spenti) setCatalogEnabled(a, id, false);
      setRarityThresholds(soglie);
      setGira(false);
    }
  };

  return (
    <section className="page active">
      <div className="kicker mono">CONTROLLED TEST</div>
      <h1>BUILD + TRAIN</h1>
      <p className="lead">
        Stesso seme, stessi input. A sinistra la creatura che nascerebbe con le impostazioni di
        serie, a destra quella che nasce con le tue. Chiama il generatore vero, non una finzione.
      </p>

      <div className="test">
        <h3>CONTROLLED TEST</h3>
        <div className="fields">
          <label className="mono">
            SEED
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>
        </div>
        <button
          type="button"
          className="btn dark"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => void prova()}
          disabled={gira}
        >
          {gira ? 'GENERO…' : 'PREVIEW A/B'}
        </button>

        {guasto && <p className="hint">Non è riuscito: {guasto}</p>}

        {esito && (
          <>
            {/* 🔒 `show` È LA CLASSE CHE ACCENDE IL RIQUADRO. Senza, il CSS di
                Vincenzo lo tiene a `display:none` e il test sembra rotto. */}
            <div className="compare show">
              <div className="col">
                <strong>BASELINE · DI SERIE</strong>
                {esito.a.map((r) => (
                  <div key={r} className="mono">{r}</div>
                ))}
              </div>
              <div className="col">
                <strong>LAB · LE TUE IMPOSTAZIONI</strong>
                {esito.b.map((r, i) => (
                  <div key={r} className="mono" style={r !== esito.a[i] ? { color: '#111', fontWeight: 700 } : undefined}>
                    {r !== esito.a[i] ? `→ ${r}` : r}
                  </div>
                ))}
              </div>
            </div>

            <p className="hint">
              {esito.tarato
                ? esito.a.join('|') === esito.b.join('|')
                  ? 'Hai delle impostazioni tue, ma su questo seme non cambiano niente: prova un altro seme.'
                  : 'Le righe in grassetto sono quelle che le tue impostazioni hanno cambiato.'
                : 'Le due colonne sono identiche perché non hai cambiato niente: cataloghi e soglie di rarità sono ancora quelle di serie. Quelle manopole oggi stanno in DEV → CATALOGHI e DEV → RARITÀ, non ancora qui.'}
            </p>
          </>
        )}
      </div>

      <div className="notice mono" style={{ marginTop: 14 }}>
        <strong>PRODUCTION = READ ONLY</strong>
        <br />
        Le creature generate qui non entrano nella tua storia: nascono, si guardano e si buttano.
        Le impostazioni vengono rimesse esattamente com’erano.
      </div>
    </section>
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
