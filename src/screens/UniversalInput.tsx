/* ============================================================================
   07 — REGISTRA (MASTER SPEC v1.9 §5.2)

   🔶 Riscritta da capo. Prima erano quattro righe da scegliere — CAMERA, TELL,
   MEASURE, WORKOUT — e poi una nota facoltativa. Il problema non era estetico:
   **costringeva a classificare prima di raccontare.** Devi decidere che tipo di
   dato stai per inserire, e solo dopo puoi dirlo. È l'ordine sbagliato: uno sa
   cosa gli è successo, non in quale casella il sistema lo mette.

   Adesso c'è un campo solo. Scrivi «carbonara e poi palestra, peso 78, sono
   distrutto» e il sistema riconosce quattro cose insieme. O fotografi il piatto
   e non scrivi niente.

   La cosa importante è che **quello che ha capito si vede prima di confermare**,
   non dopo. Un sistema che interpreta in silenzio è un sistema di cui non ti
   puoi fidare: se sbaglia devi poterlo vedere e correggere scrivendo meglio,
   subito, senza cercare dove si modifica.

   §1 — «prima i dati automatici, poi foto e linguaggio naturale, i moduli solo
   quando non se ne può fare a meno». Qui i moduli non ci sono per niente.
   ========================================================================= */

import { useMemo, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { Button, IconButton, TextField } from '../system/components';
import { extractFromMessage, isEmptyExtraction } from '../engine/chatExtract';
import { DAILY_SIGNAL_LABELS } from '../engine/progression';
import { haptic } from '../system/haptics';
import { t } from '../i18n/it';

export function UniversalInputScreen({ onClose }: { onClose: () => void }) {
  const captureEntry = useApp((s) => s.captureEntry);
  const apiKey = useApp((s) => s.apiKey);

  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ name: string; dataUrl: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // L'interpretazione gira mentre scrivi: deve essere istantanea, altrimenti
  // non è un riscontro, è un'attesa.
  const found = useMemo(() => extractFromMessage(text), [text]);
  const nothing = isEmptyExtraction(found) && !photo;

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto({ name: file.name, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const confirm = () => {
    if (nothing) return;
    haptic('impact');
    captureEntry(text, photo?.dataUrl ?? null);
    onClose();
  };

  return (
    <div className="screen sheet">
      <div className="sheet__head">
        <div>
          <h1 className="t-display sheet__title">{t.input.title}</h1>
          <p className="t-small sheet__sub">{t.input.subtitle}</p>
        </div>
        <IconButton icon="close" label={t.common.close} light onClick={onClose} />
      </div>

      <div className="screen__body sheet__body capture">
        <TextField
          label={t.input.field}
          placeholder={t.input.placeholder}
          value={text}
          onChange={setText}
          multiline
        />

        {/* --- Cosa ha capito. Prima di confermare, non dopo. ---

            🔷 v1.10 — e prima del pulsante della foto, non dopo. Stava sotto,
            cioè la cosa che DEVI leggere era più in basso di quella che usi di
            rado, e il pulsante foto pesava di più graficamente. Adesso quello
            che il sistema ha capito segue immediatamente quello che hai
            scritto: sono la stessa conversazione. --- */}
        <section className="capture__read">
          <p className="t-meta">{t.input.understood}</p>

          {nothing ? (
            <p className="t-small capture__nothing">{t.input.nothingYet}</p>
          ) : (
            <ul className="capture__list">
              {(['FOOD', 'WORKOUT', 'MOOD'] as const).map((key) => {
                const entry = found.signals[key];
                if (!entry) return null;
                return (
                  <li key={key} className="capture__item">
                    <span className="capture__mark" aria-hidden="true">■</span>
                    <span className="t-meta">{DAILY_SIGNAL_LABELS[key]}</span>
                    <span className="t-micro capture__detail">
                      {entry.status === 'NOT_APPLICABLE' ? t.input.notApplicable : entry.note}
                    </span>
                  </li>
                );
              })}

              {found.measures.map((m) => (
                <li key={m.label} className="capture__item">
                  <span className="capture__mark" aria-hidden="true">■</span>
                  <span className="t-meta">{m.label.toUpperCase()}</span>
                  <span className="t-micro capture__detail">
                    {m.value}
                    {m.unit}
                  </span>
                </li>
              ))}

              {photo && (
                <li className="capture__item">
                  <span className="capture__mark" aria-hidden="true">
                    {apiKey ? '■' : '◐'}
                  </span>
                  <span className="t-meta">FOTO</span>
                  <span className="t-micro capture__detail">
                    {apiKey ? t.input.photoWithAi : t.input.photoNoAi}
                  </span>
                </li>
              )}
            </ul>
          )}

          <p className="t-micro capture__note">{t.input.correctHint}</p>
        </section>
        {/* La foto è un'alternativa allo scrivere, non un allegato: sta accanto
            al campo e non sotto una voce di menu sua. Sotto la lettura perché
            è la strada meno battuta delle due. */}
        <div className="capture__photo">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => pickPhoto(e.target.files?.[0])}
          />
          {photo ? (
            <div className="capture__thumb">
              <img src={photo.dataUrl} alt="" />
              <span className="t-micro capture__thumbname">{photo.name}</span>
              <Button small variant="ghost" onClick={() => setPhoto(null)}>
                {t.input.removePhoto}
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              icon="camera"
              block
              onClick={() => fileRef.current?.click()}
            >
              {t.input.addPhoto}
            </Button>
          )}
        </div>

      </div>

      {/* 🔷 v1.10 — c'erano due modi per annullare: la ✕ in alto a destra e un
          ANNULLA a tutta larghezza qui sotto. Due uscite per la stessa porta
          fanno esitare invece che rassicurare, e quella in basso rubava
          spazio all'unica azione che conta. */}
      <footer className="screen__foot">
        <Button variant="primary" block disabled={nothing} onClick={confirm}>
          {t.input.confirm}
        </Button>
      </footer>
    </div>
  );
}
