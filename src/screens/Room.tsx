/* ============================================================================
   MIND.SOCIAL (§21.4) — vedi `docs/LORE.md` → «Il dex è una stanza»

   ════════════════════════════════════════════════════════════════════════════
   🔒 TU LEGGI. NON RISPONDI.

   Non c'è un campo di testo in questa schermata, e non è una dimenticanza. Un
   filo in cui intervieni diventa una chat di gruppo, e a quel punto le entità
   non sono più una sola — che è la tesi su cui poggia tutto il progetto.

   L'unica cosa che puoi fare è mettere un mi piace: dice cosa ti è piaciuto
   senza farti entrare nella stanza.
   ════════════════════════════════════════════════════════════════════════════

   🔒 E NIENTE SI GENERA DA SOLO. Un post esiste appena succede il fatto, ma
   senza parole. Le parole le chiedi tu, una volta, e restano quelle: una cosa
   che cambia a ogni rilettura non è un ricordo.
   ========================================================================= */

import { useState } from 'react';
import { useApp } from '../state/store';
import { MonName } from '../system/MonName';
import { MonAvatar } from '../system/MonAvatar';
import { Button, SystemLabel } from '../system/components';
import { roomNotice, type RoomPost } from '../engine/room';
import type { SigilSeed } from '../engine/types';
import { t } from '../i18n/it';

export function RoomScreen() {
  const room = useApp((s) => s.room);
  const notice = roomNotice(room);

  /* Il più recente in cima: è l'unico ordine sensato per un filo, e coincide
     con «l'ultima cosa successa». */
  const posts = [...room].sort((a, b) => b.day - a.day || b.id.localeCompare(a.id));

  return (
    <div className="screen screen--ink room">
      <div className="screen__body room__body">
        {notice && (
          <p className="room__notice t-small">
            {/* La notifica dice COSA È SUCCESSO, non «c'è del contenuto»: se non
                apri, non ti sei perso niente di finto. */}
            {notice}
          </p>
        )}

        {posts.length === 0 ? (
          <p className="t-small room__empty">{t.room.empty}</p>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<RoomPost['kind'], string> = {
  ARRIVO: 'È ARRIVATO',
  SU_VINZ: 'SU VINZ.MON',
  SETTIMANA: 'LA SETTIMANA',
};

/** Il sigillo di un .mon, che sia ancora in gioco o già nella teca. */
function useSigilOf(name: string): SigilSeed | null {
  return useApp(
    (s) =>
      s.mons[name]?.sigil ??
      s.kept.find((k) => k.record.data.name === name)?.record.sigil ??
      null,
  );
}

function PostCard({ post }: { post: RoomPost }) {
  const writeRoom = useApp((s) => s.writeRoom);
  const sigil = useSigilOf(post.from);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const write = () => {
    setBusy(true);
    setFailed(null);
    void writeRoom(post.id)
      .then((f) => {
        if (f) setFailed(f === 'no-token' ? t.room.needsToken : t.room.failed);
      })
      .finally(() => setBusy(false));
  };

  return (
    /* Impaginazione da timeline: avatar a sinistra, tutto il resto in una
       colonna a destra. È la forma che rende leggibile un filo di voci diverse
       — si scorre riconoscendo le facce, non leggendo i nomi. */
    <article className="post">
      <span className="post__avatar">
        <MonAvatar monName={post.from} sigil={sigil} size={40} />
      </span>

      <div className="post__col">
        <header className="post__head">
          <span className="t-meta post__from">
            <MonName name={post.from} hideExtension />
          </span>
          <span className="t-micro post__kind">
            {KIND_LABEL[post.kind]} · G{post.day}
          </span>
        </header>

      {post.text === null ? (
        <>
          {/* Prima di generare si vede comunque il FATTO: il filo ha una forma
              leggibile anche a costo zero. */}
          <p className="post__about t-small">{post.about}</p>
          <div className="post__actions">
            <Button variant="secondary" small onClick={write} loading={busy}>
              {busy ? t.room.writing : t.room.write}
            </Button>
          </div>
          {failed && <p className="t-micro post__failed">{failed}</p>}
        </>
      ) : (
        <p className="post__text">{post.text}</p>
      )}

      <Reactions post={post} />

      {post.comments.length > 0 && (
        <ul className="post__comments">
          {post.comments.map((c) => (
            <CommentRow key={c.from} from={c.from} text={c.text} />
          ))}
        </ul>
      )}
      </div>
    </article>
  );
}

function CommentRow({ from, text }: { from: string; text: string }) {
  const sigil = useSigilOf(from);
  return (
    <li className="comment">
      <MonAvatar monName={from} sigil={sigil} size={22} />
      <span className="comment__body">
        <span className="t-micro comment__from">
          <MonName name={from} hideExtension />
        </span>
        <span className="t-small comment__text">{text}</span>
      </span>
    </li>
  );
}

/**
 * Chi si è schierato.
 *
 * 🔒 Questi nomi NON sono generati: escono da `kinship()`, cioè da tratti,
 * spinte, affinity ed eredità. È la parte che rende il filo leggibile senza
 * spendere un centesimo — e la parte che resta vera anche senza chiave.
 */
function LikeFace({ name }: { name: string }) {
  const sigil = useSigilOf(name);
  return (
    <span className="post__likeface" title={name}>
      <MonAvatar monName={name} sigil={sigil} size={18} />
    </span>
  );
}

function Reactions({ post }: { post: RoomPost }) {
  if (post.likes.length === 0 && post.voices.length === 0) {
    /* Il primo arrivo non ha nessuno che lo accolga: la stanza era vuota. Si
       dice, invece di lasciare un buco che sembra un errore. */
    return <p className="t-micro post__alone">{t.room.alone}</p>;
  }

  return (
    <div className="post__reactions">
      {post.likes.length > 0 && (
        <span className="post__likes">
          <span className="post__likefaces">
            {post.likes.slice(0, 5).map((n) => (
              <LikeFace key={n} name={n} />
            ))}
          </span>
          <span className="t-micro">
            {post.likes.length} {post.likes.length === 1 ? t.room.likeOne : t.room.likeMany}
          </span>
        </span>
      )}
      {post.text === null && post.voices.length > 0 && (
        <SystemLabel>
          {post.voices.length} {t.room.toSay}
        </SystemLabel>
      )}
    </div>
  );
}
