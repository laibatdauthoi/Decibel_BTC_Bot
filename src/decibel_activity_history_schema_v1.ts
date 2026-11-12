import { z } from 'zod';

export const ActivityHistorySchemaV1 = z.object({
  sessionId: z.string().min(1),
  journalAvailable: z.boolean(),
  errorsComplete: z.literal(false),
  fills: z.array(
    z.object({
      fillId: z.string().min(1),
      timestamp: z.number().finite(),
      side: z.enum(['BUY', 'SELL', 'UNKNOWN']),
      quantity: z.number().finite().positive(),
      price: z.number().finite().positive(),
      feeUsd: z.number().finite().nullable().optional(),
      pnlAtCloseUsd: z.number().finite().nullable().optional(),
      closePnlAvailability: z.enum(['VERIFIED', 'N/A', 'UNKNOWN']).optional(),
      direction: z
        .enum(['Open Long', 'Open Short', 'Close Long', 'Close Short'])
        .nullable()
        .optional(),
    }),
  ),
  errors: z.array(
    z.object({
      id: z.string(),
      timestamp: z.number().finite(),
      type: z.string(),
      description: z.string(),
    }),
  ),
});
export type activity_history_v1 = z.infer<typeof ActivityHistorySchemaV1>;
