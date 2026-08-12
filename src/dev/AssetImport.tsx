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
import type { AssetType } from '../engine/types';
import { buildManifest } from '../assets-pipeline/manifest';
import {
  clearAllAssets,
  importAssetFile,
  removeAsset,
  type ImportResult,
} from '../assets-pipeline/assetStore';

export function AssetImport() {
  const mon = useActiveMon();
  const markAssetResolved = useApp((s) => s.markAssetResolved);
  const markAssetWaiting = useApp((s) => s.markAssetWaiting);

  const [results, setResults] = useState<ImportResult[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!mon) return null;

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
    (a) => mon.data.assetStatus[a.type] === 'resolved',
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

      <p className="t-meta dev__label">SLOT</p>
      <div className="rowlist">
        {ASSET_TYPES.map((a) => {
          const resolved = mon.data.assetStatus[a.type] === 'resolved';
          return (
            <Row
              key={a.type}
              label={assetTypeDef(a.type).label}
              value={
                resolved ? (
                  <Button small variant="ghost" onClick={() => void drop(a.type)}>
                    RIMUOVI
                  </Button>
                ) : (
                  <SystemLabel tone="warning">WAITING</SystemLabel>
                )
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
