import { forwardRef, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, id, name, className, ...props },
  ref,
) {
  const inputId = id ?? name ?? label;

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={[
          'w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 outline-none',
          'transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
          'disabled:cursor-not-allowed disabled:bg-slate-100',
          error ? 'border-red-400' : 'border-slate-300',
          className ?? '',
        ].join(' ')}
        {...props}
      />
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
});
