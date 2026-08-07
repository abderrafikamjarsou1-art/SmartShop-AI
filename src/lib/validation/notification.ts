import { z } from "zod";
import { zPagination } from "@/lib/validation";

export const notificationFilterSchema = zPagination.extend({
  unreadOnly: z.coerce.boolean().default(false),
});
export type NotificationFilter = z.infer<typeof notificationFilterSchema>;
