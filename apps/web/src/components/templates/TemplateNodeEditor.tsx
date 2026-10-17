import {
  DEADLINE_ANCHORS,
  JOB_ROLE_KEYS,
  TASK_PRIORITIES,
  TEMPLATE_APPROVER_RULES,
  TEMPLATE_ASSIGNMENT_RULES,
  type TemplateNodeInput,
} from '@interscale/shared';
import { Trash2 } from 'lucide-react';
import { TextField } from '../ui/TextField';
import { jobRoleLabel } from '../../lib/template-labels';

interface TemplateNodeEditorProps {
  readonly node: TemplateNodeInput;
  readonly index: number;
  readonly nodeKeys: readonly string[];
  readonly onChange: (index: number, patch: Partial<TemplateNodeInput>) => void;
  readonly onRemove: (index: number) => void;
}

const selectClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm';

/** One editable template node (Step 23.4): form/list-based, no drag-and-drop. */
export function TemplateNodeEditor({
  node,
  index,
  nodeKeys,
  onChange,
  onRemove,
}: TemplateNodeEditorProps) {
  const update = (patch: Partial<TemplateNodeInput>): void => onChange(index, patch);
  const isSubtask = node.parentNodeKey !== null;
  const dueRule = node.relativeDueRule;

  return (
    <div
      data-testid={`template-node-${node.nodeKey || index}`}
      className={`space-y-3 rounded-lg border p-3 ${
        isSubtask ? 'border-slate-200 bg-slate-50/60' : 'border-slate-300 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {isSubtask ? 'Subtask' : 'Task'} · {node.nodeKey || 'unnamed'}
        </p>
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label={`Remove ${node.nodeKey || 'node'}`}
          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Node key"
          name={`node-key-${index}`}
          value={node.nodeKey}
          onChange={(event) => update({ nodeKey: event.target.value })}
          placeholder="campaign_brief"
          maxLength={60}
        />
        <TextField
          label="Title template"
          name={`node-title-${index}`}
          value={node.titleTemplate}
          onChange={(event) => update({ titleTemplate: event.target.value })}
          placeholder="Write {{campaignName}} Brief"
          maxLength={200}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor={`node-desc-${index}`} className="block text-sm font-medium text-slate-700">
          Description template
        </label>
        <textarea
          id={`node-desc-${index}`}
          value={node.descriptionTemplate ?? ''}
          onChange={(event) =>
            update({
              descriptionTemplate: event.target.value.length > 0 ? event.target.value : null,
            })
          }
          rows={2}
          maxLength={2000}
          className={selectClass}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label
            htmlFor={`node-parent-${index}`}
            className="block text-sm font-medium text-slate-700"
          >
            Parent task
          </label>
          <select
            id={`node-parent-${index}`}
            value={node.parentNodeKey ?? ''}
            onChange={(event) => update({ parentNodeKey: event.target.value || null })}
            className={selectClass}
          >
            <option value="">None (top-level task)</option>
            {nodeKeys
              .filter((key) => key !== node.nodeKey)
              .map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`node-role-${index}`}
            className="block text-sm font-medium text-slate-700"
          >
            Functional job role
          </label>
          <select
            id={`node-role-${index}`}
            value={node.requiredJobRoleKey ?? ''}
            onChange={(event) =>
              update({ requiredJobRoleKey: (event.target.value || null) as never })
            }
            className={selectClass}
          >
            <option value="">Unset (manual resolution)</option>
            {JOB_ROLE_KEYS.map((key) => (
              <option key={key} value={key}>
                {jobRoleLabel(key)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`node-priority-${index}`}
            className="block text-sm font-medium text-slate-700"
          >
            Priority
          </label>
          <select
            id={`node-priority-${index}`}
            value={node.priority}
            onChange={(event) => update({ priority: event.target.value as never })}
            className={selectClass}
          >
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label
            htmlFor={`node-assign-${index}`}
            className="block text-sm font-medium text-slate-700"
          >
            Assignment rule
          </label>
          <select
            id={`node-assign-${index}`}
            value={node.assignmentRule}
            onChange={(event) => update({ assignmentRule: event.target.value as never })}
            className={selectClass}
          >
            {TEMPLATE_ASSIGNMENT_RULES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`node-approval-${index}`}
            className="block text-sm font-medium text-slate-700"
          >
            Approver rule
          </label>
          <select
            id={`node-approval-${index}`}
            value={node.approverResolutionRule}
            onChange={(event) => update({ approverResolutionRule: event.target.value as never })}
            className={selectClass}
            disabled={!node.approvalRequired}
          >
            {TEMPLATE_APPROVER_RULES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-4 pb-1">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={node.approvalRequired}
              onChange={(event) =>
                update({
                  approvalRequired: event.target.checked,
                  approverResolutionRule: event.target.checked ? 'project_manager' : 'none',
                })
              }
            />
            Approval required
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={node.isRequired}
              onChange={(event) => update({ isRequired: event.target.checked })}
            />
            Required
          </label>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-4">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 sm:col-span-4">
          <input
            type="checkbox"
            checked={dueRule !== null}
            onChange={(event) =>
              update({
                relativeDueRule: event.target.checked
                  ? { anchor: 'project_start', offsetDays: 1, timeOfDay: '09:00' }
                  : null,
              })
            }
          />
          Relative deadline
        </label>
        {dueRule ? (
          <>
            <div className="space-y-1">
              <label
                htmlFor={`node-anchor-${index}`}
                className="block text-sm font-medium text-slate-700"
              >
                Anchor
              </label>
              <select
                id={`node-anchor-${index}`}
                value={dueRule.anchor}
                onChange={(event) =>
                  update({ relativeDueRule: { ...dueRule, anchor: event.target.value as never } })
                }
                className={selectClass}
              >
                {DEADLINE_ANCHORS.map((value) => (
                  <option key={value} value={value}>
                    {value === 'project_start' ? 'Project start' : 'Project target'}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label="Offset (days)"
              name={`node-offset-${index}`}
              type="number"
              min={0}
              max={365}
              value={dueRule.offsetDays}
              onChange={(event) =>
                update({
                  relativeDueRule: { ...dueRule, offsetDays: Number(event.target.value) || 0 },
                })
              }
            />
            <TextField
              label="Time of day (IST)"
              name={`node-time-${index}`}
              value={dueRule.timeOfDay}
              onChange={(event) =>
                update({ relativeDueRule: { ...dueRule, timeOfDay: event.target.value } })
              }
              placeholder="09:00"
            />
          </>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          label="Repeat group"
          name={`node-repeat-${index}`}
          value={node.repeatGroup ?? ''}
          onChange={(event) => update({ repeatGroup: event.target.value || null })}
          placeholder="video_ad"
          maxLength={60}
          hint="Nodes sharing a group repeat per creative."
        />
        <TextField
          label="SOP URL"
          name={`node-sop-${index}`}
          value={node.sopUrl ?? ''}
          onChange={(event) => update({ sopUrl: event.target.value || null })}
          placeholder="https://…"
        />
        <TextField
          label="Reference URL"
          name={`node-ref-${index}`}
          value={node.referenceUrl ?? ''}
          onChange={(event) => update({ referenceUrl: event.target.value || null })}
          placeholder="https://…"
        />
      </div>
    </div>
  );
}
