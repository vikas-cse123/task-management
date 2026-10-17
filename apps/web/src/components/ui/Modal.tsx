import { useEffect, type ReactNode } from 'react';

/** Accessible dialog overlay following the existing design system. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKey);

    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-8 w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
