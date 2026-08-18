/* ============================================================================
   IMPORT DEGLI ASSET (§22.3)

   🔒 §22.3:
   • I file restituiti si risolvono contro gli `asset_id` di ASSET_MANIFEST.json,
     oppure tramite mappatura manuale dello slot.
   • Dopo l'import il prototipo sostituisce i segnaposto WAITING FOR IMAGE
     SENZA richiedere modifiche ai Character Data.
   • Se solo alcuni asset sono disponibili, il prototipo resta usabile e mostra
     chiaramente gli slot non risolti.

   Sta al posto della futura ingestione automatica (§25).
   ========================================================================= */

import { useRef, useState } from 'react';
import { useApp, useActiveMon } from '../state/store';
import { Button, Row, SystemLabel } from '../system/components';
import { ASSET_TYPES, assetTypeDef } from '../engine/assets';
import type { AssetType, MonRecord } from '../engine/types';
import { buildManifest } from '../assets-pipeline/manifest';
import { compilePrompt } from '../assets-pipeline/compiler';
import { generationOrder } from '../assets-pipeline/generate';
import { CopyButton } from '../system/CopyButton';
import { NoMon } from './NoMon';
import {
  clearAllAssets,
  importAssetFile,
  removeAsset,
  type ImportResult,
} from '../assets-pipeline/assetStore';

/**
 * Il prompt di uno slot: quello deterministico, e il pulsante per farlo
 * riscrivere.
 *
 * 🔒 Il pulsante SPARISCE quando il prompt è già stato riscritto, e al suo
 * posto resta la dicitura: un prompt si scrive una volta sola, e un tasto che
 * si può ripremere è un invito a ottenere una creatura diversa.
 */
function PromptCell({ mon, type }: { mon: MonRecord; type: AssetType }) {
  const compileAssetPrompt = useApp((s) => s.compileAssetPrompt);
  const token = useApp((s) => s.token);
  const written = mon.compiledPrompts?.[type];
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <>
      <CopyButton text={written ?? compilePrompt(mon, type).text} label="PROMPT" />
      {written ? (
        <SystemLabel tone="character">RISCRITTO</SystemLabel>
      ) : (
        <Button
          small
          disabled={busy || !token}
          onClick={() => {
            setBusy(true);
            setProblem(null);
            void compileAssetPrompt(mon.data.name, type)
              .then((why) => setProblem(why))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'SCRIVE…' : 'RISCRIVI'}
        </Button>
      )}
      {problem && <span className="t-micro cat__bad">{problem}</span>}
    </>
  );
}

export function AssetImport() {
  const mon = useActiveMon();
  const markAssetResolved = useApp((s) => s.markAssetResolved);
  const markAssetWaiting = useApp((s) => s.markAssetWaiting);

  const [results, setResults] = useState<ImportResult[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!mon) return <NoMon what="niente da caricare" />;

  const manifest = buildManifest(mon);

  const handleFiles = async (files: FileList | File[]) => {
    const out: ImportResult[] = [];
    const unmatched: File[] = [];

    for (const file of Array.from(files)) {
      const r = await importAssetFile(mon, file);
      out.push(r);

      if (r.status === 'resolved' && r.type) {
        // L'unica cosa che cambia nel record è lo stato dello slot.
        markAssetResolved(mon.data.name, r.type);
      } else if (r.status === 'unmatched') {
        unmatched.push(file);
      }
    }

    setResults(out);
    setPending(unmatched);
  };

  /** Mappatura manuale per i file che il nome non ha permesso di risolvere. */
  const assignManually = async (file: File, assetId: string) => {
    const r = await importAssetFile(mon, file, assetId);
    if (r.status === 'resolved' && r.type) {
      markAssetResolved(mon.data.name, r.type);
    }
    setResults((prev) => [...prev, r]);
    setPending((prev) => prev.filter((f) => f !== file));
  };

  const drop = async (type: AssetType) => {
    await removeAsset(mon.data.name, type);
    markAssetWaiting(mon.data.name, type);
  };

  const resolvedCount = ASSET_TYPES.filter(
    (a) => mon.data.asset_manifest_status[a.type] === 'resolved',
  ).length;

  return (
    <div className="import">
      <p className="t-meta dev__label">IMPORT ASSET — {mon.data.name}</p>
      <p className="t-micro dev__note">
        {resolvedCount}/{ASSET_TYPES.length} slot risolti. Gli slot vuoti non
        bloccano niente: restano dichiarati come WAITING FOR IMAGE.
      </p>

      <div
        className={`dropzone ${dragging ? 'dropzone--over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <p className="t-display dropzone__label">TRASCINA QUI I PNG</p>
        <p className="t-micro">
          I nomi vengono risolti contro ASSET_MANIFEST.json. Puoi anche
          selezionarli a mano.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => e.target.files && void handleFiles(e.target.files)}
        />
        <Button small onClick={() => inputRef.current?.click()}>
          SCEGLI I FILE
        </Button>
      </div>

      {/* Nomi attesi: evita il rimpallo su come chiamare i file. */}
      <details className="import__expected">
        <summary className="t-meta">NOMI FILE ATTESI</summary>
        <div className="rowlist">
          {manifest.assets.map((a) => (
            <Row key={a.asset_id} label={a.asset_id} value={a.file} />
          ))}
        </div>
      </details>

      {results.length > 0 && (
        <>
          <p className="t-meta dev__label">ESITO</p>
          <div className="rowlist">
            {results.map((r, i) => (
              <Row
                key={`${r.file}-${i}`}
                label={r.file}
                value={
                  <span className="import__result">
                    <SystemLabel
                      tone={
                        r.status === 'resolved'
                          ? 'positive'
                          : r.status === 'unmatched'
                            ? 'warning'
                            : 'alert'
                      }
                    >
                      {r.status === 'resolved' ? 'OK' : r.status === 'unmatched' ? '?' : 'NO'}
                    </SystemLabel>
                    <em className="t-micro">{r.message}</em>
                  </span>
                }
              />
            ))}
          </div>
        </>
      )}

      {pending.length > 0 && (
        <>
          <p className="t-meta dev__label">MAPPATURA MANUALE</p>
          {pending.map((file, i) => (
            <div key={`${file.name}-${i}`} className="import__manual">
              <span className="t-small">{file.name}</span>
              <select
                aria-label={`Slot per ${file.name}`}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) void assignManually(file, e.target.value);
                }}
              >
                <option value="" disabled>
                  scegli lo slot…
                </option>
                {ASSET_TYPES.map((a) => (
                  <option key={a.assetId} value={a.assetId}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          🔷 «Tienimi i prompt da copiare, sto iniziando a mettere a mano le
          immagini per vedere se funziona.»

          Il giro a mano è: copio il prompt → lo incollo altrove → salvo il PNG
          → lo trascino qui sopra → passo al prossimo. Il testo da copiare
          stava in un'altra scheda, quindi erano cinque passi con due cambi di
          schermata dentro. Adesso ogni riga porta il suo.

          🔒 IN ORDINE DI GENERAZIONE, non di catalogo: il ritratto per primo,
          perché è l'unico che si vede subito — home, social, scaffale. Farlo
          per ultimo vuol dire guardare un sigillo per un'ora avendo già
          cinque immagini pronte.
          ════════════════════════════════════════════════════════════════ */}
      <p className="t-meta dev__label">SLOT E PROMPT</p>
      <div className="rowlist">
        {generationOrder().map((type) => {
          const resolved = mon.data.asset_manifest_status[type] === 'resolved';
          return (
            <Row
              key={type}
              label={assetTypeDef(type).label}
              value={
                <span className="dev__slotrow">
                  {resolved ? (
                    <Button small variant="ghost" onClick={() => void drop(type)}>
                      RIMUOVI
                    </Button>
                  ) : (
                    <SystemLabel tone="warning">WAITING</SystemLabel>
                  )}
                  {/* Si copia anche per uno slot già risolto: se un'immagine
                      non ti piace la rifai, e in quel momento serve lo STESSO
                      testo — non uno diverso. */}
                  <PromptCell mon={mon} type={type} />
                </span>
              }
            />
          );
        })}
      </div>

      <Button
        block
        small
        variant="secondary"
        onClick={() => {
          void clearAllAssets();
          ASSET_TYPES.forEach((a) => markAssetWaiting(mon.data.name, a.type));
          setResults([]);
          setPending([]);
        }}
      >
        CANCELLA TUTTI GLI ASSET IMPORTATI
      </Button>
    </div>
  );
}
