/* ============================================================================
   DEV → STRUMENTI (§20.1, §21)

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ ESISTE PERCHÉ GLI STRUMENTI SI POSSONO ROMPERE IN UN MODO NUOVO.

   Tutto il resto del motore è deterministico: dai gli stessi ingressi e torna
   la stessa cosa, quindi un controllo automatico basta. Gli strumenti no —
   quello che li fa partire è un modello che decide da solo, e senza chiavi non
   decide niente.

   Se l'unico modo di provarli fosse una conversazione vera, allora fino a
   quando le chiavi non ci sono un errore in `runTool` resterebbe invisibile.
   Qui invece si esegue lo strumento CON I DATI VERI e si vede esattamente
   quello che il modello leggerebbe — che è l'unica cosa che conta, perché è
   l'unica che gli arriva.
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

import { useState } from 'react';
import { useApp } from '../state/store';
import { Button, Row, SystemLabel } from '../system/components';
import { TOOLS } from '../ai/tools';

/* Argomenti di prova sensati: si preme e si vede, senza doverli scrivere. */
const SAMPLE_ARGS: Record<string, unknown> = {
  leggi_i_miei_dati: { cosa: 'salute' },
  elenca_le_pagine: {},
  leggi_una_pagina: { nome: 'dieta' },
  scrivi_una_pagina: {
    titolo: 'Prova dal pannello DEV',
    markdown:
      '# Prova\n\nUna pagina scritta dal pannello, per vedere come viene.\n\n## Cose\n\n- prima\n- seconda\n\n| Pasto | Cosa |\n| --- | --- |\n| Colazione | uova |\n| Cena | pesce |\n\n- [x] fatta\n- [ ] da fare\n',
    appuntala: false,
  },
  aggiorna_una_pagina: {
    nome: 'prova-dal-pannello-dev',
    sezione: 'Cose',
    testo: '- riscritta dal pannello',
  },
  ricorda_di: { cosa: 'Prendi le misure.', fra_giorni: 1, ogni_giorni: 7 },
};

export function ToolsSection() {
  const runMonTool = useApp((s) => s.runMonTool);
  const pages = useApp((s) => s.pages);
  const reminders = useApp((s) => s.reminders);
  const day = useApp((s) => s.day);
  const lastToolUses = useApp((s) => s.lastToolUses);

  const [picked, setPicked] = useState<string>(TOOLS[0]!.name);
  const [args, setArgs] = useState<string>(JSON.stringify(SAMPLE_ARGS[TOOLS[0]!.name], null, 1));
  const [out, setOut] = useState<{ text: string; error: boolean } | null>(null);

  const choose = (name: string) => {
    setPicked(name);
    setArgs(JSON.stringify(SAMPLE_ARGS[name] ?? {}, null, 1));
    setOut(null);
  };

  const run = () => {
    let input: unknown;
    try {
      input = JSON.parse(args);
    } catch {
      setOut({ text: 'Gli argomenti non sono JSON valido.', error: true });
      return;
    }

    const res = runMonTool({ id: 'dev', name: picked, input });
    setOut({ text: res.content, error: res.isError === true });
  };

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">STRUMENTI DISPONIBILI · {TOOLS.length}</p>
      <p className="t-small dev__note">
        Quello che vedi sotto è esattamente il testo che tornerebbe al modello.
        Gli strumenti che scrivono cambiano lo stato vero: una pagina creata da
        qui è una pagina vera.
      </p>

      <div className="tools__picker">
        {TOOLS.map((t) => (
          <button
            key={t.name}
            type="button"
            className={`tools__pick ${picked === t.name ? 'tools__pick--on' : ''}`}
            aria-pressed={picked === t.name}
            onClick={() => choose(t.name)}
          >
            {t.name}
          </button>
        ))}
      </div>

      <p className="t-small dev__note">{TOOLS.find((t) => t.name === picked)?.description}</p>

      <label className="tools__args">
        <span className="t-micro">ARGOMENTI (JSON)</span>
        <textarea
          className="dev__json tools__textarea"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          rows={6}
          spellCheck={false}
        />
      </label>

      <div className="dev__control">
        <Button block onClick={run}>
          Esegui
        </Button>
      </div>

      {out && (
        <>
          <p className="t-meta dev__label">
            COSA LEGGEREBBE {out.error && <SystemLabel tone="alert">ERRORE</SystemLabel>}
          </p>
          <pre className="dev__pre tools__out">{out.text}</pre>
        </>
      )}

      <p className="t-meta dev__label">STATO</p>
      <div className="rowlist">
        <Row label="GIORNO" value={String(day)} />
        <Row label="PAGINE" value={pages.length === 0 ? 'nessuna' : `${pages.length}`} />
        <Row
          label="PROMEMORIA"
          value={
            reminders.length === 0
              ? 'nessuno'
              : reminders
                  .map((r) => `giorno ${r.dueDay}${r.everyDays ? ` (ogni ${r.everyDays})` : ''}`)
                  .join(' · ')
          }
        />
        <Row
          label="ULTIMA RISPOSTA"
          value={lastToolUses.length === 0 ? 'nessuno strumento' : lastToolUses.join(' · ')}
        />
      </div>
    </div>
  );
}
