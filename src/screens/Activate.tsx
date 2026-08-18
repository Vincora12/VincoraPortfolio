/* ============================================================================
   ATTIVA VINZ.MON (§19.5)

   🔷 «Fai un pulsante che dica "attiva vinz.mon" e parte un'installazione
   guidata dei token e delle api per farlo partire.»

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ QUELLO CHE QUESTA PROCEDURA NON PUÒ FARE, E LO DICE SUBITO.

   Non può configurare Netlify al posto tuo. Le chiavi dei fornitori stanno
   nelle variabili d'ambiente del server, e una pagina web non può scriverle —
   se potesse, potrebbe farlo anche chiunque altro aprisse la pagina, ed è
   precisamente la ragione per cui stanno lì e non qui.

   🔒 Quindi la promessa è un'altra, ed è quella che manca davvero: TOGLIERE DI
   MEZZO IL «NON FUNZIONA E NON SO PERCHÉ». Prima c'era un campo per il token e
   un messaggio che diceva «chiamata fallita: token sbagliato, funzioni non
   pubblicate o rete assente» — tre cause diverse in una frase sola, che è
   quanto di più vicino a non dire niente.

   Qui ogni passo si può PROVARE, e la prova risponde su una cosa alla volta.
   ════════════════════════════════════════════════════════════════════════════

   🔒 E NON SI SALTA IL PASSO 1. Il segreto si genera qui e non lo scegli tu:
   un token che uno inventa è un token che uno ricorda, e un token che uno
   ricorda è corto. Dietro a questo indirizzo ci sono trenta euro al mese.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { Button, IconButton, SystemLabel, TextField, Window } from '../system/components';
import { CopyButton } from '../system/CopyButton';
import { loadSetup, type SetupState } from '../ai/backend';
import { t } from '../i18n/it';

/* --- Il segreto ------------------------------------------------------------ */

/**
 * Trentadue caratteri da `crypto.getRandomValues`.
 *
 * 🔒 NON `Math.random()`. Non è pedanteria da manuale: `Math.random()` in un
 * browser è prevedibile a partire dallo stato del generatore, e questo è
 * l'unica cosa che sta fra un indirizzo pubblico e il tuo budget. Il minimo
 * che `auth.ts` accetta è 24 caratteri; qui se ne fanno 32.
 */
function freshSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/[+/=]/g, '')
    .slice(0, 32);
}

/* --- La schermata ---------------------------------------------------------- */

export function ActivateScreen({ onClose }: { onClose: () => void }) {
  const token = useApp((s) => s.token);
  const setToken = useApp((s) => s.setToken);

  /* Il segreto proposto si genera UNA volta e resta: rigenerarlo a ogni
     ridisegno vorrebbe dire che quello appena copiato su Netlify non è più
     quello a schermo, e non c'è modo di accorgersene. */
  const [secret] = useState(freshSecret);
  const [draft, setDraft] = useState(token ?? '');
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiceTried, setVoiceTried] = useState<string | null>(null);

  const check = async (withToken: string | null) => {
    setBusy(true);
    setProblem(null);
    const { data, failure } = await loadSetup(withToken);
    setBusy(false);
    setSetup(data);
    if (failure) setProblem(explain(failure));
  };

  // Al primo arrivo si guarda com'è messo il server, senza aspettare un tocco:
  // chi apre questa schermata sta già chiedendo «a che punto sono?».
  useEffect(() => {
    void check(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missing = setup?.vars?.filter((v) => v.required && !v.present) ?? [];
  const live = Boolean(setup?.serverToken && setup.vars && missing.length === 0);

  return (
    <div className="screen activate">
      <header className="specimen__head">
        <IconButton icon="left" label={t.common.back} light onClick={onClose} />
        <div className="specimen__titles">
          <h1 className="t-display specimen__name">ATTIVA VINZ.MON</h1>
          <p className="t-meta">
            {live ? 'ATTIVO' : 'NON ANCORA ATTIVO'}
          </p>
        </div>
        <span />
      </header>

      <div className="screen__body activate__body">
        {/* 🔒 Prima di tutto: cosa continua a funzionare comunque. Una
            procedura di attivazione che si apre dicendo cosa manca fa sembrare
            rotto quello che rotto non è — l'app gira senza chiavi da sempre,
            per scelta. */}
        <p className="t-small activate__intro">
          Senza tutto questo l'app funziona lo stesso: la creatura nasce, i
          giorni si chiudono, la stanza si riempie. Quello che si accende qui è
          la <strong>voce</strong> — cioè che ti risponda con parole sue invece
          che con quelle scritte da me.
        </p>

        <Step
          n={1}
          title="IL SEGRETO"
          done={setup?.serverToken === true}
          detail="Le funzioni stanno su un indirizzo pubblico. Questo è quello che le fa aprire solo a te."
        >
          <p className="t-small">
            Copia questo e mettilo su Netlify come variabile d'ambiente
            chiamata <code>VINZMON_TOKEN</code>.
          </p>
          <Copyable value={secret} />
          {setup?.serverToken === false && (
            <p className="t-micro activate__bad">{setup.reason}</p>
          )}
        </Step>

        <Step
          n={2}
          title="LE CHIAVI"
          done={setup?.vars ? missing.length === 0 : false}
          detail="Una sola è obbligatoria. Le altre accendono pezzi in più."
        >
          {setup?.vars ? (
            <ul className="activate__vars">
              {setup.vars.map((v) => (
                <li key={v.name} className="activate__var">
                  <span className="t-meta activate__varname">{v.name}</span>
                  <SystemLabel tone={v.present ? 'character' : v.required ? 'alert' : 'default'}>
                    {v.present ? "C'È" : v.required ? 'MANCA' : 'FACOLTATIVA'}
                  </SystemLabel>
                  <span className="t-micro activate__varwhat">
                    {v.what} — {v.where}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-micro">
              Si vedono appena il passo 1 è a posto e il segreto è incollato qui
              sotto: è il server a dirlo, e per chiederglielo bisogna prima
              potergli parlare.
            </p>
          )}
          {/* 🔒 Il tetto va detto QUI, non dopo il primo conto: è l'unica
              protezione che non si può aggiungere a posteriori. */}
          <p className="t-micro activate__note">
            Prima di generare una chiave, metti un tetto di spesa sul pannello
            del fornitore. Questa app ne ha già uno {fmt(setup?.capUsd)}, ma
            difende solo da sé stessa: una chiave senza tetto può essere spesa
            da qualunque altra cosa la usi.
          </p>
        </Step>

        <Step
          n={3}
          title="INCOLLA IL SEGRETO QUI"
          done={Boolean(token)}
          detail="Lo stesso di sopra. Resta in questo browser."
        >
          <TextField
            value={draft}
            onChange={setDraft}
            placeholder="VINZMON_TOKEN"
            label="Segreto"
          />
          <div className="activate__row">
            <Button
              variant="primary"
              small
              disabled={draft.trim().length === 0 || busy}
              onClick={() => {
                setToken(draft);
                void check(draft.trim());
              }}
            >
              SALVA E CONTROLLA
            </Button>
            {token && (
              <Button
                small
                onClick={() => {
                  setToken(null);
                  setDraft('');
                  setSetup(null);
                }}
              >
                TOGLI
              </Button>
            )}
          </div>
          {problem && <p className="t-micro activate__bad">{problem}</p>}
        </Step>

        <Step
          n={4}
          title="CHI DÀ LA VOCE"
          done={live}
          detail="Si può cambiare quando vuoi, e non si perde niente."
        >
          <VoiceChoicePanel setup={setup} tried={voiceTried} onTried={setVoiceTried} />
        </Step>

        <Step
          n={5}
          title="CHI SCRIVE I PROMPT"
          done={live}
          detail="Scrive le descrizioni delle immagini, una volta per creatura."
        >
          <CompilerChoicePanel setup={setup} />
        </Step>

        {busy && <p className="t-micro">controllo…</p>}
      </div>
    </div>
  );
}

/** Il tetto, se il server l'ha detto. Altrimenti la frase regge lo stesso. */
function fmt(usd: number | undefined): string {
  return typeof usd === 'number' ? `di $${usd.toFixed(2)} al mese` : 'suo';
}

/**
 * Il messaggio per ciascun modo di non funzionare.
 *
 * 🔒 Una causa per frase, e ognuna dice cosa GUARDARE. «Chiamata fallita:
 * token sbagliato, funzioni non pubblicate o rete assente» era una frase sola
 * per tre problemi diversi, e mandava a controllare tre cose di cui due erano
 * a posto.
 */
function explain(failure: string): string {
  switch (failure) {
    case 'offline':
      return 'Le funzioni non rispondono. O il sito non è ancora stato ripubblicato dopo aver aggiunto le variabili, oppure stai girando in locale, dove /api non esiste.';
    case 'unauthorized':
      return 'Il segreto qui e quello su Netlify non coincidono. Ricontrolla di averlo incollato tutto, e che dopo averlo messo su Netlify il sito sia stato ripubblicato: le variabili nuove entrano in vigore solo con una pubblicazione nuova.';
    case 'no-token':
      return 'Manca il segreto: incollalo al passo 3.';
    default:
      return 'Il server ha risposto qualcosa che non so leggere.';
  }
}

/* --- Un passo -------------------------------------------------------------- */

function Step({
  n,
  title,
  detail,
  done,
  children,
}: {
  n: number;
  title: string;
  detail: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Window
      title={`${n} · ${title}`}
      right={<SystemLabel tone={done ? 'character' : 'default'}>{done ? 'FATTO' : 'DA FARE'}</SystemLabel>}
    >
      <p className="t-micro activate__detail">{detail}</p>
      {children}
    </Window>
  );
}

/* --- Un valore da copiare --------------------------------------------------- */

function Copyable({ value }: { value: string }) {
  return (
    <div className="activate__copy">
      {/* Il valore resta a schermo e selezionabile: se la copia non riesce —
          e senza HTTPS non riesce — si ricopia a mano. */}
      <code className="activate__value">{value}</code>
      <CopyButton text={value} />
    </div>
  );
}

/* --- Chi scrive i prompt (§10) ----------------------------------------------
   🔒 SEPARATA da quella della voce, e non è pedanteria di interfaccia: sono
   due decisioni con due criteri diversi. La voce si sceglie a orecchio e porta
   le tue conversazioni; questa si sceglie sui risultati visivi e porta solo la
   descrizione di una creatura. Metterle nello stesso interruttore vorrebbe
   dire far decidere una cosa in base all'altra.
   -------------------------------------------------------------------------- */

function CompilerChoicePanel({ setup }: { setup: SetupState | null }) {
  const chosen = useApp((s) => s.compilerModel);
  const setCompilerModel = useApp((s) => s.setCompilerModel);

  const list = setup?.compilers ?? [];
  const active = chosen ?? setup?.defaultCompiler ?? null;

  return (
    <>
      <p className="t-small">
        Prende i fatti che il motore ha già deciso — famiglia, quanto resta
        umano, proporzioni, colori — e li riscrive nella forma che un modello di
        immagini sa eseguire. Non può cambiare i fatti: se una riscrittura ne
        perde uno, viene buttata e resta quella di prima.
      </p>

      {list.length === 0 ? (
        <p className="t-micro">Le opzioni si vedono dopo i primi tre passi.</p>
      ) : (
        <ul className="activate__voices">
          {list.map((c) => (
            <li key={c.model}>
              <button
                type="button"
                className="activate__voice"
                aria-current={c.model === active ? 'true' : undefined}
                disabled={!c.ready}
                onClick={() =>
                  setCompilerModel(c.model === setup?.defaultCompiler ? null : c.model)
                }
              >
                <span className="t-meta">{c.label}</span>
                <SystemLabel tone={c.ready ? 'default' : 'alert'}>
                  {c.model === active ? 'IN USO' : c.ready ? 'DISPONIBILE' : 'SERVE LA CHIAVE'}
                </SystemLabel>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="t-micro activate__note">
        Costa circa due centesimi per creatura, una volta ogni ventotto giorni.
        Senza chiave i prompt restano quelli di sempre e l’app funziona uguale.
      </p>
    </>
  );
}

/* --- La scelta della voce (§19.2) ------------------------------------------- */

function VoiceChoicePanel({
  setup,
  tried,
  onTried,
}: {
  setup: SetupState | null;
  tried: string | null;
  onTried: (s: string | null) => void;
}) {
  const chosen = useApp((s) => s.voiceModel);
  const setVoiceModel = useApp((s) => s.setVoiceModel);
  const token = useApp((s) => s.token);
  const mon = useApp((s) => (s.activeMonName ? s.mons[s.activeMonName] : null));
  const mood = useApp((s) => s.mood);
  const [busy, setBusy] = useState(false);

  const voices = setup?.voices ?? [];
  const active = chosen ?? setup?.defaultVoice ?? null;

  const tryVoice = async () => {
    if (!mon) return;
    setBusy(true);
    onTried(null);
    const { generateIntroduction } = await import('../ai/client');
    const { result, failure } = await generateIntroduction(token, mon, mood, [], chosen);
    setBusy(false);
    onTried(result ? result.text : `non ha parlato (${failure ?? 'errore'})`);
  };

  return (
    <>
      {/* 🔒 LA FRASE PIÙ IMPORTANTE DI QUESTA SCHERMATA. Senza, cambiare
          fornitore sembra una cosa da cui si torna indietro perdendo qualcosa,
          e nessuno la prova mai. */}
      <p className="t-small">
        Cambiare qui non tocca niente di quello che il tuo .mon è: ricordi,
        mindline, dex, umore, opinioni e carattere stanno in questo browser e
        restano. Cambia solo chi sceglie le parole.
      </p>

      {voices.length === 0 ? (
        <p className="t-micro">Le opzioni si vedono dopo i primi tre passi.</p>
      ) : (
        <ul className="activate__voices">
          {voices.map((v) => (
            <li key={v.model}>
              <button
                type="button"
                className="activate__voice"
                aria-current={v.model === active ? 'true' : undefined}
                disabled={!v.ready}
                onClick={() => setVoiceModel(v.model === setup?.defaultVoice ? null : v.model)}
              >
                <span className="t-meta">{v.label}</span>
                <SystemLabel tone={v.ready ? 'default' : 'alert'}>
                  {v.model === active ? 'IN USO' : v.ready ? 'DISPONIBILE' : 'SERVE LA CHIAVE'}
                </SystemLabel>
              </button>
            </li>
          ))}
        </ul>
      )}

      {mon && (
        <div className="activate__row">
          <Button variant="primary" small disabled={busy || !token} onClick={tryVoice}>
            {busy ? 'PARLA…' : 'FALLO PARLARE'}
          </Button>
        </div>
      )}
      {/* 🔒 La prova finale è una FRASE SUA, non un «connessione riuscita».
          Un semaforo verde dice che il tubo è aperto; questo dice che
          dall'altra parte c'è qualcuno — che è la cosa che stai attivando. */}
      {tried && <p className="t-small activate__said">«{tried}»</p>}
    </>
  );
}
