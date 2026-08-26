/* ============================================================================
   06 — MON / COMPANION HOME (§12)

   🔒 Vincoli espliciti di §12/06:
   • Il .mon corrente occupa il 45–55% del viewport **iniziale**.
   • NESSUNA card generica attorno alla creatura.
   • Conversazione + composer + progressione compatta.

   «Iniziale» è la parola che regge questa schermata: a riposo la creatura
   prende metà schermo come chiede la spec, ma appena si comincia a parlare si
   ritira in una striscia e la conversazione prende il suo posto. Si torna
   indietro toccandola. La spec fissa lo stato d'ingresso, non impone che
   l'immagine occupi metà schermo mentre stai scrivendo.

   Il «+» del composer apre direttamente la registrazione: era un menu di
   quattro voci, ma tre erano nel posto sbagliato e la quarta era l'unica che
   si cercava davvero.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import type { Overlay } from '../App';
import { useApp, useActiveMon, useToday } from '../state/store';
import { MonName, SpeciesName } from '../system/MonName';
import { MonFace } from '../system/LiveMon';
import { expressionFor } from '../engine/assets';
import { HoldButton, IconButton, TextField } from '../system/components';
import { Icon } from '../system/Icon';
import { displayName } from '../engine/types';
import { haptic } from '../system/haptics';
import { moodSurface } from '../engine/mood';
import { t } from '../i18n/it';
import { GenerationDial } from '../system/GenerationDial';

export function CompanionHomeScreen({ onGo, onBack }: { onGo: (o: Overlay) => void; onBack: () => void }) {
  const mon = useActiveMon();
  const chat = useApp((s) => s.chat);
  const typingVisible = useApp((s) => s.typingVisible);
  const today = useToday();
  const syncDay = useApp((s) => s.syncDay);

  /* Cosa dire nella striscia, o `null` per non mostrarla affatto.

     Chiusa → niente: il momento è passato, e lasciare «fatto» in permanenza
     lo trasformerebbe in una medaglia da guardare. Non cominciata → niente:
     sarebbe una lista di compiti prima ancora di aver fatto qualcosa. */
  const dayStrip = (() => {
    if (today.closed || today.known === 0) return null;
    if (today.canClose) return t.home.closeDay;
    const missing = today.day.signals;
    if ((missing.MOOD?.status ?? 'UNKNOWN') === 'UNKNOWN') return t.home.missingMood;
    if ((missing.FOOD?.status ?? 'UNKNOWN') === 'UNKNOWN') return t.home.missingFood;
    return t.home.missingWorkout;
  })();
  const sendMessage = useApp((s) => s.sendMessage);
  const evolutionJob = useApp((s) => s.evolutionJob);
  const revealFormEvolution = useApp((s) => s.revealFormEvolution);
  const retryFormEvolution = useApp((s) => s.retryFormEvolution);

  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // L'espressione in alto è quella dell'ultima cosa che ha detto LUI, non di
  // quella che hai scritto tu: è la sua faccia, non uno specchio.
  const lastSaid = [...chat].reverse().find((m) => m.from === 'mon')?.text ?? '';

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  };

  // Il collasso della creatura è una conseguenza della conversazione, non un
  // comando: chi scrive vuole leggere le risposte.
  useEffect(scrollToEnd, [chat.length]);

  if (!mon) return null;

  const d = mon.data;
  const short = displayName(d.name);
  const form = d.evolution_state?.label ?? 'BASIC FORM';
  // 🔶 Una barra sola. Il vecchio modello ne aveva tre — XP, DISC, EVOLUTION
  // SYNC — e la spec lo vieta testualmente: «Do not show three competing
  // progress bars on Home».

  const submit = () => {
    if (draft.trim().length === 0) return;
    sendMessage(draft);
    setDraft('');
    scrollToEnd();
  };

  return (
    <div className="screen home">
      {/* --- Intestazione: identità e stato, senza scatola attorno --- */}
      <header className="home__head">
        {/* 🔷 v1.10 — un bersaglio solo. C'era il blocco identità (muto) più
            un'icona «espandi» in alto a destra che in realtà apriva il
            profilo: lo stesso difetto della matita già segnalato, un glifo
            che non dice dove porta. Adesso il nome È il pulsante, con la
            freccia dentro lo stesso bersaglio. */}
        {/* 🔷 v1.10 §13.7 — LA FACCIA STA IN ALTO, non accanto a ogni battuta.

            Era la richiesta originale — «nella chat c'è sempre lui in alto ma
            cambia espressione a seconda di quello che scrive» — e io l'avevo
            messa di fianco alle bolle. Da lì l'espressione si ripeteva una
            volta per messaggio e non era più una faccia: era un'icona di
            elenco. In alto è una faccia sola che reagisce a quello che ha
            appena detto, ed è la differenza fra qualcuno che parla e una
            trascrizione.

            Toccarla riporta all'ingresso, dove sta in grande: è lo stesso
            gesto di prima — toccare la creatura per vederla intera — con una
            destinazione che adesso esiste. */}
        <button
          type="button"
          className="home__face"
          data-pezzo="faccia"
          onClick={onBack}
          aria-label={`Guarda ${short} in grande`}
        >
          <MonFace
            monName={d.name}
            expression={expressionFor(lastSaid, d.mood_primary)}
            alt={short}
            size={64}
          />
        </button>

        {/* 🔷 v1.15 §13.12 — QUI C'ERA UN PULSANTE VERSO IL PROFILO.

            Era un bersaglio grande con una freccia e nessun nome: toccavi e
            scoprivi dove ti portava solo dopo esserci arrivato. Stessa
            malattia della freccia di invio, e stessa cura — sparisce.

            Il profilo non è stato tolto: è sceso sotto il personaggio nella
            home, dove ci arrivi scorrendo. Un gesto che tutti conoscono al
            posto di un'icona che nessuno sa leggere. */}
        <span className="home__identity" data-pezzo="riga-identita">
          <span className="home__identitytext">
            <span className="home__name t-display">
              <MonName name={d.name} fit />
            </span>
            {/* Nome proprio sopra, specie e forma sotto. */}
            <span className="t-meta home__form">
              <SpeciesName /> · {form}
            </span>
            <MoodLine moodPrimary={d.mood_primary} />
          </span>
        </span>
      </header>

      {/* 🔷 v1.10 §13.7 — qui c'era la creatura a mezzo schermo, che si
          ritirava in una striscia appena si cominciava a parlare. Faceva due
          lavori male: era troppo grande per una chat e troppo piccola per
          essere una presenza. Adesso i due lavori sono due schermate —
          l'ingresso è la creatura, questa è la conversazione — e §12/06
          («il .mon occupa il 45–55% del viewport iniziale») è rispettato
          meglio di prima: all'apertura ne occupa tutto. */}

      {/* --- 🔷 v1.10 — UN ELEMENTO SOLO, dove prima ce n'erano due.

           C'era una linea di SYNC sul bordo dello stage e, quando si riempiva,
           compariva SOTTO un banner MINDLINE SHIFT: la cosa più rumorosa dello
           schermo, piazzata fra la creatura e la conversazione, che spingeva
           giù la chat e non si poteva chiudere finché non agivi. Un annuncio
           che non si può congedare smette di essere un annuncio.

           Adesso è la linea stessa a diventare l'annuncio: sta dov'era, non
           sposta niente, e quando è piena cresce e si può toccare. --- */}
      {evolutionJob?.status === 'ready' ? (
        <HoldButton className="home__evolution-hold" onComplete={revealFormEvolution}>
          <strong className="t-meta">{evolutionJob.kind === 'hatch' ? 'PRIMO MON PRONTO' : 'NUOVO MON PRONTO'}</strong>
        </HoldButton>
      ) : evolutionJob ? (
        <button
          type="button"
          className={`home__evolution-job home__evolution-job--${evolutionJob.status}`}
          disabled={evolutionJob.status === 'running'}
          onClick={evolutionJob.status === 'error' ? retryFormEvolution : undefined}
        >
          <span className="home__evolution-copy">
            <strong className="t-meta">
              {evolutionJob.status === 'running'
                ? evolutionJob.kind === 'hatch' ? 'PRIMO MON IN CREAZIONE' : 'NUOVO MON IN CREAZIONE'
                : 'GENERAZIONE INTERROTTA'}
            </strong>
            <span className="t-micro">{evolutionJob.status === 'error' ? evolutionJob.error : evolutionJob.label}</span>
          </span>
          {evolutionJob.status === 'running'
            ? <GenerationDial done={evolutionJob.done} total={evolutionJob.total} />
            : <span aria-hidden="true">→</span>}
        </button>
      ) : null}

      {/* 🔷 v1.14 §13.9 — CHIUDERE LA GIORNATA DA QUI.

          Fino a ieri il SYNC si prendeva solo da DAILY SCAN, che è un modulo:
          registravi tutto scrivendo, e poi per chiudere dovevi andare a
          compilare una schermata. Era il pezzo di UX più incoerente rimasto.

          ⚠️ La striscia compare SOLO se la giornata è cominciata e non è
          ancora chiusa. Una barra sempre presente che dice «manca qualcosa»
          è una lista di cose da fare, e questa app non è una lista di cose
          da fare (§4). Quando non c'è niente da chiudere, non c'è niente. */}
      {dayStrip && (
        <div className="home__day">
          {today.canClose ? (
            <button
              type="button"
              className="home__dayclose"
              onClick={() => {
                haptic('confirm');
                syncDay();
              }}
            >
              <Icon name="scan" size={14} strokeWidth={2} />
              <span className="t-meta">{t.home.closeDay}</span>
            </button>
          ) : (
            <span className="home__daymissing t-micro">{dayStrip}</span>
          )}
        </div>
      )}

      {/* --- Conversazione --- */}
      <div className="home__chat" ref={listRef}>
        {chat.map((m) => (
          <div key={m.id} className={`bubblerow bubblerow--${m.from}`}>
            <div className={`bubble bubble--${m.from}`}>
              {/* 🔷 v1.12 §17.4 — finché la bolla è vuota e sta arrivando
                  qualcosa, al posto del testo ci sono i tre puntini. È il
                  gesto che tutti riconoscono, e la ricerca dice che è quello
                  che rende sopportabile l'attesa — molto più che accorciarla.

                  I puntini si spengono per un attimo quando il .mon ESITA:
                  qualcuno che inizia a scrivere, si ferma e ricomincia. Non lo
                  fanno tutti, dipende dal loro Voice DNA (§17.3). */}
              {m.from === 'mon' && m.pending && m.text.length === 0 ? (
                typingVisible && (
                  <span className="bubble__typing" role="status" aria-label={t.home.writing}>
                    <i /><i /><i />
                  </span>
                )
              ) : (
                <p className="bubble__text">{m.text}</p>
              )}
              {/* §17 — le superfici che dipendono dall'AI dichiarano sempre cosa
                  stanno mostrando: la voce vera, o quella deterministica. */}
              {m.from === 'mon' && m.fallback && !m.pending && (
                <span className="bubble__flag t-micro">{t.home.fallbackNotice}</span>
              )}
              {/* 🔶 v1.9 §5.1 — cosa è stato registrato da questo messaggio.
                  Registrare in silenzio sarebbe peggio che non registrare. */}
              {m.extracted && (
                <span className="bubble__flag bubble__flag--rec t-micro">
                  {t.home.recorded} {m.extracted.join(' · ')}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* --- Composer: oggetto persistente maggiore (§10.4) --- */}
      <div className="composer">
        {/* 🔶 v1.9 §13.3 — il «+» apre la registrazione, non un menu.

            C'era un menu con quattro voci: REGISTRA UN DATO, UMORE DI OGGI,
            BIO, MEMORIE. Tre erano posti sbagliati — la BIO appartiene al
            profilo, le memorie non vanno lette (rompono la magia) e l'umore
            non è una voce a parte, è una delle cose che si raccontano
            registrando. Restava una voce sola: il menu era un tocco in più
            per arrivare dove si voleva andare comunque. */}
        <IconButton icon="plus" label={t.input.title} onClick={() => onGo('input')} />
        <TextField
          label={`Scrivi a ${short}`}
          placeholder={`${t.home.composerPlaceholder} ${short}…`}
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          grow
        />
        {/* 🔷 v1.14 — IL PULSANTE COMPARE SOLO QUANDO C'È QUALCOSA DA MANDARE.

            Prima era sempre lì, grande e nero, disattivato: un bersaglio che
            occupa spazio e non fa niente. «Non so a cosa serva» è la risposta
            giusta a un pulsante che non risponde quando lo tocchi — e la cura
            non è spiegarlo, è farlo esistere solo quando serve.

            Al suo posto, quando il campo è vuoto, non c'è niente: la tastiera
            di iPhone ha già il microfono per dettare, ed è lì che uno lo
            cerca. */}
        {draft.trim().length > 0 && (
          <IconButton icon="send" label="Invia" haptics="confirm" onClick={submit} />
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   COME STA OGGI (§10.6) — l'unica superficie di prodotto dell'umore

   🔒 Il più delle volte questo componente non disegna niente, ed è la
   caratteristica principale: compare solo quando un asse si è mosso davvero
   dal punto di riposo di quel temperamento. Una riga sempre accesa sarebbe
   una manopola da ottimizzare; una che quasi sempre tace è una cosa che noti.

   🔒 E dice come sta, MAI perché. Il motivo lo sa (`mood.last`), e mostrarlo
   vorrebbe dire scrivere «è passato un giorno senza di te» sulla home di
   qualcuno: il senso di colpa con la faccia carina, che è esattamente quello
   che §4 vieta.
   ========================================================================= */
function MoodLine({ moodPrimary }: { moodPrimary: string }) {
  const mood = useApp((s) => s.mood);
  const says = mood ? moodSurface(mood, moodPrimary) : null;
  if (!says) return null;
  return <span className="t-micro home__mood">{says}</span>;
}
