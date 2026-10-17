import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { DatesSetArg, EventClickArg } from '@fullcalendar/core';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '../hooks/useClients';
import { useEmployees } from '../hooks/useEmployees';
import { useMeetingCalendar } from '../hooks/useMeetings';
import { useSession } from '../hooks/useSession';
import { errorMessage } from '../lib/api';
import { addDays, istRangeBounds, todayIst } from '../lib/meeting-dates';

/**
 * Calendar view over real scoped meetings (Step 35.4).
 *
 * Only standard MIT-licensed FullCalendar plugins (day grid, time grid,
 * interaction). Entries come from the scoped calendar API, so employees never
 * receive other clients' private meeting details. Clicking an event opens the
 * meeting detail, which re-checks access server-side.
 */
export function MeetingsCalendarPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const isAdmin = user?.accessLevel === 'Admin';

  const [clientId, setClientId] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [range, setRange] = useState(() => {
    const today = todayIst();
    return { start: addDays(today, -7), end: addDays(today, 37) };
  });

  const bounds = useMemo(() => istRangeBounds(range.start, range.end), [range]);
  const calendar = useMeetingCalendar({
    from: bounds.from,
    to: bounds.to,
    clientId: clientId === '' ? undefined : clientId,
    ownerUserId: ownerUserId.trim() === '' ? undefined : ownerUserId.trim(),
  });

  const clients = useClients('');
  const employees = useEmployees(isAdmin ?? false);

  const events = useMemo(
    () =>
      (calendar.data ?? []).map((entry) => ({
        id: entry.id,
        title: `${entry.title} · ${entry.clientName ?? '—'}`,
        start: entry.startsAt,
        end: entry.endsAt,
      })),
    [calendar.data],
  );

  const handleDatesSet = (arg: DatesSetArg): void => {
    const start = arg.start.toISOString().slice(0, 10);
    const end = arg.end.toISOString().slice(0, 10);

    setRange((previous) =>
      previous.start === start && previous.end === end ? previous : { start, end },
    );
  };

  const handleEventClick = (arg: EventClickArg): void => {
    navigate(`/meetings/${arg.event.id}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Meetings Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">
          Real scheduled meetings in your scope. Select an event to open its details.
        </p>
      </div>

      <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="calendar-client" className="block text-sm font-medium text-slate-700">
            Client
          </label>
          <select
            id="calendar-client"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All clients</option>
            {clients.data?.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="calendar-owner" className="block text-sm font-medium text-slate-700">
            Owner
          </label>
          {isAdmin && employees.data ? (
            <select
              id="calendar-owner"
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All owners</option>
              {employees.data.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="calendar-owner"
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
              placeholder="Owner user id"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          )}
        </div>
      </div>

      {calendar.isPending ? (
        <p className="text-sm text-slate-500">Loading calendar…</p>
      ) : calendar.isError ? (
        <p className="text-sm text-red-600">{errorMessage(calendar.error)}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 sm:p-4">
          <div className="min-w-[36rem]">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay',
              }}
              buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
              events={events}
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              height="auto"
              timeZone="Asia/Kolkata"
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: true }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
