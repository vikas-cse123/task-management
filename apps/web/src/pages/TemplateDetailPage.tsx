import {
  DEFAULT_TASK_PRIORITY,
  TEMPLATE_STATUS_LABELS,
  TEMPLATE_TYPE_LABELS,
  TEMPLATE_TYPES,
  TEMPLATE_VARIABLE_KEYS,
  type TemplateDependencyInput,
  type TemplateNodeInput,
  type TemplateType,
} from '@interscale/shared';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TemplateNodeEditor } from '../components/templates/TemplateNodeEditor';
import { TextField } from '../components/ui/TextField';
import { useSession } from '../hooks/useSession';
import {
  useArchiveTemplate,
  useEnsureDraft,
  usePublishTemplate,
  useReplaceDraft,
  useTemplate,
  useTemplateVersion,
  useUpdateTemplate,
  useValidateTemplate,
} from '../hooks/useTemplates';
import { errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/dates';

function emptyNode(sortOrder: number): TemplateNodeInput {
  return {
    nodeKey: '',
    parentNodeKey: null,
    titleTemplate: '',
    descriptionTemplate: null,
    requiredJobRoleKey: null,
    priority: DEFAULT_TASK_PRIORITY,
    approvalRequired: false,
    approverResolutionRule: 'none',
    assignmentRule: 'designated',
    relativeDueRule: null,
    isRequired: true,
    repeatGroup: null,
    sopUrl: null,
    referenceUrl: null,
    sortOrder,
  };
}

/**
 * Template detail + versioned editor (Step 23.4–23.6).
 *
 * Admins edit the single editable draft, validate and publish; Managers see a
 * read-only view of published versions.
 */
export function TemplateDetailPage() {
  const { id } = useParams();
  const templateId = id ?? '';
  const { user } = useSession();
  const isAdmin = user?.accessLevel === 'Admin';

  const detail = useTemplate(templateId);
  const draftVersion = detail.data?.draftVersion ?? null;
  const draft = useTemplateVersion(isAdmin ? templateId : undefined, draftVersion ?? undefined);

  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const viewed = useTemplateVersion(templateId, viewVersion ?? undefined);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TemplateType>('general');
  const [metaMessage, setMetaMessage] = useState<string | null>(null);

  const [nodes, setNodes] = useState<TemplateNodeInput[]>([]);
  const [dependencies, setDependencies] = useState<TemplateDependencyInput[]>([]);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [publishNotes, setPublishNotes] = useState('');
  const [archiveReason, setArchiveReason] = useState('');

  const updateTemplate = useUpdateTemplate(templateId);
  const replaceDraft = useReplaceDraft(templateId);
  const ensureDraft = useEnsureDraft(templateId);
  const validateTemplate = useValidateTemplate(templateId);
  const publishTemplate = usePublishTemplate(templateId);
  const archiveTemplate = useArchiveTemplate(templateId);

  useEffect(() => {
    if (detail.data) {
      setName(detail.data.name);
      setDescription(detail.data.description ?? '');
      setType(detail.data.type);
    }
  }, [detail.data?.id, detail.data?.version]);

  useEffect(() => {
    if (draft.data) {
      setNodes(draft.data.nodes.map((node) => ({ ...node })));
      setDependencies(draft.data.dependencies.map((edge) => ({ ...edge })));
    }
  }, [draft.data?.id, draft.data?.version]);

  if (detail.isPending) {
    return <p className="text-sm text-slate-500">Loading template…</p>;
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{errorMessage(detail.error, 'Template not found.')}</p>
        <Link to="/templates" className="text-sm font-medium text-slate-700 underline">
          Back to templates
        </Link>
      </div>
    );
  }

  const template = detail.data;
  const archived = template.status === 'archived';

  const nodeKeys = nodes.map((node) => node.nodeKey).filter((key) => key.trim().length > 0);

  const labelFor = (key: string): string => {
    const found = nodes.find((node) => node.nodeKey === key);
    return found && found.titleTemplate.trim().length > 0 ? found.titleTemplate : key;
  };

  const updateNode = (index: number, patch: Partial<TemplateNodeInput>): void => {
    setNodes((current) =>
      current.map((node, position) => (position === index ? { ...node, ...patch } : node)),
    );
  };

  const removeNode = (index: number): void => {
    setNodes((current) => current.filter((_node, position) => position !== index));
  };

  const handleSaveMeta = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setMetaMessage(null);

    try {
      await updateTemplate.mutateAsync({
        name: name.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
        type,
        expectedVersion: template.version,
      });
      setMetaMessage('Template details saved.');
    } catch (error) {
      setMetaMessage(errorMessage(error));
    }
  };

  const handleSaveDraft = async (): Promise<void> => {
    setDraftMessage(null);

    try {
      await replaceDraft.mutateAsync({ nodes, dependencies });
      setDraftMessage('Draft saved.');
    } catch (error) {
      setDraftMessage(errorMessage(error));
    }
  };

  const handleCreateDraft = async (): Promise<void> => {
    setDraftMessage(null);

    try {
      await ensureDraft.mutateAsync();
    } catch (error) {
      setDraftMessage(errorMessage(error));
    }
  };

  const handlePublish = async (): Promise<void> => {
    setDraftMessage(null);

    try {
      await publishTemplate.mutateAsync(
        publishNotes.trim().length > 0 ? { notes: publishNotes.trim() } : {},
      );
      setPublishNotes('');
      setDraftMessage('Published. A fresh draft was opened for future edits.');
    } catch (error) {
      setDraftMessage(errorMessage(error));
    }
  };

  const handleArchive = async (): Promise<void> => {
    setDraftMessage(null);

    if (archiveReason.trim().length === 0) {
      setDraftMessage('A reason is required to archive a template.');
      return;
    }

    try {
      await archiveTemplate.mutateAsync({ reason: archiveReason.trim() });
      setArchiveReason('');
      setDraftMessage('Template archived.');
    } catch (error) {
      setDraftMessage(errorMessage(error));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <Link to="/templates" className="text-xs font-medium text-slate-500 underline">
          ← Back to templates
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{template.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {TEMPLATE_TYPE_LABELS[template.type]} · {TEMPLATE_STATUS_LABELS[template.status]} ·{' '}
          {template.currentPublishedVersion
            ? `Published v${template.currentPublishedVersion}`
            : 'Not published'}{' '}
          · key <span className="font-mono">{template.key}</span>
        </p>
        {template.description ? (
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{template.description}</p>
        ) : null}
      </div>

      {isAdmin ? (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Template details</h2>
          <form onSubmit={handleSaveMeta} className="grid max-w-xl gap-3">
            <TextField
              label="Name"
              name="template-meta-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
            />
            <TextField
              label="Description"
              name="template-meta-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
            />
            <div className="space-y-1">
              <label
                htmlFor="template-meta-type"
                className="block text-sm font-medium text-slate-700"
              >
                Type
              </label>
              <select
                id="template-meta-type"
                value={type}
                onChange={(event) => setType(event.target.value as TemplateType)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={archived}
              >
                {TEMPLATE_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {TEMPLATE_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            {metaMessage ? <p className="text-sm text-slate-600">{metaMessage}</p> : null}
            <button
              type="submit"
              disabled={updateTemplate.isPending || archived}
              className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {updateTemplate.isPending ? 'Saving…' : 'Save details'}
            </button>
          </form>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Version history</h2>
        {template.versions.length === 0 ? (
          <p className="text-sm text-slate-500">No versions yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {template.versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    v{version.version} · {version.status}
                  </p>
                  <p className="text-xs text-slate-500">
                    {version.nodeCount} nodes
                    {version.publishedAt
                      ? ` · Published ${formatDateTime(version.publishedAt)}`
                      : ''}
                    {version.notes ? ` · ${version.notes}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewVersion(version.version)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  View
                </button>
              </li>
            ))}
          </ul>
        )}

        {viewVersion !== null ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Version v{viewVersion}</h3>
              <button
                type="button"
                onClick={() => setViewVersion(null)}
                className="text-xs font-medium text-slate-500 underline"
              >
                Close
              </button>
            </div>
            {viewed.isPending ? (
              <p className="mt-2 text-sm text-slate-500">Loading version…</p>
            ) : viewed.isError || !viewed.data ? (
              <p className="mt-2 text-sm text-red-600">That version is not available.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {viewed.data.nodes.map((node) => (
                  <li key={node.nodeKey}>
                    {node.parentNodeKey ? '↳ ' : ''}
                    {node.titleTemplate}{' '}
                    <span className="font-mono text-xs text-slate-400">{node.nodeKey}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      {isAdmin ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Draft editor{draftVersion ? ` · v${draftVersion}` : ''}
            </h2>
            <p className="text-xs text-slate-500">
              Placeholders: {TEMPLATE_VARIABLE_KEYS.map((key) => `{{${key}}}`).join(' ')}
            </p>
          </div>

          {archived ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
              This template is archived and can no longer be edited.
            </p>
          ) : !draftVersion ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">
                No draft is open. Create one to start editing.
              </p>
              <button
                type="button"
                onClick={() => void handleCreateDraft()}
                disabled={ensureDraft.isPending}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {ensureDraft.isPending ? 'Creating…' : 'Create draft'}
              </button>
            </div>
          ) : draft.isPending ? (
            <p className="text-sm text-slate-500">Loading draft…</p>
          ) : draft.isError ? (
            <p className="text-sm text-red-600">{errorMessage(draft.error)}</p>
          ) : (
            <>
              <div className="space-y-3">
                {nodes.map((node, index) => (
                  <TemplateNodeEditor
                    key={index}
                    node={node}
                    index={index}
                    nodeKeys={nodeKeys}
                    onChange={updateNode}
                    onRemove={removeNode}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setNodes((current) => [...current, emptyNode(current.length)])}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add task
              </button>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <h3 className="text-sm font-semibold">Prerequisites</h3>
                <p className="text-xs text-slate-500">
                  A prerequisite must finish before the dependent task can proceed.
                </p>
                {dependencies.map((edge, index) => (
                  <div
                    key={index}
                    className="grid items-end gap-2 rounded-md border border-slate-200 bg-white p-2 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <div className="space-y-1">
                      <label
                        htmlFor={`edge-pre-${index}`}
                        className="block text-xs font-medium text-slate-600"
                      >
                        Prerequisite (finishes first)
                      </label>
                      <select
                        id={`edge-pre-${index}`}
                        value={edge.predecessorNodeKey}
                        onChange={(event) =>
                          setDependencies((current) =>
                            current.map((item, position) =>
                              position === index
                                ? { ...item, predecessorNodeKey: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      >
                        {nodeKeys.map((key) => (
                          <option key={key} value={key}>
                            {labelFor(key)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`edge-suc-${index}`}
                        className="block text-xs font-medium text-slate-600"
                      >
                        Dependent task (unlocks after)
                      </label>
                      <select
                        id={`edge-suc-${index}`}
                        value={edge.successorNodeKey}
                        onChange={(event) =>
                          setDependencies((current) =>
                            current.map((item, position) =>
                              position === index
                                ? { ...item, successorNodeKey: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      >
                        {nodeKeys.map((key) => (
                          <option key={key} value={key}>
                            {labelFor(key)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDependencies((current) =>
                          current.filter((_item, position) => position !== index),
                        )
                      }
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={nodeKeys.length < 2}
                  onClick={() =>
                    setDependencies((current) => [
                      ...current,
                      {
                        predecessorNodeKey: nodeKeys[0] ?? '',
                        successorNodeKey: nodeKeys[1] ?? '',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add prerequisite
                </button>
              </div>

              {draftMessage ? <p className="text-sm text-slate-600">{draftMessage}</p> : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveDraft()}
                  disabled={replaceDraft.isPending}
                  className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                  {replaceDraft.isPending ? 'Saving…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  onClick={() => validateTemplate.mutate(draftVersion)}
                  disabled={validateTemplate.isPending}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {validateTemplate.isPending ? 'Validating…' : 'Validate'}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePublish()}
                  disabled={publishTemplate.isPending}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {publishTemplate.isPending ? 'Publishing…' : 'Publish'}
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <TextField
                  label="Publish notes (optional)"
                  name="publish-notes"
                  value={publishNotes}
                  onChange={(event) => setPublishNotes(event.target.value)}
                  maxLength={1000}
                />
                <div className="flex items-end gap-2">
                  <div className="w-full">
                    <TextField
                      label="Archive reason"
                      name="archive-reason"
                      value={archiveReason}
                      onChange={(event) => setArchiveReason(event.target.value)}
                      maxLength={1000}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleArchive()}
                    disabled={archiveTemplate.isPending}
                    className="mb-0.5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {archiveTemplate.isPending ? 'Archiving…' : 'Archive'}
                  </button>
                </div>
              </div>

              {validateTemplate.data ? (
                validateTemplate.data.result.valid ? (
                  <p className="text-sm text-green-700">
                    Validation passed for v{validateTemplate.data.version}.
                  </p>
                ) : (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-medium text-red-700">Validation found problems:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-red-700">
                      {validateTemplate.data.result.errors.map((entry, index) => (
                        <li key={index}>
                          {entry.nodeKey ? `[${entry.nodeKey}] ` : ''}
                          {entry.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
