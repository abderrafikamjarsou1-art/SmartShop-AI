import { z } from "zod";
import { zBoolParam, zPagination } from "@/lib/validation";

export const notificationFilterSchema = zPagination.extend({
  unreadOnly: zBoolParam,
});
export type NotificationFilter = z.infer<typeof notificationFilterSchema>;
