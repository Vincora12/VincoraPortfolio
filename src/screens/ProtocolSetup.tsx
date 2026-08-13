/* ============================================================================
   04 — PROTOCOLLO (MASTER SPEC v1.10 §5.3)

   🔶 «Appena entro nel gioco devo caricare un po' di dati sulla dieta e
   sull'allenamento.»

   Sta fra il Signal Scan e l'incubazione, ed è l'ultima cosa prima che il
   tempo cominci. L'ordine non è casuale: lo scan semina CHI SEI, il protocollo
   dichiara COSA STAI PROVANDO A FARE. La creatura nasce dalla distanza fra le
   due cose.

   🔒 Nessun campo preimpostato — §5.2 vale qui esattamente come nella
   registrazione quotidiana. Due aree di testo, si incolla e basta. Chi segue
   una dieta ce l'ha già scritta da qualche parte; chiedergli di ricopiarla in
   quindici menu a tendina sarebbe il modo più veloce per fargli chiudere l'app
   al primo minuto.

   🔒 Si può saltare. Senza protocollo il cibo si registra lo stesso e
   l'aderenza resta SCONOSCIUTA — che è la risposta onesta quando manca il
   metro, non un buco da riempire. Nessuna schermata insisterà dopo.

   🔒 Quello che il sistema ha capito si vede MENTRE scrivi, sotto al campo.
   Stessa regola della chat: interpretare in silenzio è peggio che non
   interpretare, perché non sai cosa correggere.
   ========================================================================= */

import { useState } from 'react';
import { useApp } from '../state/store';
import { Button, ScreenHead } from '../system/components';
import { describeDiet, describeTraining, parseDiet, parseTraining } from '../engine/protocol';
import { t } from '../i18n/it';

export function ProtocolSetupScreen() {
  const declareProtocol = useApp((s) => s.declareProtocol);
  const skipProtocol = useApp((s) => s.skipProtocol);
  const existing = useApp((s) => s.protocol);

  const [diet, setDiet] = useState(existing.diet?.text ?? '');
  const [training, setTraining] = useState(existing.training?.text ?? '');

  // L'interpretazione gira a ogni tasto: è deterministica e non costa niente,
  // quindi non c'è motivo di farla aspettare un pulsante.
  const readDiet = describeDiet(parseDiet(diet));
  const readTraining = describeTraining(parseTraining(training));
  const anything = diet.trim().length > 0 || training.trim().length > 0;

  return (
    <div className="screen protocol">
      <ScreenHead title={t.protocol.title} sub={t.protocol.subtitle} />

      <div className="screen__body protocol__body">
        <p className="t-small protocol__intro">{t.protocol.intro}</p>

        <Field
          label={t.protocol.dietLabel}
          hint={t.protocol.dietHint}
          placeholder={t.protocol.dietPlaceholder}
          value={diet}
          onChange={setDiet}
          read={readDiet}
        />

        <Field
          label={t.protocol.trainingLabel}
          hint={t.protocol.trainingHint}
          placeholder={t.protocol.trainingPlaceholder}
          value={training}
          onChange={setTraining}
          read={readTraining}
        />

        <p className="t-micro protocol__note">{t.protocol.note}</p>
      </div>

      <footer className="protocol__foot">
        <Button
          variant="primary"
          block
          haptics="confirm"
          disabled={!anything}
          onClick={() => declareProtocol(diet, training)}
        >
          {t.protocol.confirm}
        </Button>
        <button type="button" className="protocol__skip t-micro" onClick={skipProtocol}>
          {t.protocol.skip}
        </button>
      </footer>
    </div>
  );
}

function Field({
  label,
  hint,
  placeholder,
  value,
  onChange,
  read,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  read: string | null;
}) {
  return (
    <label className="protocol__field">
      <span className="t-meta protocol__label">{label}</span>
      <span className="t-micro protocol__hint">{hint}</span>
      <textarea
        className="protocol__area"
        rows={5}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {/* Quello che ha capito, o il fatto onesto che non ha capito niente:
          entrambe le informazioni servono prima di confermare, non dopo. */}
      {value.trim().length > 0 && (
        <span className={`protocol__read t-micro ${read ? '' : 'protocol__read--empty'}`}>
          {read ?? t.protocol.unread}
        </span>
      )}
    </label>
  );
}
