import {
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_EVENT_TYPES,
  type NotificationEventType,
} from '@interscale/shared';
import { useEffect, useState } from 'react';
import {
  useDeliveryStats,
  useIntegrationStatus,
  useNotificationLog,
  useNotificationSettings,
  useRetryNotification,
  useTemplateMappings,
  useUpdateNotificationSettings,
  useUpdateTemplateMappings,
} from '../../hooks/useNotifications';
import { errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/dates';
import { TextField } from '../ui/TextField';

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

/** Admin notification configuration, template mappings, and delivery log (Step 29). */
export function NotificationSettingsSection() {
  const settings = useNotificationSettings();
  const integration = useIntegrationStatus();
  const stats = useDeliveryStats();
  const mappings = useTemplateMappings();
  const log = useNotificationLog({ limit: 50 });
  const updateSettings = useUpdateNotificationSettings();
  const updateMappings = useUpdateTemplateMappings();
  const retry = useRetryNotification();

  const [enabled, setEnabled] = useState(false);
  const [leadHours, setLeadHours] = useState('24');
  const [escalationHours, setEscalationHours] = useState('24');
  const [reviewDays, setReviewDays] = useState('7');
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setEnabled(settings.data.enabled);
      setLeadHours(String(settings.data.dueSoonLeadHours));
      setEscalationHours(String(settings.data.escalationAfterHours));
      setReviewDays(String(settings.data.reviewIntervalDays));
    }
  }, [settings.data]);

  const handleSave = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    setSaved(false);

    try {
      await updateSettings.mutateAsync({
        enabled,
        dueSoonLeadHours: Number(leadHours),
        escalationAfterHours: Number(escalationHours),
        reviewIntervalDays: Number(reviewDays),
      });
      setSaved(true);
    } catch (caught) {
      setFormError(errorMessage(caught));
    }
  };

  const toggleMapping = async (eventType: NotificationEventType, next: boolean): Promise<void> => {
    const current = mappings.data ?? [];

    await updateMappings.mutateAsync(
      current.map((mapping) => ({
        eventType: mapping.eventType,
        templateKey: mapping.templateKey,
        enabled: mapping.eventType === eventType ? next : mapping.enabled,
      })),
    );
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold">WhatsApp notifications</h2>
        <p className="text-xs text-slate-500">
          In-app notifications are always recorded. WhatsApp is sent only to opted-in recipients
          while the channel is enabled and configured.
        </p>
      </div>

      {integration.data ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          <p>
            Channel:{' '}
            <span className="font-medium">
              {integration.data.channelEnabled ? 'enabled' : 'disabled'}
            </span>{' '}
            · Provider: <span className="font-medium">{integration.data.providerKind}</span> ·
            Webhook:{' '}
            <span className="font-medium">
              {integration.data.webhookConfigured ? 'configured' : 'not configured'}
            </span>
          </p>
          {integration.data.warnings.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-700">
              {integration.data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={handleSave}
        className="grid max-w-xl gap-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Enable the WhatsApp channel
        </label>
        <TextField
          label="Due-soon lead time (hours)"
          name="leadHours"
          type="number"
          min={1}
          max={720}
          value={leadHours}
          onChange={(event) => setLeadHours(event.target.value)}
        />
        <TextField
          label="Escalate overdue after (hours)"
          name="escalationHours"
          type="number"
          min={1}
          max={720}
          value={escalationHours}
          onChange={(event) => setEscalationHours(event.target.value)}
        />
        <TextField
          label="Campaign review interval (days)"
          name="reviewDays"
          type="number"
          min={1}
          max={90}
          value={reviewDays}
          onChange={(event) => setReviewDays(event.target.value)}
        />
        {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
        {saved ? <p className="text-sm text-green-600">Settings saved.</p> : null}
        <div>
          <button
            type="submit"
            disabled={updateSettings.isPending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {updateSettings.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>

      {stats.data ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Pending" value={stats.data.pending} />
          <StatCard label="Sent" value={stats.data.sent} />
          <StatCard label="Delivered" value={stats.data.delivered} />
          <StatCard label="Failed" value={stats.data.failed} />
          <StatCard label="Retrying" value={stats.data.retryScheduled} />
          <StatCard label="Suppressed" value={stats.data.suppressed} />
          <StatCard label="Read" value={stats.data.read} />
          <StatCard label="Unread in-app" value={stats.data.unreadInApp} />
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Automatic messages</h3>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {(mappings.data ?? []).map((mapping) => (
            <li
              key={mapping.eventType}
              className="flex items-center justify-between gap-4 px-4 py-2.5"
            >
              <div>
                <p className="text-sm text-slate-900">
                  {NOTIFICATION_EVENT_LABELS[mapping.eventType]}
                </p>
                <p className="text-xs text-slate-500">
                  {mapping.templateName} · {mapping.language}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={mapping.enabled}
                  onChange={(event) => void toggleMapping(mapping.eventType, event.target.checked)}
                  disabled={updateMappings.isPending}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Enabled
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Delivery log</h3>
        {log.isPending ? (
          <p className="text-sm text-slate-500">Loading log…</p>
        ) : log.isError ? (
          <p className="text-sm text-red-600">{errorMessage(log.error)}</p>
        ) : (log.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-center text-sm text-slate-500">
            No notifications have been queued yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Scheduled</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(log.data ?? []).map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 text-slate-900">
                      {NOTIFICATION_EVENT_TYPES.includes(entry.eventType)
                        ? NOTIFICATION_EVENT_LABELS[entry.eventType]
                        : entry.eventType}
                    </td>
                    <td className="px-3 py-2 capitalize text-slate-700">
                      {entry.status.replace('_', ' ')}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {formatDateTime(entry.scheduledAt)}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {entry.suppressionReason ?? entry.lastError ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {entry.status === 'failed' ? (
                        <button
                          type="button"
                          onClick={() => void retry.mutateAsync(entry.id)}
                          disabled={retry.isPending}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          Retry
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
