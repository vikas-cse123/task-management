import { APP_NAME } from '@interscale/shared';
import {
  Bell,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  User,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useUnreadNotificationCount } from '../../hooks/useNotifications';
import { useRefreshSession, useSession } from '../../hooks/useSession';
import { signOut } from '../../lib/auth-api';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition',
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
  ].join(' ');
}

export function AppLayout() {
  const { user } = useSession();
  const refresh = useRefreshSession();
  const unread = useUnreadNotificationCount(user !== null);
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = user?.accessLevel === 'Admin';
  const canSeeTemplates = user !== null && user.accessLevel !== 'Employee';

  const handleSignOut = async (): Promise<void> => {
    setSigningOut(true);

    try {
      await signOut();
      await refresh();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      <NavLink to="/" end className={navLinkClass} onClick={() => setMenuOpen(false)}>
        <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
        Overview
      </NavLink>
      <NavLink to="/clients" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        <Briefcase className="h-4 w-4" aria-hidden="true" />
        Clients
      </NavLink>
      <NavLink to="/projects" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        <FolderKanban className="h-4 w-4" aria-hidden="true" />
        Projects
      </NavLink>
      <NavLink to="/my-tasks" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
        My Tasks
      </NavLink>
      <NavLink to="/meetings" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        <Video className="h-4 w-4" aria-hidden="true" />
        Meetings
      </NavLink>
      <NavLink to="/meetings/calendar" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        Calendar
      </NavLink>
      <NavLink to="/notifications" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        <Bell className="h-4 w-4" aria-hidden="true" />
        <span className="flex-1">Notifications</span>
        {unread.data && unread.data > 0 ? (
          <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {unread.data > 99 ? '99+' : unread.data}
          </span>
        ) : null}
      </NavLink>
      <NavLink to="/approvals" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
        Approvals
      </NavLink>
      {canSeeTemplates ? (
        <NavLink to="/templates" className={navLinkClass} onClick={() => setMenuOpen(false)}>
          <FileText className="h-4 w-4" aria-hidden="true" />
          Templates
        </NavLink>
      ) : null}
      {isAdmin ? (
        <NavLink to="/team" className={navLinkClass} onClick={() => setMenuOpen(false)}>
          <Users className="h-4 w-4" aria-hidden="true" />
          Team
        </NavLink>
      ) : null}
      {isAdmin ? (
        <NavLink to="/settings" className={navLinkClass} onClick={() => setMenuOpen(false)}>
          <Settings className="h-4 w-4" aria-hidden="true" />
          Settings
        </NavLink>
      ) : null}
      <NavLink to="/profile" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        <User className="h-4 w-4" aria-hidden="true" />
        Profile
      </NavLink>
    </nav>
  );

  const userCard = user ? (
    <div className="leading-tight">
      <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
      <p className="truncate text-xs text-slate-500">
        {user.email} · {user.accessLevel}
      </p>
    </div>
  ) : null;

  const signOutButton = (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
      {signingOut ? 'Signing out…' : 'Sign out'}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          >
            {menuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          <Link to="/" className="text-sm font-semibold tracking-tight">
            {APP_NAME}
          </Link>
        </div>
        {signOutButton}
      </header>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 cursor-default bg-slate-900/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 bg-white p-4 shadow-xl">
            <Link
              to="/"
              onClick={() => setMenuOpen(false)}
              className="text-sm font-semibold tracking-tight"
            >
              {APP_NAME}
            </Link>
            {nav}
            <div className="mt-auto border-t border-slate-200 pt-3">{userCard}</div>
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-slate-200 bg-white p-4 lg:flex">
        <Link to="/" className="px-1 text-sm font-semibold tracking-tight">
          {APP_NAME}
        </Link>
        {nav}
        <div className="mt-auto space-y-3 border-t border-slate-200 pt-3">
          {userCard}
          {signOutButton}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
