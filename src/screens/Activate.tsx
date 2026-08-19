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
import {
  loadPing,
  loadSetup,
  type PingState,
  type ProviderProbe,
  type SetupState,
} from '../ai/backend';
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
  /* 🔶 Era `useState(freshSecret)` secco: un segreto NUOVO a ogni apertura,
     anche quando in questo browser ce n'era già uno salvato. Il risultato era
     una schermata che mostrava tre valori diversi — il proposto, quello nel
     campo, quello su Netlify — e diceva «non coincidono» senza far capire
     QUALE dei tre dovesse coincidere.

     🔒 Adesso: se un segreto c'è già, si mostra QUELLO. Uno nuovo si genera
     solo se lo chiedi. Un valore che cambia da sé sotto gli occhi di chi lo
     sta copiando non è una proposta, è un bersaglio mobile. */
  /* ════════════════════════════════════════════════════════════════════════
     ⚠️ IL SEGRETO SI GENERA UNA VOLTA E SI SALVA SUBITO.

     🔷 «Continua a cambiare.» Era vero, ed era questo: `useState(freshSecret)`
     ne faceva uno NUOVO a ogni apertura della schermata e non lo salvava mai.
     Chi non riusciva a completare il giro al primo colpo si ritrovava, alla
     visita dopo, un valore diverso da quello che aveva appena messo su
     Netlify — e non poteva accorgersene, perché di là non si rilegge.

     🔒 Adesso: se non c'è, se ne fa uno e si SALVA. Da quel momento è quello,
     e resta quello. Non c'è più niente da incollare in questa schermata: c'è
     una cosa da copiare, e va messa su Netlify.
     ════════════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!token) setToken(freshSecret());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const secret = token ?? '';
  const [draft, setDraft] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [ping, setPing] = useState<PingState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiceTried, setVoiceTried] = useState<string | null>(null);

  /* ⚠️ DUE DOMANDE DIVERSE, UN PULSANTE SOLO.

     `/api/setup` dice cosa è CONFIGURATO: la chiave c'è, il segreto coincide.
     `/api/ping` dice cosa FUNZIONA: il fornitore risponde, accetta la chiave,
     e conosce i nomi dei modelli che gli chiediamo.

     🔒 Sono separate perché la prima è sempre vera prima della seconda —
     «la chiave c'è» non ha mai voluto dire «la chiave funziona», ed è
     esattamente in quello spazio che stava «non arriva proprio la richiesta».
     Ma si chiedono insieme, perché nessuno preme due pulsanti per sapere una
     cosa sola. */
  const check = async (withToken: string | null) => {
    setBusy(true);
    setProblem(null);
    const [setupOut, pingOut] = await Promise.all([
      loadSetup(withToken),
      loadPing(withToken),
    ]);
    setBusy(false);
    setSetup(setupOut.data);
    setPing(pingOut.data);
    if (setupOut.failure) setProblem(explain(setupOut.failure));
  };

  // Al primo arrivo si guarda com'è messo il server, senza aspettare un tocco:
  // chi apre questa schermata sta già chiedendo «a che punto sono?».
  useEffect(() => {
    void check(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 🔶 Prima era «tutte le variabili obbligatorie ci sono», con Anthropic
     obbligatoria. Da quando la voce si può dare anche a GPT quella riga
     avrebbe detto NON ATTIVO a un'installazione che funziona benissimo con una
     chiave sola. La domanda giusta è più semplice: c'è qualcuno che può
     rispondere? La risposta la dà il server, che è l'unico a sapere quali
     chiavi esistono. */
  const live = Boolean(setup?.serverToken && setup.ready?.voice);
  const canCompile = Boolean(setup?.ready?.compile);
  const canDraw = Boolean(setup?.ready?.draw);

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
          detail="Le funzioni stanno su un indirizzo pubblico. Questo le fa aprire solo a te."
        >
          <p className="t-small">
            È già salvato in questo browser e <strong>non cambia più</strong>.
            Ti serve solo copiarlo su Netlify.
          </p>
          <Copyable value={secret} />
          {/* 🔶 Diceva «in tutti i campi contesto», ed era una scorciatoia
              pigra che faceva fare lavoro in più. Il sito è servito dal branch
              di produzione: Production è l'unico contesto che conta. Deploy
              Preview e Branch deploy servono alle anteprime delle pull
              request, Local development a `netlify dev`. */}
          <p className="t-micro activate__note">
            Netlify → <em>Environment variables</em> → <code>VINZMON_TOKEN</code> →
            incollalo nel campo <strong>Production</strong> → poi{' '}
            <em>Deploys → Trigger deploy</em>. Le variabili nuove entrano in
            vigore solo con una pubblicazione nuova.
          </p>
          {setup?.serverToken === false && (
            <p className="t-micro activate__bad">{setup.reason}</p>
          )}

          {/* 🔒 Rigenerare e incollarne un altro sono le due cose che servono
              raramente e rovinano tutto se premute per sbaglio: stanno chiuse.
              Il secondo caso è vero — un dispositivo nuovo deve poter ricevere
              il segreto che gli altri hanno già. */}
          <Button small onClick={() => setShowPaste((v) => !v)}>
            {showPaste ? 'CHIUDI' : 'HO GIÀ UN SEGRETO ALTROVE'}
          </Button>
          {showPaste && (
            <>
              <p className="t-micro activate__note">
                Se questo browser è nuovo e il segreto è già su Netlify,
                incollalo qui invece di sostituirlo.
              </p>
              <TextField
                value={draft}
                onChange={setDraft}
                placeholder="VINZMON_TOKEN"
                label="Il segreto che hai già"
              />
              <Button
                small
                variant="primary"
                loading={busy}
                disabled={draft.trim().length < 24}
                onClick={() => {
                  setToken(draft.trim());
                  void check(draft.trim());
                  setShowPaste(false);
                }}
              >
                USA QUESTO
              </Button>
            </>
          )}
        </Step>

        <Step
          n={2}
          title="LE CHIAVI"
          done={live}
          detail="Ne basta una che sappia dare la voce. Le altre accendono pezzi in più."
        >
          {setup?.vars ? (
            <ul className="activate__vars">
              {setup.vars.map((v) => (
                <li key={v.name} className="activate__var">
                  <span className="t-meta activate__varname">{v.name}</span>
                  {/* 🔒 Nessuna è più marcata MANCA da sola: mancherebbe solo
                      rispetto a una scelta che non hai fatto. Quello che manca
                      davvero, se manca, lo dice la riga qui sotto. */}
                  <SystemLabel tone={v.present ? 'character' : 'default'}>
                    {v.present ? "C'È" : 'NON C’È'}
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
          {/* Cosa manca DAVVERO, se manca: una frase per ciascuna delle due
              cose che le chiavi accendono, e nessuna delle due nomina un
              fornitore preciso — perché nessuno dei due è obbligatorio. */}
          {setup?.ready && !live && (
            <p className="t-micro activate__bad">
              Nessuna delle chiavi configurate sa dare la voce. Ne basta una fra
              OpenAI, Anthropic e Moonshot.
            </p>
          )}
          {setup?.ready && live && !canCompile && (
            <p className="t-micro activate__note">
              La voce c'è. Per far riscrivere i prompt dall'AI serve la chiave di
              OpenAI o quella di Anthropic.
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
          title="CONTROLLA"
          done={live}
          detail="Dopo aver messo il segreto su Netlify e ripubblicato."
        >
          {/* ⚠️ «Anche se lo collego non mi dice attivato.» Prima qui c'era un
              campo da riempire e un messaggio con UNA causa. Ma le cose che
              devono essere vere sono tre, e sapere QUALE delle tre manca è
              tutta la differenza fra «riprovo» e «so cosa fare». */}
          <ul className="activate__vars">
            <li className="activate__var">
              <span className="t-meta activate__varname">IL SEGRETO, QUI</span>
              <SystemLabel tone={token ? 'character' : 'alert'}>
                {token ? "C'È" : 'MANCA'}
              </SystemLabel>
              <span className="t-micro activate__varwhat">
                generato e salvato in questo browser
              </span>
            </li>
            <li className="activate__var">
              <span className="t-meta activate__varname">LO STESSO, SU NETLIFY</span>
              <SystemLabel tone={setup?.serverToken ? 'character' : 'alert'}>
                {setup === null ? '…' : setup.serverToken ? 'COINCIDE' : 'NO'}
              </SystemLabel>
              <span className="t-micro activate__varwhat">
                {setup === null
                  ? 'sto chiedendo al server'
                  : setup.serverToken
                    ? 'il server ci ha aperto'
                    : (setup.reason ?? 'il server non ci riconosce: ripubblica dopo averlo messo')}
              </span>
            </li>
            <li className="activate__var">
              <span className="t-meta activate__varname">UNA CHIAVE CHE PARLA</span>
              <SystemLabel tone={setup?.ready?.voice ? 'character' : 'alert'}>
                {setup?.ready ? (setup.ready.voice ? "C'È" : 'MANCA') : '…'}
              </SystemLabel>
              <span className="t-micro activate__varwhat">
                una fra OpenAI, Anthropic e Moonshot
              </span>
            </li>
            {/* ⚠️ LA QUARTA RIGA, ED È QUELLA CHE MANCAVA.

                🔷 «Non arriva proprio la richiesta su ChatGPT API.»

                Le tre sopra dicono cosa è CONFIGURATO. Nessuna delle tre ha
                mai provato a parlare col fornitore — quindi tutte e tre
                potevano dire «C'È» mentre ogni chiamata vera moriva. */}
            <li className="activate__var">
              <span className="t-meta activate__varname">IL FORNITORE RISPONDE</span>
              <SystemLabel tone={ping?.anyAlive ? 'character' : 'alert'}>
                {ping === null ? '…' : ping.anyAlive ? 'SÌ' : 'NO'}
              </SystemLabel>
              <span className="t-micro activate__varwhat">
                {ping === null
                  ? 'sto provando a parlargli'
                  : ping.anyAlive
                    ? 'gli abbiamo parlato adesso, e ci ha accettati'
                    : 'nessun fornitore configurato ci ha risposto'}
              </span>
            </li>
          </ul>

          {ping !== null && <ProviderProbes ping={ping} />}

          <Button
            variant="primary"
            block
            small
            loading={busy}
            onClick={() => void check(token)}
          >
            {busy ? 'CONTROLLO…' : 'CONTROLLA ADESSO'}
          </Button>
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
          done={canCompile}
          detail="Scrive le descrizioni delle immagini, una volta per creatura."
        >
          <CompilerChoicePanel setup={setup} />
        </Step>

        <Step
          n={6}
          title="CHI DISEGNA"
          done={canDraw}
          detail="Prende quella descrizione e ne fa un’immagine. Sei per creatura."
        >
          <ImageChoicePanel setup={setup} />
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
    case 'timeout':
      return 'La funzione è partita e non ha fatto in tempo a finire. Netlify ferma una funzione dopo 10 secondi (26 sul piano Pro): il testo ci sta, una generazione di immagini no.';
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

/* --- Una riga di scelta, con il prezzo -------------------------------------
   🔷 «Metti anche il prezzo vicino, così mi ricordo quanto si spende per
   ognuno.»

   ⚠️ I prezzi stavano nei cataloghi del server e non uscivano mai di lì: la
   schermata mostrava sei nomi e nessun numero, cioè chiedeva di scegliere alla
   cieca proprio sulla cosa che si paga.

   🔒 UNA RIGA SOLA PER TUTTE E TRE LE SCELTE. Erano tre copie quasi identiche;
   con i prezzi da aggiungere sarebbero diventate tre posti dove scrivere il
   numero in tre modi diversi.

   🔒 Il prezzo grezzo E un ancoraggio concreto, dove esiste. «$2 per milione di
   token» non dice niente a nessuno finché non sai quanti token è una cosa: per
   il compilatore lo sappiamo (il tetto d'uscita è 8000), per le immagini pure
   (si pagano a pezzo). Per la voce no — dipende da quanto scrivi — e lì il
   numero inventato sarebbe peggio del numero assente.
   -------------------------------------------------------------------------- */

function ChoiceRow({
  label,
  price,
  perUse,
  it,
  active,
  ready,
  onPick,
}: {
  label: string;
  /** Dollari per milione, entrata e uscita. Assente per chi si paga a pezzo. */
  price?: { input: number; output: number };
  /** Il costo di UN uso, già in dollari, quando ha un senso dirlo. */
  perUse?: string;
  it?: string;
  active: boolean;
  ready: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="activate__voice"
        aria-current={active ? 'true' : undefined}
        disabled={!ready}
        onClick={onPick}
      >
        <span className="t-meta">{label}</span>
        <SystemLabel tone={active ? 'character' : ready ? 'default' : 'alert'}>
          {active ? 'IN USO' : ready ? 'DISPONIBILE' : 'SERVE LA CHIAVE'}
        </SystemLabel>
        <span className="t-micro activate__price">
          {price && (
            <>
              ${price.input} / ${price.output} per milione di token
              {perUse ? ' · ' : ''}
            </>
          )}
          {perUse}
        </span>
        {it && <span className="t-micro activate__why">{it}</span>}
      </button>
    </li>
  );
}

/* --- Chi disegna (§22.4) ----------------------------------------------------
   🔷 «Ma io non ho potuto scegliere che AI immagini usare, vorrei la più
   recente lato immagine.»

   🔒 SEPARATA dalle altre due, come lo sono fra loro. La voce si sceglie a
   orecchio, il compilatore sui risultati visivi, questa sul disegno — e i tre
   criteri non si somigliano. E questa è l'unica delle tre che si paga a pezzo
   invece che a token: sei immagini per creatura, ed è la voce di spesa più
   grossa del progetto.
   -------------------------------------------------------------------------- */

/* ============================================================================
   COSA HA DETTO OGNI FORNITORE, QUANDO GLI ABBIAMO PARLATO ADESSO

   🔒 Una riga per fornitore CONFIGURATO. Quelli senza chiave non compaiono:
   una riga rossa accanto a un fornitore che hai scelto di non usare fa
   sembrare rotta una tua decisione.
   ========================================================================= */

function ProviderProbes({ ping }: { ping: PingState }) {
  const seen = ping.providers.filter((p) => p.configured);
  if (seen.length === 0) {
    return (
      <p className="t-micro activate__note">
        Nessuna chiave configurata: non c’è ancora niente da provare.
      </p>
    );
  }
  return (
    <ul className="activate__vars">
      {seen.map((p) => (
        <li key={p.provider} className="activate__var">
          <span className="t-meta activate__varname">{p.provider.toUpperCase()}</span>
          <SystemLabel tone={probeTone(p)}>{probeVerdict(p)}</SystemLabel>
          <span className="t-micro activate__varwhat">{probeDetail(p)}</span>
        </li>
      ))}
    </ul>
  );
}

function probeTone(p: ProviderProbe): 'character' | 'warning' | 'alert' {
  if (!p.authorized) return 'alert';
  return p.models.some((m) => !m.known) ? 'warning' : 'character';
}

function probeVerdict(p: ProviderProbe): string {
  if (!p.reachable) return 'MUTO';
  if (!p.authorized) return `RIFIUTA ${p.status ?? ''}`.trim();
  return p.models.some((m) => !m.known) ? 'NOMI' : `${p.ms} MS`;
}

/**
 * La riga che dice cosa fare.
 *
 * ⚠️ L'ordine dei casi è l'ordine in cui vanno guardati: se non risponde, il
 * nome del modello non conta ancora niente. Metterli allo stesso livello
 * manderebbe a cambiare un modello mentre il problema è la rete.
 */
function probeDetail(p: ProviderProbe): string {
  if (!p.reachable) {
    return p.error ?? 'nessuna risposta: la richiesta non è mai arrivata';
  }
  if (!p.authorized) {
    /* 🔒 401 e 429 si somigliano solo per il fatto che sono numeri. Il primo è
       la chiave, il secondo è il conto. */
    if (p.status === 401 || p.status === 403) {
      return 'ha risposto, ma non accetta questa chiave: è sbagliata, revocata, o di un altro progetto';
    }
    if (p.status === 429) {
      return 'ha risposto, ma sei oltre il suo limite: è il tetto dalla parte del fornitore, non nostro';
    }
    return `ha risposto ${p.status ?? ''} — ${p.error ?? 'senza spiegare'}`;
  }
  const unknown = p.models.filter((m) => !m.known).map((m) => m.model);
  if (unknown.length === 0) {
    return `risponde in ${p.ms} ms e conosce tutti i ${p.models.length} modelli che gli chiediamo`;
  }
  /* ⚠️ QUESTA È LA FRASE PER CUI ESISTE TUTTA LA FUNZIONE. Un nome che il
     fornitore non conosce fa fallire la chiamata PRIMA che ci sia qualcosa da
     pagare — quindi sul cruscotto non compare niente, e da fuori sembra
     identico a «la richiesta non parte». */
  return `non conosce ${unknown.join(', ')}: una richiesta con questo nome viene rifiutata subito, e per questo non compare fra quelle pagate`;
}

function ImageChoicePanel({ setup }: { setup: SetupState | null }) {
  const chosen = useApp((s) => s.imageModel);
  const setImageModel = useApp((s) => s.setImageModel);

  const list = setup?.images ?? [];
  const active = chosen ?? setup?.defaultImage ?? null;

  return (
    <>
      <p className="t-small">
        Sei immagini per creatura, una volta ogni ventotto giorni. È la voce di
        spesa più grossa: circa quattro o cinque centesimi l’una.
      </p>

      {list.length === 0 ? (
        <p className="t-micro">Le opzioni si vedono dopo i primi tre passi.</p>
      ) : (
        <ul className="activate__voices">
          {list.map((c) => (
            <ChoiceRow
              key={c.model}
              label={c.label}
              perUse={`$${c.perImage.toFixed(2)} a immagine · $${(c.perImage * 6).toFixed(2)} a creatura`}
              it={c.it}
              active={c.model === active}
              ready={c.ready}
              onPick={() => setImageModel(c.model === setup?.defaultImage ? null : c.model)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

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
            <ChoiceRow
              key={c.model}
              label={c.label}
              price={c.price}
              /* Il tetto d'uscita di una riscrittura è 8000 token, e l'uscita
                 è quasi tutto il conto: sei prompt per creatura. */
              perUse={`≈ $${(c.price.output * 0.008).toFixed(2)} a prompt · $${(c.price.output * 0.048).toFixed(2)} a creatura`}
              it={c.it}
              active={c.model === active}
              ready={c.ready}
              onPick={() => setCompilerModel(c.model === setup?.defaultCompiler ? null : c.model)}
            />
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
            <ChoiceRow
              key={v.model}
              label={v.label}
              price={v.price}
              /* Nessun `perUse` qui, di proposito: quanto costa un messaggio
                 dipende da quanto scrivi e da quanto risponde. Un numero
                 inventato sarebbe peggio di nessun numero. */
              it={v.it}
              active={v.model === active}
              ready={v.ready}
              onPick={() => setVoiceModel(v.model === setup?.defaultVoice ? null : v.model)}
            />
          ))}
        </ul>
      )}

      {mon && (
        <div className="activate__row">
          <Button variant="primary" small loading={busy} disabled={!token} onClick={tryVoice}>
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
