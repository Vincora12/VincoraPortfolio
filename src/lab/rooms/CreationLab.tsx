/* ============================================================================
   🧬 CREATION.LAB — come nasce un .mon

   La disposizione viene da `docs/lab/DEV_PARITY_MATRIX.md`, riga per riga:
   ogni superficie di DEV che parlava di COSA nasce ha qui la sua casa.

   🔒 DIVIETI DI DOPPIONE dichiarati dalla stessa matrice, e rispettati:
   la taratura della rarità sta SOLO qui; la Bio sta SOLO qui; il DNA della
   voce sta SOLO qui; generazione e import degli asset stanno SOLO qui. Non
   c'è nessuna di queste in SYSTEM.LAB — se un giorno ce ne fosse una, il
   controllo di parità la conterebbe due volte e lo direbbe.

   ⚠️ CLASSIFICAZIONE, dalla matrice: il resolver e la riscrittura della Bio e
   del prompt sono STRUMENTI OPZIONALI. Non sono la prova che la schiusa li
   chiami da sola: la schiusa compila in modo deterministico, e le immagini
   partono in sottofondo quando c'è la chiave. Averli qui non cambia il
   flusso automatico, dà un posto da cui provarlo a mano.
   ========================================================================= */

import { LabRoom } from './LabRoom';
import { GenerateSection, AssetsSection } from '../../dev/sections';
import { CatalogSection } from '../../dev/CatalogSection';
import { RaritySection } from '../../dev/RaritySection';
import { BatchGenerator } from '../../dev/BatchGenerator';
import { ResolverSection } from '../../dev/ResolverSection';
import { BioSection } from '../../dev/BioSection';
import { VoiceSection } from '../../dev/VoiceSection';
import { PromptPreview } from '../../dev/PromptPreview';
import { AssetImport } from '../../dev/AssetImport';
import { ForgePanel } from '../../dev/ForgePanel';
import { TeachSection } from '../../dev/TeachSection';
import { DesignTest } from '../../dev/DesignTest';

export function CreationLab() {
  /* Le sezioni nate dentro DEV si chiudono chiudendo il pannello. Qui non c'è
     nessun pannello da chiudere: il laboratorio è la pagina. */
  const noClose = () => {};

  return (
    <LabRoom
      title="🧬 CREATION.LAB"
      sub="COME NASCE UN .MON · STRUMENTI VERI, GLI STESSI DI DEV"
      groups={[
        {
          id: 'flow',
          label: 'FLOW',
          tabs: [
            { id: 'character-data', label: 'CHARACTER DATA', render: () => <GenerateSection onClose={noClose} /> },
            { id: 'cataloghi', label: 'CATALOGHI', render: () => <CatalogSection /> },
            { id: 'rarita', label: 'RARITÀ', render: () => <RaritySection /> },
            { id: 'batch', label: 'DISTRIBUZIONI', render: () => <BatchGenerator /> },
            { id: 'resolver', label: 'CREATIVE RESOLVER', render: () => <ResolverSection /> },
            { id: 'bio', label: 'BIO', render: () => <BioSection /> },
            { id: 'voce', label: 'VOICE', render: () => <VoiceSection /> },
            { id: 'prompt', label: 'PROMPTS', render: () => <PromptPreview /> },
            { id: 'asset', label: 'ASSETS', render: () => <AssetsSection /> },
            { id: 'import', label: 'IMPORT', render: () => <AssetImport /> },
            { id: 'forgia', label: 'FORGIA', render: () => <ForgePanel /> },
          ],
        },
        { id: 'learned', label: 'LEARNED', tabs: [{ id: 'insegna', label: 'INSEGNA', render: () => <TeachSection /> }] },
        { id: 'build', label: 'BUILD', tabs: [{ id: 'prove', label: 'PROVE', render: () => <DesignTest /> }] },
      ]}
    />
  );
}
