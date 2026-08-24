/* ============================================================================
   ⚙️ SYSTEM.LAB — chiavi, modelli, simulazione, memoria, consumi

   La disposizione viene da `docs/lab/DEV_PARITY_MATRIX.md`. Qui sta tutto
   quello che riguarda COME GIRA il sistema, invece di cosa nasce.

   🔒 DIVIETI DI DOPPIONE, dalla stessa matrice: l'avanzamento dei giorni sta
   SOLO qui; umore e memoria stanno SOLO qui; la scelta del modello e del
   fornitore sta SOLO qui. Niente di tutto questo compare in CREATION.LAB.

   ⚠️ ATTIVA VINZ.MON è una schermata di PRODOTTO, non uno strumento: si apre
   anche dalla barra di stato dell'app. Sta qui perché la matrice la mette in
   SETUP, ed è il primo posto dove uno la cerca — ma resta la stessa
   schermata, montata, non ricopiata.
   ========================================================================= */

import { LabRoom } from './LabRoom';
import { TimeSection, SignalsSection, ProgressionSection, MindlineSection } from '../../dev/sections';
import { ModelsSection } from '../../dev/ModelsSection';
import { MemorySection } from '../../dev/MemorySection';
import { MoodSection } from '../../dev/MoodSection';
import { ToolsSection } from '../../dev/ToolsSection';
import { CostSection } from '../../dev/CostSection';
import { ActivateScreen } from '../../screens/Activate';

export function SystemLab() {
  const noClose = () => {};

  return (
    <LabRoom
      title="⚙️ SYSTEM.LAB"
      sub="COME GIRA · STRUMENTI VERI, GLI STESSI DI DEV"
      groups={[
        { id: 'setup', label: 'SETUP', tabs: [{ id: 'attiva', label: 'ATTIVA', render: () => <ActivateScreen onClose={noClose} /> }] },
        { id: 'ai', label: 'AI', tabs: [{ id: 'modelli', label: 'MODELLI', render: () => <ModelsSection /> }] },
        {
          id: 'simulation',
          label: 'SIMULATION',
          tabs: [
            { id: 'tempo', label: 'TEMPO', render: () => <TimeSection /> },
            { id: 'segnali', label: 'SEGNALI', render: () => <SignalsSection /> },
            { id: 'progressione', label: 'PROGRESSIONE', render: () => <ProgressionSection /> },
            { id: 'mindline', label: 'MINDLINE', render: () => <MindlineSection onClose={noClose} /> },
          ],
        },
        {
          id: 'memory',
          label: 'MEMORY',
          tabs: [
            { id: 'memoria', label: 'MEMORIA', render: () => <MemorySection /> },
            { id: 'umore', label: 'UMORE E OPINIONI', render: () => <MoodSection /> },
            { id: 'strumenti', label: 'STRUMENTI', render: () => <ToolsSection /> },
          ],
        },
        { id: 'usage', label: 'USAGE', tabs: [{ id: 'costi', label: 'COSTI', render: () => <CostSection /> }] },
      ]}
    />
  );
}
