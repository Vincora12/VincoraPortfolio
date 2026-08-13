/* ============================================================================
   03 — PERSONALITY / SIGNAL SCAN (MASTER SPEC v1.8 §12)

   🔒 Il formato è vincolato alla lettera: «One question per screen, 01/12–12/12,
   2–4 large answers, mixed text/silhouette/material/symbol choices. Final CTA:
   LOCK SIGNAL.»

   🔒 «Never ask the user to choose Family. Answers feed hidden latent vectors
   only.» Il divieto non è solo di non scrivere «FAMILY» su un pulsante: è di
   non far capire cosa sta spostando una risposta. Per questo la schermata non
   mostra nessuna anteprima, nessuna barra che si riempie, nessun «ti stai
   avvicinando a…». Se l'utente potesse ottimizzare sceglierebbe la creatura,
   e §12 esiste proprio perché non la scelga.

   Le domande e i pesi stanno in `engine/personalityScan.ts`. Qui c'è solo il
   modo di farle.

   Si può tornare indietro e cambiare idea fino a LOCK SIGNAL: prima del lock
   niente è deciso, e dopo il lock non si torna (§2 — il seme è stabile).
   ========================================================================= */

import { useState } from 'react';
import { useApp, useScan } from '../state/store';
import { Button, ScreenHead } from '../system/components';
import { SCAN_QUESTIONS, type ScanAnswer } from '../engine/personalityScan';
import { haptic } from '../system/haptics';
import { t } from '../i18n/it';

export function PersonalityScanScreen() {
  const { answers, complete } = useScan();
  const answerScan = useApp((s) => s.answerScan);
  const lockSignal = useApp((s) => s.lockSignal);

  const [step, setStep] = useState(0);
  const q = SCAN_QUESTIONS[step]!;
  const chosen = answers[q.index];
  const last = step === SCAN_QUESTIONS.length - 1;

  const choose = (id: string) => {
    haptic('tick');
    answerScan(q.index, id);
    // Avanza da sé: una domanda per schermata vuol dire che il passaggio non
    // deve costare un secondo tocco. Sull'ultima resta ferma, perché lì il
    // gesto successivo è LOCK SIGNAL e non va anticipato per sbaglio.
    if (!last) window.setTimeout(() => setStep((v) => v + 1), 180);
  };

  return (
    <div className="screen screen--ink scan03">
      <ScreenHead title={t.scan03.title} sub={t.scan03.subtitle} />

      <div className="screen__body scan03__body">
        <div className="scan03__index">
          <span className="t-meta">
            {String(q.index).padStart(2, '0')} / {SCAN_QUESTIONS.length}
          </span>
          {/* Avanzamento come tacche, non come percentuale: dice a che punto
              sei, non quanto manca a un premio. */}
          <span className="scan03__ticks" aria-hidden="true">
            {SCAN_QUESTIONS.map((other) => (
              <span
                key={other.index}
                className={`scan03__tick ${
                  answers[other.index] ? 'scan03__tick--done' : ''
                } ${other.index === q.index ? 'scan03__tick--here' : ''}`}
              />
            ))}
          </span>
        </div>

        <h2 className="t-display scan03__question">{q.question}</h2>

        <div className="scan03__answers">
          {q.answers.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`scan03__answer ${chosen === a.id ? 'scan03__answer--on' : ''}`}
              aria-pressed={chosen === a.id}
              onClick={() => choose(a.id)}
            >
              {a.glyph && <Glyph kind={a.glyph} />}
              <span className="scan03__answertext">{a.label}</span>
              {/* Lo stato non è solo colore (§17). */}
              <span className="scan03__mark" aria-hidden="true">
                {chosen === a.id ? '■' : '□'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <footer className="screen__foot screen__foot--stack">
        {last && complete ? (
          <Button variant="primary" block haptics="impact" onClick={lockSignal}>
            {t.scan03.lock}
          </Button>
        ) : (
          <Button
            variant="primary"
            block
            disabled={!chosen}
            onClick={() => setStep((v) => Math.min(SCAN_QUESTIONS.length - 1, v + 1))}
          >
            {chosen ? t.scan03.next : t.scan03.pick}
          </Button>
        )}

        <div className="scan03__foot">
          <Button
            variant="ghost"
            small
            disabled={step === 0}
            onClick={() => setStep((v) => Math.max(0, v - 1))}
          >
            {t.scan03.back}
          </Button>
          <p className="t-micro scan03__note">{t.scan03.note}</p>
        </div>
      </footer>
    </div>
  );
}

/* --- Glifi -------------------------------------------------------------------
   §12 vuole risposte «mixed text/silhouette/material/symbol». Sono disegni di
   sistema, non illustrazioni: stesso tratto delle icone, nessun riempimento,
   nessun personaggio. §18A vieta di inventare arte, e una silhouette astratta
   non anticipa nessuna creatura.
   -------------------------------------------------------------------------- */

function Glyph({ kind }: { kind: NonNullable<ScanAnswer['glyph']> }) {
  return (
    <svg
      className="scan03__glyph"
      viewBox="0 0 48 48"
      width={40}
      height={40}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      {GLYPHS[kind]}
    </svg>
  );
}

const GLYPHS: Record<NonNullable<ScanAnswer['glyph']>, React.ReactNode> = {
  /* Silhouette */
  compact: <rect x={14} y={16} width={20} height={20} />,
  tall: <rect x={18} y={6} width={12} height={36} />,
  wide: <rect x={5} y={17} width={38} height={16} />,
  skew: <path d="M12 40 L16 10 L36 16 L30 40 Z" />,

  /* Materiali */
  gloss: (
    <>
      <circle cx={24} cy={24} r={15} />
      <path d="M17 17 a10 10 0 0 1 7 -3" strokeWidth={3} />
    </>
  ),
  matte: <circle cx={24} cy={24} r={15} strokeDasharray="1 3" />,
  rough: (
    <path d="M9 30 l5 -7 l4 5 l6 -11 l5 9 l4 -5 l6 9" />
  ),
  clear: (
    <>
      <circle cx={24} cy={24} r={15} strokeDasharray="5 4" />
      <path d="M14 30 L30 14" />
    </>
  ),

  /* Ottica (§9 — categorie, mai un modello preciso) */
  'optic-tall': (
    <>
      <rect x={6} y={16} width={15} height={17} />
      <rect x={27} y={16} width={15} height={17} />
      <path d="M21 24 h6" />
    </>
  ),
  'optic-narrow': (
    <>
      <rect x={5} y={21} width={16} height={7} />
      <rect x={27} y={21} width={16} height={7} />
      <path d="M21 24 h6" />
    </>
  ),
  'optic-wrap': (
    <>
      <path d="M5 20 q19 -6 38 0 q-3 12 -19 12 q-16 0 -19 -12 Z" />
    </>
  ),
  'optic-none': (
    <>
      <path d="M6 24 q18 -5 36 0" strokeDasharray="4 4" />
      <path d="M6 28 q18 5 36 0" strokeDasharray="4 4" />
    </>
  ),

  /* Costruzione */
  soft: <path d="M24 8 q16 6 16 20 q0 12 -16 12 q-16 0 -16 -12 q0 -14 16 -20 Z" />,
  segmented: (
    <>
      <rect x={16} y={7} width={16} height={9} />
      <rect x={16} y={20} width={16} height={9} />
      <rect x={16} y={33} width={16} height={9} />
    </>
  ),
  branched: (
    <>
      <path d="M24 42 V22" />
      <path d="M24 22 L12 8" />
      <path d="M24 22 L36 8" />
      <path d="M24 30 L14 22" />
    </>
  ),
  suspended: (
    <>
      <path d="M24 6 V18" strokeDasharray="3 3" />
      <circle cx={24} cy={28} r={11} />
    </>
  ),
};
