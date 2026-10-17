import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  type GeneratedNodePreview,
  type ProjectGenerationPreview,
  type UserProfile,
} from '@interscale/shared';
import { formatDateTime } from '../../lib/dates';
import { jobRoleLabel } from '../../lib/template-labels';

interface TemplatePreviewProps {
  readonly preview: ProjectGenerationPreview;
  readonly employees: readonly UserProfile[] | null;
}

function employeeLabel(employees: readonly UserProfile[] | null, id: string | null): string | null {
  if (!id) {
    return null;
  }

  const found = employees?.find((employee) => employee.id === id);
  return found ? `${found.name} (${found.email})` : id;
}

/** Server-validated workflow preview (Step 23.9). */
export function TemplatePreview({ preview, employees }: TemplatePreviewProps) {
  const predecessorLabels = new Map<string, string[]>();

  for (const edge of preview.dependencies) {
    const list = predecessorLabels.get(edge.successorNodeKey) ?? [];
    list.push(edge.predecessorNodeKey);
    predecessorLabels.set(edge.successorNodeKey, list);
  }

  const topLevel = preview.tasks.filter((task) => task.parentNodeKey === null);
  const childrenOf = (parentKey: string): GeneratedNodePreview[] =>
    preview.tasks.filter((task) => task.parentNodeKey === parentKey);

  const renderNode = (task: GeneratedNodePreview, isSubtask: boolean): React.ReactNode => {
    const assignee = employeeLabel(employees, task.assignedUserId);
    const approver = employeeLabel(employees, task.approverId);
    const predecessors = predecessorLabels.get(task.nodeKey) ?? [];
    const needsAssignment = task.requiredJobRoleKey !== null && task.assignedUserId === null;
    const missingApprover = task.approvalRequired && task.approverId === null;

    return (
      <li
        key={task.nodeKey}
        data-testid={`preview-node-${task.nodeKey}`}
        className={`rounded-md border border-slate-200 bg-white px-3 py-2 ${
          isSubtask ? 'ml-4 border-l-2 border-l-slate-300' : ''
        }`}
      >
        <p className="text-sm font-medium text-slate-900">
          {isSubtask ? '↳ ' : ''}
          {task.title}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {task.requiredJobRoleKey ? jobRoleLabel(task.requiredJobRoleKey) : 'No role'} ·{' '}
          {TASK_PRIORITY_LABELS[task.priority]} · {TASK_STATUS_LABELS[task.initialStatus]} · Due{' '}
          {formatDateTime(task.dueAt)}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Assignee:{' '}
          {assignee ?? <span className="font-medium text-amber-700">Needs Assignment</span>}
          {task.approvalRequired
            ? ` · Approver: ${
                approver ?? <span className="font-medium text-amber-700">Missing approver</span>
              }`
            : ''}
        </p>
        {predecessors.length > 0 ? (
          <p className="mt-0.5 text-xs text-slate-500">Prerequisites: {predecessors.join(', ')}</p>
        ) : null}
        {task.deadlineWarning ? (
          <p className="mt-0.5 text-xs text-amber-700">{task.deadlineWarning}</p>
        ) : null}
        {needsAssignment || missingApprover ? (
          <p className="mt-0.5 text-xs font-medium text-amber-700">
            {needsAssignment ? 'Needs Assignment' : ''}
            {needsAssignment && missingApprover ? ' · ' : ''}
            {missingApprover ? 'Missing approver' : ''}
          </p>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-3" data-testid="template-preview">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold">{preview.name}</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {preview.templateName} · v{preview.templateVersion} · {preview.type}
          {preview.destination ? ` · ${preview.destination}` : ''}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Start {formatDateTime(preview.startAt)}
          {preview.targetAt ? ` · Target ${formatDateTime(preview.targetAt)}` : ''}
          {preview.managerId ? ` · Manager ${employeeLabel(employees, preview.managerId)}` : ''}
        </p>
      </div>

      {preview.warnings.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {preview.warnings.map((warning, index) => (
            <li key={index}>
              {warning.nodeKey ? `[${warning.nodeKey}] ` : ''}
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="space-y-2" data-testid="preview-hierarchy">
        {topLevel.map((task) => (
          <li key={task.nodeKey} className="space-y-2">
            {renderNode(task, false)}
            {childrenOf(task.nodeKey).length > 0 ? (
              <ul className="space-y-2">
                {childrenOf(task.nodeKey).map((child) => renderNode(child, true))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
