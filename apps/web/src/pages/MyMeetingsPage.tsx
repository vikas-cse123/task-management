import { MeetingsPage } from './MeetingsPage';

/** Personal meeting scope: meetings the user owns or attends. */
export function MyMeetingsPage() {
  return <MeetingsPage scope="mine" />;
}
