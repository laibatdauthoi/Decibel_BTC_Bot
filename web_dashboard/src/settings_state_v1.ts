import { z } from 'zod';

const SavedSettingsSchema = z.object({
  revision: z.number().int().nonnegative(),
  values: z
    .object({
      capitalToUseUsd: z.number().finite().positive(),
      maxLossUsd: z.number().finite().positive(),
      targetMakerVolumeUsd: z
        .number()
        .finite()
        .refine((value) => value !== 0),
    })
    .refine((values) => values.maxLossUsd <= values.capitalToUseUsd),
});

export function parseSavedSettingsV1(input: unknown): z.infer<typeof SavedSettingsSchema> {
  return SavedSettingsSchema.parse(input);
}

/** Saved values only advance on an authoritative, strictly newer revision. */
export function selectSavedSettingsV1<T extends { revision: number }>(
  current: T | null,
  next: T,
): T | null {
  if (!Number.isSafeInteger(next.revision) || next.revision < 0) return current;
  return current === null || next.revision > current.revision ? next : current;
}
