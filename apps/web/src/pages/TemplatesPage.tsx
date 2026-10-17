import {
  TEMPLATE_STATUSES,
  TEMPLATE_STATUS_LABELS,
  TEMPLATE_TYPES,
  TEMPLATE_TYPE_LABELS,
  type TemplateType,
} from '@interscale/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TextField } from '../components/ui/TextField';
import { useSession } from '../hooks/useSession';
import { useCreateTemplate, useTemplates } from '../hooks/useTemplates';
import { errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/dates';

/**
 * Templates list (Step 23.2/23.3).
 *
 * Admins manage every template; Managers may browse published templates they
 * can generate projects from. Employees never reach this page.
 */
export function TemplatesPage() {
  const { user } = useSession();
  const isAdmin = user?.accessLevel === 'Admin';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateType, setTemplateType] = useState<TemplateType>('campaign');

  const templates = useTemplates({
    search,
    status: status === '' ? undefined : status,
    type: type === '' ? undefined : type,
  });
  const createTemplate = useCreateTemplate();

  const resetCreate = (): void => {
    setKey('');
    setName('');
    setDescription('');
    setTemplateType('campaign');
    setFormError(null);
  };

  const handleCreate = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);

    if (name.trim().length === 0 || key.trim().length === 0) {
      setFormError('A key and a name are required.');
      return;
    }

    try {
      await createTemplate.mutateAsync({
        key: key.trim(),
        name: name.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
        type: templateType,
      });
      resetCreate();
      setShowCreate(false);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? 'Reusable project workflows: version, validate and publish.'
              : 'Published templates available for project creation.'}
          </p>
        </div>

        {isAdmin ? (
          <button
            type="button"
            onClick={() => {
              setShowCreate((value) => !value);
              setFormError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New template
          </button>
        ) : null}
      </div>

      {showCreate && isAdmin ? (
        <form
          onSubmit={handleCreate}
          className="grid max-w-xl gap-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <TextField
            label="Template key"
            name="template-key"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="destination_meta_ads_campaign"
            hint="Stable identifier: lowercase letters, digits and underscores."
            maxLength={60}
            required
          />
          <TextField
            label="Template name"
            name="template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Destination Meta Ads Campaign"
            maxLength={160}
            required
          />
          <TextField
            label="Description"
            name="template-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
          />
          <div className="space-y-1">
            <label htmlFor="template-type" className="block text-sm font-medium text-slate-700">
              Type
            </label>
            <select
              id="template-type"
              value={templateType}
              onChange={(event) => setTemplateType(event.target.value as TemplateType)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {TEMPLATE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {TEMPLATE_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createTemplate.isPending}
              className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {createTemplate.isPending ? 'Creating…' : 'Create template'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                resetCreate();
              }}
              className="w-fit rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className={`grid max-w-2xl gap-3 ${isAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <TextField
          label="Search templates"
          name="template-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Type to filter by name"
        />
        {isAdmin ? (
          <div className="space-y-1">
            <label
              htmlFor="filter-template-status"
              className="block text-sm font-medium text-slate-700"
            >
              Status
            </label>
            <select
              id="filter-template-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {TEMPLATE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {TEMPLATE_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="space-y-1">
          <label
            htmlFor="filter-template-type"
            className="block text-sm font-medium text-slate-700"
          >
            Type
          </label>
          <select
            id="filter-template-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            {TEMPLATE_TYPES.map((value) => (
              <option key={value} value={value}>
                {TEMPLATE_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {templates.isPending ? (
        <p className="text-sm text-slate-500">Loading templates…</p>
      ) : templates.isError ? (
        <p className="text-sm text-red-600">{errorMessage(templates.error)}</p>
      ) : templates.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          No templates found.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {templates.data.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  to={`/templates/${template.id}`}
                  className="text-sm font-medium text-slate-900 hover:underline"
                >
                  {template.name}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {TEMPLATE_TYPE_LABELS[template.type]} · {TEMPLATE_STATUS_LABELS[template.status]}{' '}
                  ·{' '}
                  {template.currentPublishedVersion
                    ? `v${template.currentPublishedVersion}`
                    : 'unpublished'}{' '}
                  · {template.taskDefinitionCount} task definitions · Updated{' '}
                  {formatDateTime(template.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {template.currentPublishedVersion ? (
                  <Link
                    to={`/projects?template=${template.id}`}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Use in project
                  </Link>
                ) : null}
                <Link
                  to={`/templates/${template.id}`}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  View
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
