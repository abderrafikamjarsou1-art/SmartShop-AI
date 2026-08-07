import { z } from "zod";

export const aiInsightKindSchema = z.enum([
  "weekly", "monthly", "profit", "loss", "growth",
  "inventory", "expenses", "customers", "suppliers",
]);
export type AiInsightKind = z.infer<typeof aiInsightKindSchema>;
