import { createBrowserRouter } from 'react-router-dom';
import { RequireAdmin } from '../components/auth/RequireAdmin';
import { RequireAuth } from '../components/auth/RequireAuth';
import { RequireManagerOrAdmin } from '../components/auth/RequireManagerOrAdmin';
import { AppLayout } from '../components/layout/AppLayout';
import { ChangePasswordPage } from '../pages/ChangePasswordPage';
import { ClientDetailPage } from '../pages/ClientDetailPage';
import { ClientsPage } from '../pages/ClientsPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { MeetingDetailPage } from '../pages/MeetingDetailPage';
import { MeetingsCalendarPage } from '../pages/MeetingsCalendarPage';
import { MeetingsPage } from '../pages/MeetingsPage';
import { MyMeetingsPage } from '../pages/MyMeetingsPage';
import { MyTasksPage } from '../pages/MyTasksPage';
import { NewMeetingPage } from '../pages/NewMeetingPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ProfilePage } from '../pages/ProfilePage';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TaskDetailPage } from '../pages/TaskDetailPage';
import { TeamPage } from '../pages/TeamPage';
import { TemplateDetailPage } from '../pages/TemplateDetailPage';
import { TemplatesPage } from '../pages/TemplatesPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/change-password',
    element: (
      <RequireAuth>
        <ChangePasswordPage />
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'clients', element: <ClientsPage /> },
      { path: 'clients/:id', element: <ClientDetailPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'tasks/:id', element: <TaskDetailPage /> },
      { path: 'my-tasks', element: <MyTasksPage /> },
      { path: 'meetings', element: <MeetingsPage /> },
      { path: 'meetings/calendar', element: <MeetingsCalendarPage /> },
      { path: 'meetings/mine', element: <MyMeetingsPage /> },
      { path: 'meetings/new', element: <NewMeetingPage /> },
      { path: 'meetings/:id', element: <MeetingDetailPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'approvals', element: <ApprovalsPage /> },
      {
        path: 'templates',
        element: (
          <RequireManagerOrAdmin>
            <TemplatesPage />
          </RequireManagerOrAdmin>
        ),
      },
      {
        path: 'templates/:id',
        element: (
          <RequireManagerOrAdmin>
            <TemplateDetailPage />
          </RequireManagerOrAdmin>
        ),
      },
      { path: 'profile', element: <ProfilePage /> },
      {
        path: 'team',
        element: (
          <RequireAdmin>
            <TeamPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'settings',
        element: (
          <RequireAdmin>
            <SettingsPage />
          </RequireAdmin>
        ),
      },
      { path: 'forbidden', element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
