import { z } from 'zod';

// ---------------------------------------------------------------------------
// VidNest API response schemas
// ---------------------------------------------------------------------------

export const VidNestTrackRecordSchema = z.object({
  default: z.boolean().nullable().optional(),
  file: z.string().nullable().optional(),
  kind: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  lang: z.string().nullable().optional(),
  srclang: z.string().nullable().optional(),
});

export const VidNestSourceRecordSchema = z.object({
  file: z.string().nullable().optional(),
  quality: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
});

const VidNestMarkerSchema = z.object({
  end: z.number().nullable().optional(),
  start: z.number().nullable().optional(),
});

const VidNestMetadataSchema = z.object({
  image: z.string().nullable().optional(),
  poster: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});

export const VidNestPlaybackRecordSchema = z.object({
  error: z.string().nullable().optional(),
  intro: VidNestMarkerSchema.nullable().optional(),
  metadata: VidNestMetadataSchema.nullable().optional(),
  outro: VidNestMarkerSchema.nullable().optional(),
  sources: z.array(VidNestSourceRecordSchema).nullable().optional(),
  status: z.union([z.number(), z.string()]).nullable().optional(),
  success: z.boolean().nullable().optional(),
  tracks: z.array(VidNestTrackRecordSchema).nullable().optional(),
});

export type VidNestTrackRecord = z.infer<typeof VidNestTrackRecordSchema>;
export type VidNestSourceRecord = z.infer<typeof VidNestSourceRecordSchema>;
export type VidNestPlaybackRecord = z.infer<typeof VidNestPlaybackRecordSchema>;

/**
 * Safely parses an unknown VidNest API response.
 *
 * Returns the parsed record on success, or `null` when the response does not
 * match the expected shape. The caller should fall back to best-effort
 * handling when `null` is returned.
 */
export function parseVidNestPlaybackRecord(input: unknown): VidNestPlaybackRecord | null {
  const result = VidNestPlaybackRecordSchema.safeParse(input);
  if (!result.success) {
    // Log in development; silently ignore in production to avoid noise
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[vidnest-schema] Unexpected VidNest response shape:', result.error.format());
    }
    return null;
  }

  return result.data;
}
