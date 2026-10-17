import {
  API_PREFIX,
  meetingActionItemConversionSchema,
  meetingActionItemSchema,
  meetingActionItemWithTaskSchema,
  meetingCalendarEntrySchema,
  meetingDashboardSummarySchema,
  meetingDetailSchema,
  meetingScheduleHistoryEntrySchema,
  meetingSummarySchema,
  type CancelMeetingInput,
  type CompleteMeetingInput,
  type ConvertMeetingActionItemInput,
  type CreateMeetingActionItemInput,
  type CreateMeetingInput,
  type MeetingActionItem,
  type MeetingActionItemConversion,
  type MeetingActionItemWithTask,
  type MeetingCalendarEntry,
  type MeetingDashboardSummary,
  type MeetingDetail,
  type MeetingScheduleHistoryEntry,
  type MeetingSummary,
  type RescheduleMeetingInput,
  type UpdateMeetingActionItemInput,
  type UpdateMeetingInput,
} from '@interscale/shared';
import { apiRequest } from './api';

/** Meeting management client (Phase 6, Step 35). */

export interface MeetingFilters {
  clientId?: string;
  projectId?: string;
  ownerUserId?: string;
  status?: string;
  from?: string;
  to?: string;
  date?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}

function toParams(filters: MeetingFilters): URLSearchParams {
  const params = new URLSearchParams({ limit: String(filters.limit ?? 100) });

  for (const [key, value] of Object.entries(filters)) {
    if (key === 'limit' || key === 'cursor') {
      continue;
    }

    if (value && value.length > 0) {
      params.set(key, value);
    }
  }

  if (filters.cursor) {
    params.set('cursor', filters.cursor);
  }

  return params;
}

/**
 * List meetings.
 *
 * `apiRequest` already unwraps the `{ data }` envelope, so the payload here is
 * the meeting array. Server-side cursor paging is intentionally not surfaced:
 * like tasks, the UI fetches up to 100 scoped rows and paginates/sorts
 * client-side with TanStack Table.
 */
async function listFrom(url: string): Promise<MeetingSummary[]> {
  const data = await apiRequest<unknown>(url);

  return meetingSummarySchema.array().parse(data);
}

export async function listMeetings(filters: MeetingFilters = {}): Promise<MeetingSummary[]> {
  return listFrom(`${API_PREFIX}/meetings?${toParams(filters).toString()}`);
}

export async function listMyMeetings(filters: MeetingFilters = {}): Promise<MeetingSummary[]> {
  return listFrom(`${API_PREFIX}/me/meetings?${toParams(filters).toString()}`);
}

export async function listClientMeetings(
  clientId: string,
  filters: MeetingFilters = {},
): Promise<MeetingSummary[]> {
  return listFrom(`${API_PREFIX}/clients/${clientId}/meetings?${toParams(filters).toString()}`);
}

export async function listProjectMeetings(
  projectId: string,
  filters: MeetingFilters = {},
): Promise<MeetingSummary[]> {
  return listFrom(`${API_PREFIX}/projects/${projectId}/meetings?${toParams(filters).toString()}`);
}

export async function getMeetingSummary(): Promise<MeetingDashboardSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings/summary`);
  return meetingDashboardSummarySchema.parse(data);
}

export interface MeetingCalendarFilters {
  from: string;
  to: string;
  clientId?: string;
  projectId?: string;
  ownerUserId?: string;
  status?: string;
}

export async function listMeetingCalendar(
  filters: MeetingCalendarFilters,
): Promise<MeetingCalendarEntry[]> {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });

  for (const [key, value] of Object.entries(filters)) {
    if (key === 'from' || key === 'to') {
      continue;
    }

    if (value && value.length > 0) {
      params.set(key, value);
    }
  }

  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings/calendar?${params.toString()}`);
  return meetingCalendarEntrySchema.array().parse(data);
}

export interface MeetingOverlapProbe {
  ownerUserId: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone?: string;
  excludeMeetingId?: string;
}

export async function checkMeetingOverlap(probe: MeetingOverlapProbe): Promise<MeetingSummary[]> {
  const params = new URLSearchParams({
    ownerUserId: probe.ownerUserId,
    date: probe.date,
    startTime: probe.startTime,
    endTime: probe.endTime,
  });

  if (probe.timezone) {
    params.set('timezone', probe.timezone);
  }

  if (probe.excludeMeetingId) {
    params.set('excludeMeetingId', probe.excludeMeetingId);
  }

  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings/overlap?${params.toString()}`);
  return meetingSummarySchema.array().parse(data);
}

export async function getMeeting(id: string): Promise<MeetingDetail> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings/${id}`);
  return meetingDetailSchema.parse(data);
}

export async function getMeetingHistory(id: string): Promise<MeetingScheduleHistoryEntry[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings/${id}/history`);
  return meetingScheduleHistoryEntrySchema.array().parse(data);
}

export async function createMeeting(input: CreateMeetingInput): Promise<MeetingSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return meetingSummarySchema.parse(data);
}

export async function updateMeeting(
  id: string,
  input: UpdateMeetingInput,
): Promise<MeetingSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return meetingSummarySchema.parse(data);
}

export async function rescheduleMeeting(
  id: string,
  input: RescheduleMeetingInput,
): Promise<MeetingSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings/${id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return meetingSummarySchema.parse(data);
}

export async function cancelMeeting(
  id: string,
  input: CancelMeetingInput,
): Promise<MeetingSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return meetingSummarySchema.parse(data);
}

export async function completeMeeting(
  id: string,
  input: CompleteMeetingInput = {},
): Promise<MeetingSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return meetingSummarySchema.parse(data);
}

export async function listMeetingActionItems(
  meetingId: string,
): Promise<MeetingActionItemWithTask[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings/${meetingId}/action-items`);
  return meetingActionItemWithTaskSchema.array().parse(data);
}

export async function createMeetingActionItem(
  meetingId: string,
  input: CreateMeetingActionItemInput,
): Promise<MeetingActionItem> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/meetings/${meetingId}/action-items`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return meetingActionItemSchema.parse(data);
}

export async function updateMeetingActionItem(
  meetingId: string,
  actionItemId: string,
  input: UpdateMeetingActionItemInput,
): Promise<MeetingActionItem> {
  const data = await apiRequest<unknown>(
    `${API_PREFIX}/meetings/${meetingId}/action-items/${actionItemId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );

  return meetingActionItemSchema.parse(data);
}

export async function deleteMeetingActionItem(
  meetingId: string,
  actionItemId: string,
): Promise<void> {
  await apiRequest<unknown>(`${API_PREFIX}/meetings/${meetingId}/action-items/${actionItemId}`, {
    method: 'DELETE',
  });
}

export async function convertMeetingActionItem(
  meetingId: string,
  actionItemId: string,
  input: ConvertMeetingActionItemInput,
): Promise<MeetingActionItemConversion> {
  const data = await apiRequest<unknown>(
    `${API_PREFIX}/meetings/${meetingId}/action-items/${actionItemId}/create-task`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );

  return meetingActionItemConversionSchema.parse(data);
}
