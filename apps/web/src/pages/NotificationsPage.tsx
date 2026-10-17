import { NOTIFICATION_EVENT_LABELS, type NotificationEventType } from '@interscale/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../hooks/useNotifications';
import { errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/dates';

function eventLabel(eventType: string): string {
  return NOTIFICATION_EVENT_LABELS[eventType as NotificationEventType] ?? eventType;
}

/** In-app notification center (Phase 5, Step 29). */
export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notifications = useNotifications({ unreadOnly });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const navigate = useNavigate();

  const handleOpen = async (
    id: string,
    url: string | null,
    readAt: string | null,
  ): Promise<void> => {
    if (!readAt) {
      try {
        await markRead.mutateAsync(id);
      } catch {
        // Opening the notification still matters even if the read flag fails.
      }
    }

    if (url) {
      navigate(url);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            Assignments, deadlines, revisions, escalations, and client meetings that need your
            attention. Meeting alerts link straight to the meeting detail.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void markAllRead.mutateAsync()}
          disabled={markAllRead.isPending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(event) => setUnreadOnly(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Show unread only
      </label>

      {notifications.isPending ? (
        <p className="text-sm text-slate-500">Loading notifications…</p>
      ) : notifications.isError ? (
        <p className="text-sm text-red-600">{errorMessage(notifications.error)}</p>
      ) : (notifications.data ?? []).length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Nothing here yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {(notifications.data ?? []).map((notification) => (
            <li key={notification.id}>
              <button
                type="button"
                onClick={() =>
                  void handleOpen(notification.id, notification.url, notification.readAt)
                }
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    notification.readAt ? 'bg-slate-200' : 'bg-blue-500'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {notification.title}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {formatDateTime(notification.createdAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {eventLabel(notification.eventType)} · {notification.body}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Link
        to="/profile"
        className="inline-block text-sm font-medium text-slate-600 hover:underline"
      >
        Manage WhatsApp notifications
      </Link>
    </div>
  );
}
