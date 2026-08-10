import { api } from "./api";

/**
 * Notifications API client. Mirrors src/app/api/notifications/** exactly
 * — no business logic here.
 */

export type NotificationType = "LOW_STOCK" | "SALE" | "PAYMENT" | "SUBSCRIPTION" | "SYSTEM";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationListResponse = {
  items: Notification[];
  total: number;
  page: number;
  totalPages: number;
  unreadCount: number;
};

export type NotificationFilters = {
  unreadOnly?: boolean;
  page?: number;
  perPage?: number;
};

export type ApiFailureBody = {
  success: false;
  error: { message: string; code: string; fieldErrors?: Record<string, string[]> };
  requestId: string;
};

export function getNotificationErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  const message = body?.error?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

function toQueryString(filters: NotificationFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getNotifications(filters: NotificationFilters = {}): Promise<NotificationListResponse> {
  const response = await api.get<{ data: NotificationListResponse }>(`/notifications${toQueryString(filters)}`);
  return response.data.data;
}

export async function getUnreadCount(): Promise<number> {
  const response = await api.get<{ data: { count: number } }>("/notifications/unread-count");
  return response.data.data.count;
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const response = await api.patch<{ data: Notification }>(`/notifications/${id}`);
  return response.data.data;
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await api.post<{ data: { count: number } }>("/notifications/mark-all-read");
  return response.data.data.count;
}

export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/notifications/${id}`);
}
