import {
  JOB_ROLE_KEYS,
  MAX_REPEAT_INSTANCES,
  creativeTypeSchema,
  type CreativeType,
  type ProjectGenerationPreview,
  type ProjectGenerationPreviewInput,
  type ProjectGenerationResult,
  type RoleOverride,
  type TemplateSummary,
  type UserProfile,
} from '@interscale/shared';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  useCreateProjectFromTemplate,
  usePreviewProjectFromTemplate,
} from '../../hooks/useGeneration';
import { useTemplates } from '../../hooks/useTemplates';
import { errorMessage } from '../../lib/api';
import { fromDateTimeLocal } from '../../lib/dates';
import { jobRoleLabel } from '../../lib/template-labels';
import { TextField } from '../ui/TextField';
import { TemplatePreview } from './TemplatePreview';

const CREATIVE_TYPES: readonly CreativeType[] = creativeTypeSchema.options;
const selectClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

interface TemplateProjectWizardProps {
  readonly clients: readonly { id: string; name: string }[];
  readonly employees: readonly UserProfile[] | null;
  readonly initialTemplateId?: string;
  readonly onCreated: (result: ProjectGenerationResult) => void;
  readonly onCancel: () => void;
}

/**
 * Create-project-from-template wizard (Step 23.8/23.9/23.10).
 *
 * The preview is produced by the exact server expansion used at creation, and
 * creation is idempotent: the key is stable for a given payload and refreshed
 * whenever the payload changes.
 */
export function TemplateProjectWizard({
  clients,
  employees,
  initialTemplateId,
  onCreated,
  onCancel,
}: TemplateProjectWizardProps) {
  const templates = useTemplates({ status: 'published' });

  const [clientId, setClientId] = useState('');
  const [templateId, setTemplateId] = useState(initialTemplateId ?? '');
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [targetLocal, setTargetLocal] = useState('');
  const [managerId, setManagerId] = useState('');
  const [videoAdCount, setVideoAdCount] = useState(1);
  const [creativeTypes, setCreativeTypes] = useState<CreativeType[]>(['video']);
  const [roleOverrides, setRoleOverrides] = useState<RoleOverride[]>([]);

  const [preview, setPreview] = useState<ProjectGenerationPreview | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const previewMutation = usePreviewProjectFromTemplate();
  const createMutation = useCreateProjectFromTemplate();

  const template: TemplateSummary | undefined = templates.data?.find(
    (entry) => entry.id === templateId,
  );
  const isCampaign = template?.type === 'campaign';

  const startAt = fromDateTimeLocal(startLocal);
  const targetAt = fromDateTimeLocal(targetLocal);

  const signature = useMemo(
    () =>
      JSON.stringify({
        clientId,
        templateId,
        name,
        destination,
        campaignName,
        startLocal,
        targetLocal,
        managerId,
        videoAdCount,
        creativeTypes,
        roleOverrides,
      }),
    [
      clientId,
      templateId,
      name,
      destination,
      campaignName,
      startLocal,
      targetLocal,
      managerId,
      videoAdCount,
      creativeTypes,
      roleOverrides,
    ],
  );

  useEffect(() => {
    setPreview(null);
    setFormError(null);
    setIdempotencyKey(newIdempotencyKey());
  }, [signature]);

  const baseInput = (): ProjectGenerationPreviewInput | null => {
    if (clientId.length === 0 || templateId.length === 0 || name.trim().length === 0 || !startAt) {
      setFormError('Client, template, project name and a start date are required.');
      return null;
    }

    return {
      clientId,
      templateId,
      templateVersion: template?.currentPublishedVersion ?? undefined,
      name: name.trim(),
      destination: destination.trim().length > 0 ? destination.trim() : null,
      campaignName: campaignName.trim().length > 0 ? campaignName.trim() : null,
      startAt,
      targetAt,
      managerId: managerId.length > 0 ? managerId : null,
      videoAdCount,
      creativeTypes,
      roleOverrides,
      deadlineOverrides: [],
    };
  };

  const toggleCreative = (value: CreativeType): void => {
    setCreativeTypes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  };

  const handlePreview = async (): Promise<void> => {
    const input = baseInput();

    if (!input) {
      return;
    }

    setFormError(null);

    try {
      const result = await previewMutation.mutateAsync(input);
      setPreview(result);
    } catch (error) {
      setPreview(null);
      setFormError(errorMessage(error));
    }
  };

  const handleCreate = async (): Promise<void> => {
    const input = baseInput();

    if (!input) {
      return;
    }

    setFormError(null);

    try {
      const result = await createMutation.mutateAsync({ ...input, idempotencyKey });
      onCreated(result);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  return (
    <div className="grid max-w-xl gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold">Create project from template</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          The workflow is expanded, validated and previewed on the server before creation.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="wizard-client" className="block text-sm font-medium text-slate-700">
          Client
        </label>
        <select
          id="wizard-client"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          className={selectClass}
        >
          <option value="">Select client…</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="wizard-template" className="block text-sm font-medium text-slate-700">
          Template
        </label>
        <select
          id="wizard-template"
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          className={selectClass}
        >
          <option value="">Select template…</option>
          {(templates.data ?? []).map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} (v{entry.currentPublishedVersion})
            </option>
          ))}
        </select>
        {templates.isError ? (
          <p className="text-xs text-red-600">{errorMessage(templates.error)}</p>
        ) : null}
      </div>

      <TextField
        label="Project name"
        name="wizard-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Singapore Meta Ads Campaign"
        maxLength={160}
      />

      {isCampaign ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Destination"
            name="wizard-destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Singapore"
            maxLength={120}
          />
          <TextField
            label="Campaign name"
            name="wizard-campaign"
            value={campaignName}
            onChange={(event) => setCampaignName(event.target.value)}
            placeholder="Singapore Lead Gen"
            maxLength={160}
          />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="wizard-start" className="block text-sm font-medium text-slate-700">
            Start date
          </label>
          <input
            id="wizard-start"
            type="datetime-local"
            value={startLocal}
            onChange={(event) => setStartLocal(event.target.value)}
            className={selectClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="wizard-target" className="block text-sm font-medium text-slate-700">
            Target date (optional)
          </label>
          <input
            id="wizard-target"
            type="datetime-local"
            value={targetLocal}
            onChange={(event) => setTargetLocal(event.target.value)}
            className={selectClass}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="wizard-videos" className="block text-sm font-medium text-slate-700">
            Video ad count
          </label>
          <input
            id="wizard-videos"
            type="number"
            min={1}
            max={MAX_REPEAT_INSTANCES}
            value={videoAdCount}
            onChange={(event) =>
              setVideoAdCount(
                Math.max(1, Math.min(MAX_REPEAT_INSTANCES, Number(event.target.value) || 1)),
              )
            }
            className={selectClass}
          />
        </div>
        <div className="space-y-1">
          <span className="block text-sm font-medium text-slate-700">Creative options</span>
          <div className="flex flex-wrap gap-3 pt-1">
            {CREATIVE_TYPES.map((value) => (
              <label key={value} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={creativeTypes.includes(value)}
                  onChange={() => toggleCreative(value)}
                />
                {value}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="wizard-manager" className="block text-sm font-medium text-slate-700">
          Project Manager (optional)
        </label>
        {employees ? (
          <select
            id="wizard-manager"
            value={managerId}
            onChange={(event) => setManagerId(event.target.value)}
            className={selectClass}
          >
            <option value="">None</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} ({employee.email})
              </option>
            ))}
          </select>
        ) : (
          <input
            id="wizard-manager"
            value={managerId}
            onChange={(event) => setManagerId(event.target.value)}
            placeholder="User id, empty for none"
            className={selectClass}
          />
        )}
      </div>

      <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/60 p-3">
        <h3 className="text-sm font-semibold">Employee overrides (optional)</h3>
        <p className="text-xs text-slate-500">
          Overrides win over client-designated employees. Invalid employees are rejected by the
          server.
        </p>
        {roleOverrides.map((override, index) => (
          <div
            key={index}
            className="grid items-end gap-2 rounded-md border border-slate-200 bg-white p-2 sm:grid-cols-[1fr_1fr_auto]"
          >
            <div className="space-y-1">
              <label
                htmlFor={`override-role-${index}`}
                className="block text-xs font-medium text-slate-600"
              >
                Role
              </label>
              <select
                id={`override-role-${index}`}
                value={override.jobRoleKey}
                onChange={(event) =>
                  setRoleOverrides((current) =>
                    current.map((item, position) =>
                      position === index
                        ? { ...item, jobRoleKey: event.target.value as never }
                        : item,
                    ),
                  )
                }
                className={selectClass}
              >
                {JOB_ROLE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {jobRoleLabel(key)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label
                htmlFor={`override-user-${index}`}
                className="block text-xs font-medium text-slate-600"
              >
                Employee
              </label>
              <select
                id={`override-user-${index}`}
                value={override.userId}
                onChange={(event) =>
                  setRoleOverrides((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, userId: event.target.value } : item,
                    ),
                  )
                }
                className={selectClass}
              >
                <option value="">Select employee…</option>
                {(employees ?? []).map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} ({employee.email})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() =>
                setRoleOverrides((current) =>
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
          disabled={!employees || employees.length === 0}
          onClick={() =>
            setRoleOverrides((current) => [
              ...current,
              { jobRoleKey: JOB_ROLE_KEYS[0], userId: employees?.[0]?.id ?? '' },
            ])
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add override
        </button>
      </div>

      {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handlePreview()}
          disabled={previewMutation.isPending}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          {previewMutation.isPending ? 'Previewing…' : 'Preview workflow'}
        </button>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={!preview || createMutation.isPending}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {createMutation.isPending ? 'Creating…' : 'Create project'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>

      {!preview ? (
        <p className="text-xs text-slate-500">Preview the workflow to enable creation.</p>
      ) : null}

      {preview ? <TemplatePreview preview={preview} employees={employees} /> : null}
    </div>
  );
}
