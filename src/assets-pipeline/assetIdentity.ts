import type { MonRecord } from '../engine/types';

/** A form owns its assets for life. Old saves keep their original name keys. */
export function assetOwnerKey(record: MonRecord): string {
  return record.assetOwnerId ?? record.data.name;
}
