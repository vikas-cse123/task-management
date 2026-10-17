import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CancelMeetingInput,
  CompleteMeetingInput,
  ConvertMeetingActionItemInput,
  CreateMeetingActionItemInput,
  CreateMeetingInput,
  RescheduleMeetingInput,
  UpdateMeetingActionItemInput,
  UpdateMeetingInput,
} from '@interscale/shared';
import {
  cancelMeeting,
  checkMeetingOverlap,
  completeMeeting,
  convertMeetingActionItem,
  createMeeting,
  createMeetingActionItem,
  deleteMeetingActionItem,
  getMeeting,
  getMeetingHistory,
  getMeetingSummary,
  listClientMeetings,
  listMeetingActionItems,
  listMeetingCalendar,
  listMeetings,
  listMyMeetings,
  listProjectMeetings,
  rescheduleMeeting,
  updateMeeting,
  updateMeetingActionItem,
  type MeetingCalendarFilters,
  type MeetingFilters,
  type MeetingOverlapProbe,
} from '../lib/meetings-api';

const MEETINGS_KEY = ['meetings'] as const;

function detailKey(id: string) {
  return ['meetings', id] as const;
}

function historyKey(id: string) {
  return ['meetings', id, 'history'] as const;
}

function actionItemsKey(id: string) {
  return ['meetings', id, 'action-items'] as const;
}

function calendarKey(filters: MeetingCalendarFilters) {
  return ['meetings', 'calendar', filters] as const;
}

export function useMeetings(filters: MeetingFilters = {}, enabled = true) {
  return useQuery({
    queryKey: [...MEETINGS_KEY, 'list', filters],
    queryFn: () => listMeetings(filters),
    enabled,
    retry: false,
  });
}

export function useMyMeetings(filters: MeetingFilters = {}, enabled = true) {
  return useQuery({
    queryKey: [...MEETINGS_KEY, 'mine', filters],
    queryFn: () => listMyMeetings(filters),
    enabled,
    retry: false,
  });
}

export function useClientMeetings(
  clientId: string | undefined,
  filters: MeetingFilters = {},
  enabled = true,
) {
  return useQuery({
    queryKey: clientId
      ? [...MEETINGS_KEY, 'client', clientId, filters]
      : [...MEETINGS_KEY, 'client', 'missing'],
    queryFn: () => listClientMeetings(clientId ?? '', filters),
    enabled: enabled && Boolean(clientId),
    retry: false,
  });
}

export function useProjectMeetings(
  projectId: string | undefined,
  filters: MeetingFilters = {},
  enabled = true,
) {
  return useQuery({
    queryKey: projectId
      ? [...MEETINGS_KEY, 'project', projectId, filters]
      : [...MEETINGS_KEY, 'project', 'missing'],
    queryFn: () => listProjectMeetings(projectId ?? '', filters),
    enabled: enabled && Boolean(projectId),
    retry: false,
  });
}

export function useMeetingSummary(enabled = true) {
  return useQuery({
    queryKey: [...MEETINGS_KEY, 'summary'],
    queryFn: getMeetingSummary,
    enabled,
    retry: false,
  });
}

export function useMeetingCalendar(filters: MeetingCalendarFilters, enabled = true) {
  return useQuery({
    queryKey: calendarKey(filters),
    queryFn: () => listMeetingCalendar(filters),
    enabled,
    retry: false,
  });
}

export function useMeetingOverlap(probe: MeetingOverlapProbe | null) {
  return useQuery({
    queryKey: probe ? [...MEETINGS_KEY, 'overlap', probe] : [...MEETINGS_KEY, 'overlap', 'missing'],
    queryFn: () => checkMeetingOverlap(probe ?? ({} as MeetingOverlapProbe)),
    enabled: Boolean(probe),
    retry: false,
  });
}

export function useMeeting(id: string | undefined) {
  return useQuery({
    queryKey: id ? detailKey(id) : [...MEETINGS_KEY, 'missing'],
    queryFn: () => getMeeting(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useMeetingHistory(id: string | undefined) {
  return useQuery({
    queryKey: id ? historyKey(id) : [...MEETINGS_KEY, 'missing', 'history'],
    queryFn: () => getMeetingHistory(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useMeetingActionItems(meetingId: string | undefined) {
  return useQuery({
    queryKey: meetingId ? actionItemsKey(meetingId) : [...MEETINGS_KEY, 'missing', 'action-items'],
    queryFn: () => listMeetingActionItems(meetingId ?? ''),
    enabled: Boolean(meetingId),
    retry: false,
  });
}

function invalidateMeeting(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  void queryClient.invalidateQueries({ queryKey: MEETINGS_KEY });

  if (id) {
    void queryClient.invalidateQueries({ queryKey: detailKey(id) });
    void queryClient.invalidateQueries({ queryKey: historyKey(id) });
    void queryClient.invalidateQueries({ queryKey: actionItemsKey(id) });
  }

  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMeetingInput) => createMeeting(input),
    onSuccess: () => invalidateMeeting(queryClient),
  });
}

export function useUpdateMeeting(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateMeetingInput) => updateMeeting(id, input),
    onSuccess: () => invalidateMeeting(queryClient, id),
  });
}

export function useRescheduleMeeting(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RescheduleMeetingInput) => rescheduleMeeting(id, input),
    onSuccess: () => invalidateMeeting(queryClient, id),
  });
}

export function useCancelMeeting(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CancelMeetingInput) => cancelMeeting(id, input),
    onSuccess: () => invalidateMeeting(queryClient, id),
  });
}

export function useCompleteMeeting(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CompleteMeetingInput = {}) => completeMeeting(id, input),
    onSuccess: () => invalidateMeeting(queryClient, id),
  });
}

export function useCreateMeetingActionItem(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMeetingActionItemInput) => createMeetingActionItem(meetingId, input),
    onSuccess: () => invalidateMeeting(queryClient, meetingId),
  });
}

export function useUpdateMeetingActionItem(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      actionItemId,
      input,
    }: {
      actionItemId: string;
      input: UpdateMeetingActionItemInput;
    }) => updateMeetingActionItem(meetingId, actionItemId, input),
    onSuccess: () => invalidateMeeting(queryClient, meetingId),
  });
}

export function useDeleteMeetingActionItem(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (actionItemId: string) => deleteMeetingActionItem(meetingId, actionItemId),
    onSuccess: () => invalidateMeeting(queryClient, meetingId),
  });
}

export function useConvertMeetingActionItem(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      actionItemId,
      input,
    }: {
      actionItemId: string;
      input: ConvertMeetingActionItemInput;
    }) => convertMeetingActionItem(meetingId, actionItemId, input),
    onSuccess: () => {
      invalidateMeeting(queryClient, meetingId);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
