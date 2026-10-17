import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPES,
  hasCapability,
  type ProjectGenerationResult,
} from '@interscale/shared';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TemplateProjectWizard } from '../components/projects/TemplateProjectWizard';
import { TextField } from '../components/ui/TextField';
import { useClients } from '../hooks/useClients';
import { useEmployees } from '../hooks/useEmployees';
import { useCreateProject, useProjects } from '../hooks/useProjects';
import { useSession } from '../hooks/useSession';
import { errorMessage } from '../lib/api';

/** Project list with filters and Admin-only creation (Step 7, template wizard Step 23). */
export function ProjectsPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<'blank' | 'template'>('blank');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectType, setProjectType] = useState('campaign');

  const projects = useProjects({
    search,
    status: status === '' ? undefined : status,
    type: type === '' ? undefined : type,
  });
  const clients = useClients('');
  const employees = useEmployees(user?.accessLevel === 'Admin');
  const createProject = useCreateProject();

  const canCreate = user?.accessLevel === 'Admin';
  const canCreateTemplate = hasCapability(
    user?.accessLevel ?? 'Employee',
    user?.capabilities,
    'projects.create_from_template',
  );

  const initialTemplateId = params.get('template') ?? undefined;

  useEffect(() => {
    if (initialTemplateId && canCreateTemplate) {
      setMode('template');
      setShowCreate(true);
    }
  }, [initialTemplateId, canCreateTemplate]);

  const closeCreate = (): void => {
    setShowCreate(false);
    setMode('blank');

    if (params.has('template')) {
      const next = new URLSearchParams(params);
      next.delete('template');
      setParams(next, { replace: true });
    }
  };

  const handleCreate = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();

    if (name.trim().length === 0 || clientId.length === 0) {
      return;
    }

    try {
      await createProject.mutateAsync({
        clientId,
        name: name.trim(),
        description: null,
        type: projectType as 'campaign' | 'onboarding' | 'general',
        status: 'planned',
        managerId: null,
        startAt: null,
        targetAt: null,
      });
      setName('');
      setClientId('');
      closeCreate();
    } catch {
      // Surfaced below via createProject.error.
    }
  };

  const handleCreated = (result: ProjectGenerationResult): void => {
    closeCreate();
    navigate(`/projects/${result.project.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">
            {user?.accessLevel === 'Admin'
              ? 'Every project workspace in the agency.'
              : 'Projects you can access in your scope.'}
          </p>
        </div>

        {canCreate || canCreateTemplate ? (
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New project
          </button>
        ) : null}
      </div>

      {showCreate && (canCreate || canCreateTemplate) ? (
        <div className="space-y-3">
          {canCreate && canCreateTemplate ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('blank')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  mode === 'blank'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Blank project
              </button>
              <button
                type="button"
                onClick={() => setMode('template')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  mode === 'template'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                From template
              </button>
            </div>
          ) : null}

          {mode === 'blank' && canCreate ? (
            <form
              onSubmit={handleCreate}
              className="grid max-w-xl gap-3 rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="space-y-1">
                <label
                  htmlFor="project-client"
                  className="block text-sm font-medium text-slate-700"
                >
                  Client
                </label>
                <select
                  id="project-client"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select client…</option>
                  {clients.data?.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <TextField
                label="Project name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Singapore Meta Ads Campaign"
                maxLength={160}
              />
              <div className="space-y-1">
                <label htmlFor="project-type" className="block text-sm font-medium text-slate-700">
                  Type
                </label>
                <select
                  id="project-type"
                  value={projectType}
                  onChange={(event) => setProjectType(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {PROJECT_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              {createProject.error ? (
                <p className="text-sm text-red-600">{errorMessage(createProject.error)}</p>
              ) : null}
              <button
                type="submit"
                disabled={
                  createProject.isPending || name.trim().length === 0 || clientId.length === 0
                }
                className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {createProject.isPending ? 'Creating…' : 'Create project'}
              </button>
            </form>
          ) : null}

          {mode === 'template' && canCreateTemplate ? (
            <TemplateProjectWizard
              clients={clients.data ?? []}
              employees={user?.accessLevel === 'Admin' ? (employees.data ?? null) : null}
              initialTemplateId={initialTemplateId}
              onCreated={handleCreated}
              onCancel={closeCreate}
            />
          ) : null}
        </div>
      ) : null}

      <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
        <TextField
          label="Search projects"
          name="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Type to filter by name"
        />
        <div className="space-y-1">
          <label htmlFor="filter-status" className="block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="filter-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {PROJECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PROJECT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="filter-type" className="block text-sm font-medium text-slate-700">
            Type
          </label>
          <select
            id="filter-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            {PROJECT_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      {projects.isPending ? (
        <p className="text-sm text-slate-500">Loading projects…</p>
      ) : projects.isError ? (
        <p className="text-sm text-red-600">{errorMessage(projects.error)}</p>
      ) : projects.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          No projects found.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {projects.data.map((project) => (
            <li key={project.id}>
              <Link
                to={`/projects/${project.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{project.name}</p>
                  <p className="text-xs text-slate-500">
                    {project.type} · {PROJECT_STATUS_LABELS[project.status]}
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-400">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
