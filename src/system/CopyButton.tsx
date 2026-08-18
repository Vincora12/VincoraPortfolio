/* ============================================================================
   COPIA

   🔷 «Tienimi i prompt da copiare, che sto iniziando a mettere a mano le
   immagini per vedere se funziona.»

   Un pulsante solo, in un posto solo. C'erano già due copie di questa logica —
   in DEV → PROMPT e nell'attivazione — e stava per nascerne una terza: tre
   punti dove sbagliare allo stesso modo la stessa cosa.

   🔒 E la cosa da non sbagliare è UNA: `navigator.clipboard` non esiste
   ovunque e fallisce senza HTTPS. Se la copia non riesce non si dice
   «COPIATO»: si dice che non è riuscita, perché la reazione giusta — andare a
   selezionare il testo a mano — la puoi avere solo se lo sai.
   ========================================================================= */

import { useState } from 'react';
import { Button } from './components';

type State = 'idle' | 'done' | 'failed';

export function CopyButton({
  text,
  label = 'COPIA',
  block,
  variant = 'secondary',
}: {
  text: string;
  label?: string;
  block?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const [state, setState] = useState<State>('idle');

  const copy = () => {
    const done = (s: State) => {
      setState(s);
      window.setTimeout(() => setState('idle'), 2000);
    };
    const api = navigator.clipboard;
    if (!api) return done('failed');
    void api.writeText(text).then(() => done('done'), () => done('failed'));
  };

  return (
    <Button small block={block} variant={variant} onClick={copy}>
      {state === 'done' ? 'COPIATO' : state === 'failed' ? 'NON RIESCO' : label}
    </Button>
  );
}
