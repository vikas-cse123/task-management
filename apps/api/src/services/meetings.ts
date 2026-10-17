import {
  cancelMeetingRecord,
  completeMeetingRecord,
  convertMeetingActionItem,
  createMeetingActionItem,
  createMeetingRecord,
  deleteMeetingActionItem,
  findMeeting,
  findMeetingDetail,
  findOverlappingMeetings,
  isActiveClientMember,
  listMeetingActionItems,
  listMeetingCalendar,
  listMeetingScheduleHistory,
  listMeetings as dbListMeetings,
  MongoEmployeeDirectory,
  summarizeMeetings,
  rescheduleMeetingRecord,
  updateMeetingActionItem,
  updateMeetingRecord,
  NotFoundError,
  type EmployeeDirectory,
  type MeetingScheduleHistoryEntry,
  type MeetingScope,
  type MeetingServiceDeps,
} from '@interscale/db';
import {
  hasCapability,
  type CancelMeetingInput,
  type CompleteMeetingInput,
  type ConvertMeetingActionItemInput,
  type CreateMeetingActionItemInput,
  type CreateMeetingInput,
  type MeetingActionItem,
  type MeetingActionItemConversion,
  type MeetingActionItemWithTask,
  type MeetingCalendarEntry,
  type MeetingCalendarQuery,
  type MeetingDashboardSummary,
  type MeetingDetail,
  type MeetingListQuery,
  type MeetingOverlapQuery,
  type MeetingSummary,
  type RescheduleMeetingInput,
  type UpdateMeetingActionItemInput,
  type UpdateMeetingInput,
  type UserProfile,
} from '@interscale/shared';
import { forbiddenError } from '../lib/http';

/**
 * Meeting orchestration (Phase 6, Step 31).
 *
 * Authorization (docs/03-authorization.md §8):
 * - Admins see and manage every meeting.
 * - Managers see meetings within their client scope (and any meeting they own
 *   or attend); managing requires the `meetings.manage` capability.
 * - Employees see only meetings they own or attend, and manage them only when
 *   granted `meetings.manage`. Being an attendee never grants client/project
 *   access. Out-of-scope reads and writes return 404 (IDOR prevention).
 *
 * Meetings are never tasks; this service never touches task records.
 */

export interface MeetingPage {
  readonly data: MeetingSummary[];
  readonly nextCursor: string | null;
}

export interface MeetingService {
  listMeetings(actor: UserProfile, query: MeetingListQuery): Promise<MeetingPage>;
  getMeeting(actor: UserProfile, id: string): Promise<MeetingDetail | null>;
  createMeeting(actor: UserProfile, input: CreateMeetingInput): Promise<MeetingSummary>;
  updateMeeting(actor: UserProfile, id: string, input: UpdateMeetingInput): Promise<MeetingSummary>;
  rescheduleMeeting(
    actor: UserProfile,
    id: string,
    input: RescheduleMeetingInput,
  ): Promise<MeetingSummary>;
  cancelMeeting(actor: UserProfile, id: string, input: CancelMeetingInput): Promise<MeetingSummary>;
  completeMeeting(
    actor: UserProfile,
    id: string,
    input: CompleteMeetingInput,
  ): Promise<MeetingSummary>;
  listClientMeetings(
    actor: UserProfile,
    clientId: string,
    query: MeetingListQuery,
  ): Promise<MeetingPage>;
  listProjectMeetings(
    actor: UserProfile,
    projectId: string,
    query: MeetingListQuery,
  ): Promise<MeetingPage>;
  listMyMeetings(actor: UserProfile, query: MeetingListQuery): Promise<MeetingPage>;
  getMeetingSummary(actor: UserProfile): Promise<MeetingDashboardSummary>;
  getCalendar(actor: UserProfile, query: MeetingCalendarQuery): Promise<MeetingCalendarEntry[]>;
  checkOverlap(actor: UserProfile, query: MeetingOverlapQuery): Promise<MeetingSummary[]>;
  listScheduleHistory(actor: UserProfile, id: string): Promise<MeetingScheduleHistoryEntry[]>;
  listActionItems(actor: UserProfile, meetingId: string): Promise<MeetingActionItemWithTask[]>;
  createActionItem(
    actor: UserProfile,
    meetingId: string,
    input: CreateMeetingActionItemInput,
  ): Promise<MeetingActionItem>;
  updateActionItem(
    actor: UserProfile,
    meetingId: string,
    actionItemId: string,
    input: UpdateMeetingActionItemInput,
  ): Promise<MeetingActionItem>;
  deleteActionItem(actor: UserProfile, meetingId: string, actionItemId: string): Promise<void>;
  convertActionItem(
    actor: UserProfile,
    meetingId: string,
    actionItemId: string,
    input: ConvertMeetingActionItemInput,
  ): Promise<MeetingActionItemConversion>;
}

function isAdmin(actor: UserProfile): boolean {
  return actor.accessLevel === 'Admin';
}

function canManageMeetings(actor: UserProfile): boolean {
  return hasCapability(actor.accessLevel, actor.capabilities, 'meetings.manage');
}

function scopeFor(actor: UserProfile): MeetingScope {
  if (isAdmin(actor)) {
    return { kind: 'all' };
  }

  return actor.accessLevel === 'Manager'
    ? { kind: 'member', userId: actor.id }
    : { kind: 'participant', userId: actor.id };
}

export function createMeetingService(
  directory: EmployeeDirectory = new MongoEmployeeDirectory(),
): MeetingService {
  const deps: MeetingServiceDeps = { directory };

  function isOwnerOrAttendee(meeting: MeetingSummary, actor: UserProfile): boolean {
    return meeting.ownerUserId === actor.id || meeting.attendeeUserIds.includes(actor.id);
  }

  async function canAccess(meeting: MeetingSummary, actor: UserProfile): Promise<boolean> {
    if (isAdmin(actor)) {
      return true;
    }

    if (actor.accessLevel === 'Manager') {
      return isOwnerOrAttendee(meeting, actor) || isActiveClientMember(meeting.clientId, actor.id);
    }

    return isOwnerOrAttendee(meeting, actor);
  }

  async function requireAccess(actor: UserProfile, id: string): Promise<MeetingSummary> {
    const meeting = await findMeeting(id);

    if (!meeting || !(await canAccess(meeting, actor))) {
      throw new NotFoundError('Meeting');
    }

    return meeting;
  }

  async function requireManage(actor: UserProfile, id: string): Promise<MeetingSummary> {
    const meeting = await requireAccess(actor, id);

    if (!canManageMeetings(actor)) {
      throw forbiddenError('Managing meetings requires the meetings.manage capability');
    }

    return meeting;
  }

  async function toPage(
    actor: UserProfile,
    query: MeetingListQuery,
    extra: Partial<MeetingListQuery> = {},
  ): Promise<MeetingPage> {
    const page = await dbListMeetings({ ...query, ...extra }, scopeFor(actor));

    return { data: page.data, nextCursor: page.nextCursor };
  }

  return {
    async listMeetings(actor, query) {
      return toPage(actor, query);
    },

    async getMeeting(actor, id) {
      try {
        await requireAccess(actor, id);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return null;
        }

        throw error;
      }

      return findMeetingDetail(id);
    },

    async createMeeting(actor, input) {
      if (!canManageMeetings(actor)) {
        throw forbiddenError('Creating meetings requires the meetings.manage capability');
      }

      if (!isAdmin(actor)) {
        const inScope = await isActiveClientMember(input.clientId, actor.id);

        if (!inScope) {
          throw new NotFoundError('Client');
        }
      }

      return createMeetingRecord(input, actor.id, deps);
    },

    async updateMeeting(actor, id, input) {
      await requireManage(actor, id);
      const { expectedVersion, ...patch } = input;

      return updateMeetingRecord(id, { ...patch, expectedVersion }, actor.id, deps);
    },

    async rescheduleMeeting(actor, id, input) {
      await requireManage(actor, id);

      return rescheduleMeetingRecord(id, input, actor.id);
    },

    async cancelMeeting(actor, id, input) {
      await requireManage(actor, id);

      return cancelMeetingRecord(id, input, actor.id);
    },

    async completeMeeting(actor, id, input) {
      await requireManage(actor, id);

      return completeMeetingRecord(id, actor.id, { expectedVersion: input.expectedVersion });
    },

    async listClientMeetings(actor, clientId, query) {
      return toPage(actor, query, { clientId });
    },

    async listProjectMeetings(actor, projectId, query) {
      return toPage(actor, query, { projectId });
    },

    async listMyMeetings(actor, query) {
      const page = await dbListMeetings(query, { kind: 'participant', userId: actor.id });

      return { data: page.data, nextCursor: page.nextCursor };
    },

    async getMeetingSummary(actor) {
      return summarizeMeetings(scopeFor(actor));
    },

    async getCalendar(actor, query) {
      return listMeetingCalendar(query, scopeFor(actor));
    },

    async checkOverlap(actor, query) {
      if (!canManageMeetings(actor)) {
        throw forbiddenError('Checking meeting overlaps requires the meetings.manage capability');
      }

      return findOverlappingMeetings(query, scopeFor(actor));
    },

    async listScheduleHistory(actor, id) {
      await requireAccess(actor, id);

      return listMeetingScheduleHistory(id);
    },

    async listActionItems(actor, meetingId) {
      await requireAccess(actor, meetingId);

      return listMeetingActionItems(meetingId);
    },

    async createActionItem(actor, meetingId, input) {
      await requireManage(actor, meetingId);

      return createMeetingActionItem(meetingId, input, actor.id, deps);
    },

    async updateActionItem(actor, meetingId, actionItemId, input) {
      await requireManage(actor, meetingId);

      return updateMeetingActionItem(meetingId, actionItemId, input, actor.id, deps);
    },

    async deleteActionItem(actor, meetingId, actionItemId) {
      await requireManage(actor, meetingId);

      await deleteMeetingActionItem(meetingId, actionItemId);
    },

    async convertActionItem(actor, meetingId, actionItemId, input) {
      await requireManage(actor, meetingId);

      return convertMeetingActionItem(meetingId, actionItemId, input, actor.id, deps);
    },
  };
}
