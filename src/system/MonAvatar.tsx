/* ============================================================================
   LA FOTO PROFILO DI UN .MON (§21.4)

   🔷 «L'estetica da social ci sta con foto profilo dei mon, prendi esempio da
   Twitter.»

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ MA LE FOTO NON ESISTONO ANCORA, E NON ESISTERANNO PER UN PEZZO.

   Gli slot immagine sono vuoti finché non si generano (compito #38), e un
   social fatto di riquadri «ASSET // WAITING FOR IMAGE» non è un social: è un
   cantiere. Il segnaposto tecnico va benissimo su una scheda che sta
   dichiarando cosa manca — qui invece racconterebbe la cosa sbagliata.

   🔒 Quindi l'avatar ripiega sul SIGILLO. Ce l'hanno tutti dal primo istante,
   è disegnato dal sito, non costa niente, non può mancare — ed è già il loro
   marchio: la stessa figura sta sull'icona della scheda del browser e timbra i
   giorni chiusi nel calendario.

   Un .mon senza ritratto non è uno a cui manca la foto: è uno che si firma.
   ════════════════════════════════════════════════════════════════════════════

   🔒 E L'AVATAR È QUADRATO, non tondo. Twitter li fa rotondi, ma qui la regola
   è scritta nei token — `--radius: 0px`, «geometria rettangolare: niente card
   arrotondate». Un cerchio in mezzo a questa app sarebbe l'unica cosa tonda
   della schermata, e si vedrebbe.
   ========================================================================= */

import type { SigilSeed } from '../engine/types';
import { Sigil } from './AssetSlot';
import { useAssetUrlChain } from './AssetSlot';
import { displayName } from '../engine/types';

interface MonAvatarProps {
  monName: string;
  sigil: SigilSeed | null;
  /** Lato in pixel. Il sigillo scala con questo, non ha una misura fissa. */
  size?: number;
}

export function MonAvatar({ monName, sigil, size = 40 }: MonAvatarProps) {
  const { url } = useAssetUrlChain(monName, ['profile_portrait', 'character_master']);

  return (
    <span
      className="avatar"
      style={{ width: size, height: size }}
      aria-hidden={url ? undefined : true}
    >
      {url ? (
        <img className="avatar__img" src={url} alt={displayName(monName)} />
      ) : sigil ? (
        <Sigil seed={sigil} size={Math.round(size * 0.62)} />
      ) : null}
    </span>
  );
}
