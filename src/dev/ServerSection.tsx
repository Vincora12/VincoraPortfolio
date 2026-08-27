/* ============================================================================
   DEV → SERVER — COSA C'È DAVVERO NELLA COPIA SALVATA

   🔷 «Ma sei sicuro che si salvi quello che faccio perché ho perso vari
   giorni.» / «In history vedo ancora come ultimo un mon che non è quello
   attuale.»

   ⚠️ FINO A QUI STAVAMO INDOVINANDO, ED È IL PROBLEMA VERO. Il salvataggio è
   l'unica parte del sistema che non ha mai avuto una finestra: quando
   qualcosa non torna si può solo dedurre — dal comportamento dell'app —
   se il server sia indietro, allineato o avanti. E una deduzione su un
   salvataggio è precisamente il genere di cosa che fa buttare via giorni
   veri per un sospetto sbagliato.

   Questa schermata mette i due conti UNO ACCANTO ALL'ALTRO — quello che ha
   questo telefono, e quello che ha il server. Se le due colonne non
   coincidono, lo vedi invece di sospettarlo.

   🔷 v2 — «mi devi mettere un tasto salva allora.» La lettura resta sola
   lettura di default: guardare non scrive niente. Ma un caso reale l'ha
   smentita — dopo un RICOMINCIA DA CAPO, `shouldDownload` protegge il
   reset per disegno e non scarica mai la copia del server da sola, per
   sempre. Giusto per non annullare un reset voluto per sbaglio — ma
   quando il reset NON era voluto, o si vuole comunque tornare indietro,
   quella decisione dev'esistere: presa da un umano che guarda i numeri,
   mai in automatico. `RIPRENDI DAL SERVER` fa esattamente quello, con la
   stessa conferma a due passi del RESET COMPLETO qui accanto. */

import { useCallback, useEffect, useState } from 'react';
import { restoreFromServer, useApp } from '../state/store';
import { Button, Row, SystemLabel } from '../system/components';

/** Quello che riusciamo a leggere dalla copia del server, che per il server è opaca. */
interface ServerPeek {
  day: number;
  savedAt: string | null;
  mons: number;
  activeMonName: string | null;
  kept: number;
  nodes: number;
}

/**
 * Il server tiene lo stato come `unknown` di proposito (vedi `state.ts`): non
 * sa cosa contiene e non deve saperlo. Qui lo si guarda dentro per la prima
 * volta, quindi ogni campo si legge in difesa — un salvataggio vecchio può
 * non avere una chiave che oggi diamo per scontata, e questa schermata deve
 * dire «non lo so» invece di rompersi proprio mentre stai cercando di capire
 * se hai perso dei dati.
 */
function peek(raw: unknown, day: number, savedAt: string | null): ServerPeek {
  const s = (raw ?? {}) as Record<string, unknown>;
  const mons = s.mons && typeof s.mons === 'object' ? Object.keys(s.mons as object).length : 0;
  const kept = Array.isArray(s.kept) ? s.kept.length : 0;
  const nodes = Array.isArray(s.nodes) ? s.nodes.length : 0;
  const active = typeof s.activeMonName === 'string' ? s.activeMonName : null;
  return { day, savedAt, mons, activeMonName: active, kept, nodes };
}

/** «Due minuti fa» dice più di un timestamp ISO quando la domanda è «sta salvando?». */
function quandoFa(iso: string | null): string {
  if (!iso) return 'mai';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const min = Math.round(ms / 60000);
  if (min < 1) return 'meno di un minuto fa';
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minuti'} fa`;
  const ore = Math.round(min / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? 'ora' : 'ore'} fa`;
  const giorni = Math.round(ore / 24);
  return `${giorni} ${giorni === 1 ? 'giorno' : 'giorni'} fa`;
}

export function ServerSection() {
  const token = useApp((s) => s.token);

  /* Il confronto ha senso solo se le due colonne sono lette nello STESSO
     istante: leggere il locale al primo render e il server due secondi dopo
     mostrerebbe una differenza che è solo il tempo passato in mezzo. */
  const [server, setServer] = useState<ServerPeek | null | 'loading' | 'error'>('loading');
  const [local, setLocal] = useState<ServerPeek | null>(null);

  const guarda = useCallback(() => {
    if (!token) {
      setServer('error');
      return;
    }
    setServer('loading');
    const s = useApp.getState();
    setLocal({
      day: s.day,
      savedAt: null,
      mons: Object.keys(s.mons).length,
      activeMonName: s.activeMonName,
      kept: s.kept.length,
      nodes: s.nodes.length,
    });
    void import('../ai/backend').then(({ loadRemote }) =>
      loadRemote(token).then(({ data, failure }) => {
        if (failure || !data) {
          setServer('error');
          return;
        }
        setServer(data.state == null ? null : peek(data.state, data.day, data.savedAt));
      }),
    );
  }, [token]);

  useEffect(guarda, [guarda]);

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">COSA C'È SUL SERVER</p>
      <p className="t-micro dev__note">
        La copia salvata, letta adesso e messa accanto a quella di questo
        telefono. Non scrive niente: guarda e basta.
      </p>

      {!token && (
        <p className="t-micro dev__note">
          Senza segreto non c'è niente da chiedere: il server non risponde a
          chi non si presenta. Attiva VINZ.MON e torna qui.
        </p>
      )}

      {server === 'loading' && <p className="t-micro dev__note">Sto chiedendo…</p>}

      {server === 'error' && token && (
        <p className="t-micro dev__note">
          Il server non ha risposto. Può essere la rete, o il segreto che non
          vale più — in tutti e due i casi questo telefono continua a
          funzionare da solo, ma NON sta salvando da nessuna parte.
        </p>
      )}

      {server === null && (
        <p className="t-micro dev__note">
          Il server risponde, ma non ha ancora nessun salvataggio. Se hai già
          giocato su questo telefono, vuol dire che nessuna scrittura è mai
          arrivata fino a lì.
        </p>
      )}

      {server && server !== 'loading' && server !== 'error' && local && (
        <>
          {/* Il verdetto sta in cima, prima dei numeri: chi apre questa
              schermata ha una domanda sola — «sta salvando?» — e deve
              leggere la risposta senza dover confrontare sei righe da sé. */}
          <Verdetto local={local} server={server} />

          <p className="t-meta dev__label">ULTIMA SCRITTURA</p>
          <div className="rowlist">
            <Row label="quando" value={quandoFa(server.savedAt)} />
          </div>

          <p className="t-meta dev__label">QUI · SERVER</p>
          <div className="rowlist">
            <Confronto etichetta="giorno" qui={local.day} la={server.day} />
            <Confronto etichetta="forme (.mon)" qui={local.mons} la={server.mons} />
            <Confronto etichetta="in teca" qui={local.kept} la={server.kept} />
            <Confronto etichetta="nodi mindline" qui={local.nodes} la={server.nodes} />
            <Confronto
              etichetta="mon attivo"
              qui={local.activeMonName ?? '—'}
              la={server.activeMonName ?? '—'}
            />
          </div>

          {(server.day > local.day ||
            server.mons > local.mons ||
            server.kept > local.kept ||
            server.nodes > local.nodes) && (
            <RestoreButton local={local} server={server} onDone={guarda} />
          )}
        </>
      )}

      <div className="dev__row">
        <Button small onClick={guarda} disabled={!token}>
          GUARDA DI NUOVO
        </Button>
      </div>
    </div>
  );
}

/**
 * La riga di confronto. Quando i due numeri coincidono non urla; quando
 * differiscono lo dichiara — ed è l'unico momento in cui questa schermata
 * serve davvero.
 */
function Confronto({
  etichetta,
  qui,
  la,
}: {
  etichetta: string;
  qui: number | string;
  la: number | string;
}) {
  const uguali = qui === la;
  return (
    <Row
      label={etichetta}
      value={
        <span>
          {qui} · {la}
          {!uguali && (
            <>
              {' '}
              <SystemLabel tone="warning">DIVERSI</SystemLabel>
            </>
          )}
        </span>
      }
    />
  );
}

/**
 * 🔒 IL VERDETTO GUARDA LA STORIA, NON IL GIORNO. Due copie possono stare
 * allo stesso giorno e contenere cose diverse — una forma nuova, un .mon
 * messo in teca, succedono DENTRO una giornata senza farla avanzare. È
 * esattamente il caso che ha fatto sparire dei progressi, quindi è il caso
 * che questa riga deve saper nominare.
 */
function Verdetto({ local, server }: { local: ServerPeek; server: ServerPeek }) {
  const indietro =
    server.day < local.day ||
    server.mons < local.mons ||
    server.kept < local.kept ||
    server.nodes < local.nodes;
  const avanti =
    server.day > local.day ||
    server.mons > local.mons ||
    server.kept > local.kept ||
    server.nodes > local.nodes;

  if (indietro && !avanti) {
    return (
      <p className="t-micro dev__note">
        🔴 IL SERVER È INDIETRO. Qualcosa che hai su questo telefono non è
        ancora arrivato nella copia salvata. Il salvataggio parte quattro
        secondi dopo l'ultima cosa che fai: se è appena successo, riguarda fra
        poco. Se resta indietro anche dopo, quella scrittura non sta partendo.
      </p>
    );
  }
  if (avanti && !indietro) {
    return (
      <p className="t-micro dev__note">
        🟡 IL SERVER HA PIÙ ROBA DI QUESTO TELEFONO. Se non hai mai fatto
        RICOMINCIA DA CAPO, si scarica da sola al prossimo avvio — non c'è
        niente da fare. Ma se hai resettato la partita, di proposito o per
        sbaglio, quel salvataggio resta bloccato apposta: usa RIPRENDI DAL
        SERVER qui sotto per tornare a quella copia.
      </p>
    );
  }
  if (avanti && indietro) {
    return (
      <p className="t-micro dev__note">
        🟠 LE DUE COPIE SONO DIVERSE IN DUE DIREZIONI. Ognuna ha qualcosa che
        l'altra non ha — succede se due dispositivi hanno giocato la stessa
        partita in parallelo. Non toccare niente da qui: dimmi cosa vedi.
      </p>
    );
  }
  return (
    <p className="t-micro dev__note">
      🟢 ALLINEATI. Quello che vedi nell'app è anche quello che c'è nella copia
      salvata: se chiudi tutto adesso, non perdi niente.
    </p>
  );
}

/**
 * 🔒 CONFERMA A DUE PASSI, COME RESET COMPLETO — e per lo stesso motivo:
 * questo pulsante SCARTA quello che questo telefono ha in più (o di
 * diverso) e lo sostituisce con la copia del server. Dice esplicitamente
 * cosa perde e cosa riprende, con i numeri veri, prima di poterlo fare.
 */
function RestoreButton({
  local,
  server,
  onDone,
}: {
  local: ServerPeek;
  server: ServerPeek;
  onDone: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [working, setWorking] = useState(false);

  if (!armed) {
    return (
      <div className="dev__row">
        <Button small variant="secondary" onClick={() => setArmed(true)}>
          RIPRENDI DAL SERVER
        </Button>
      </div>
    );
  }

  return (
    <div className="dev__control">
      <p className="t-small dev__note">
        Questo telefono torna alla copia del server: <strong>giorno {server.day}</strong>,{' '}
        {server.mons} {server.mons === 1 ? 'forma' : 'forme'}, {server.kept} in teca,{' '}
        mon attivo <strong>{server.activeMonName ?? '—'}</strong>.
        {' '}Perdi quello che c'è solo qui — giorno {local.day},{' '}
        {local.mons} {local.mons === 1 ? 'forma' : 'forme'}, {local.kept} in teca,{' '}
        mon attivo <strong>{local.activeMonName ?? '—'}</strong> — e non si torna indietro da qui.
      </p>
      <div className="dev__control dev__control--row">
        <Button small onClick={() => setArmed(false)} disabled={working}>
          Lascia stare
        </Button>
        <Button
          variant="secondary"
          small
          loading={working}
          onClick={() => {
            setWorking(true);
            void restoreFromServer().then(() => {
              setWorking(false);
              setArmed(false);
              onDone();
            });
          }}
        >
          Riprendi dal server
        </Button>
      </div>
    </div>
  );
}
