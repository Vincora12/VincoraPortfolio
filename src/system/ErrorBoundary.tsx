/* ============================================================================
   QUANDO SI ROMPE, DEVE DIRLO (§26)

   🔷 «A me esce grigio.»

   Il grigio è `#c9c9cf`, il fondo del `body`. Vuol dire che React non ha
   montato NIENTE: si vede la pagina sotto e nient'altro. Non è una schermata,
   è l'assenza di schermate.

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ E NON C'ERA MODO DI SAPERE PERCHÉ.

   Un errore dentro un render fa smontare tutto l'albero, in silenzio. Sul
   telefono, dentro un'app aggiunta alla home, non c'è una console da aprire:
   c'è il grigio, e la sensazione che l'app sia morta.

   🔒 Questo componente non «gestisce l'errore»: lo RENDE LEGGIBILE. Dice cosa
   si è rotto, con la riga vera, e dà due vie d'uscita — riprova, oppure
   cancella i dati di questo browser. La seconda è quella che serve davvero,
   perché la causa più probabile di un avvio che non parte è un salvataggio
   scritto da una versione diversa da quella che sta girando.
   ════════════════════════════════════════════════════════════════════════════

   🔒 CANCELLARE È L'ULTIMA OPZIONE E LO DICE. Il pulsante non è comodo per
   caso: butta via mesi, e la teca dei .mon conservati sta nello stesso posto.
   Prima si offre di ricaricare, che risolve i casi transitori senza costare
   niente.
   ========================================================================= */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { postRuntimeEvent } from './runtimeLog';
import { lastStorageOperation } from './localStorageDiagnostics';

interface State {
  error: Error | null;
  where: string | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, where: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    /* Il pezzo di albero dove è successo: senza, «Cannot read properties of
       undefined» non dice quale delle sessanta schermate. */
    const where = (info.componentStack ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(' ← ');
    this.setState({ where });
    console.error('[vinz.mon] render fallito', error, info.componentStack);
    postRuntimeEvent({
      eventType: 'CLIENT_RUNTIME_ERROR', status: 'FAIL', scope: 'system', action: 'render',
      error: error.message, errorName: error.name,
      ...(typeof (error as Error & { code?: unknown }).code === 'number' ? { errorCode: (error as Error & { code: number }).code } : {}),
      errorMessage: error.message,
      metadata: { screen: 'error-boundary' },
    });
  }

  render() {
    const { error, where } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash">
        <p className="t-meta crash__label">VINZ.MON NON È RIUSCITO AD APRIRSI</p>

        <p className="t-small">
          Non è un tuo errore e non hai perso niente: i dati sono ancora nel
          browser. Si è rotto il disegno della schermata.
        </p>

        {/* 🔒 Il testo dell'errore SI VEDE. È brutto, ed è l'unica cosa che
            permette di capire cos'è successo da un telefono, dove non c'è una
            console da aprire. Un messaggio gentile e generico qui vorrebbe
            dire non poterlo mai riparare. */}
        <pre className="crash__what">{error.message || String(error)}</pre>
        {lastStorageOperation && (
          <pre className="crash__what" aria-label="LAST STORAGE OPERATION">{[
            'LAST STORAGE OPERATION',
            `STATUS: ${lastStorageOperation.status}`,
            `SOURCE: ${lastStorageOperation.source}`,
            `OPERATION: ${lastStorageOperation.operation}`,
            `KEY PREFIX: ${lastStorageOperation.keyPrefix}`,
            `PAYLOAD BYTES: ${lastStorageOperation.payloadBytes}`,
            `ERROR NAME: ${lastStorageOperation.errorName ?? '—'}`,
            `ERROR MESSAGE: ${lastStorageOperation.errorMessage ?? '—'}`,
            `ERROR CODE: ${lastStorageOperation.errorCode ?? '—'}`,
          ].join('\n')}</pre>
        )}
        {where && <p className="t-micro crash__where">{where}</p>}

        <div className="crash__actions">
          <button type="button" className="btn btn--primary" onClick={() => location.reload()}>
            RICARICA
          </button>
        </div>

        <p className="t-micro crash__last">
          Se ricaricando succede di nuovo, è quasi certamente un salvataggio
          scritto da una versione diversa da questa. L’ultima spiaggia è
          cancellare i dati di questo browser — e cancella <strong>tutto</strong>,
          teca compresa.
        </p>
        <div className="crash__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              /* Si toglie SOLO la chiave dell'app, non tutto il dominio:
                 `localStorage.clear()` porterebbe via anche cose che non sono
                 nostre, e non è roba nostra da buttare. */
              try {
                localStorage.removeItem('vinzmon.prototype.v4');
              } catch {
                /* modalità privata, o storage negato: si ricarica lo stesso */
              }
              location.reload();
            }}
          >
            CANCELLA I DATI E RIPARTI
          </button>
        </div>
      </div>
    );
  }
}
