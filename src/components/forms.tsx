"use client";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { X, Copy, Check, Loader2 } from "lucide-react";

export type ActionResult = { ok?: boolean; error?: string; message?: string; data?: Record<string, unknown> } | null;
export type FormAction = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

const PendingCtx = createContext(false);

export function SubmitButton({ children, className = "btn-primary", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const status = useFormStatus();
  const ctxPending = useContext(PendingCtx);
  const pending = status.pending || ctxPending;
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/**
 * Formulario conectado a una acción de servidor. Muestra errores/mensajes y
 * opcionalmente reinicia el formulario o ejecuta onSuccess.
 */
export function ActionForm({
  action, children, className, resetOnSuccess, onSuccess, confirm, showMessage = true, hidden,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: ActionResult) => void;
  confirm?: string;
  showMessage?: boolean;
  hidden?: Record<string, string | undefined | null>;
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const last = useRef<ActionResult>(null);
  useEffect(() => {
    if (state && state !== last.current) {
      last.current = state;
      if (!state.error) {
        if (resetOnSuccess) ref.current?.reset();
        onSuccess?.(state);
      }
    }
  }, [state, resetOnSuccess, onSuccess]);
  return (
    <PendingCtx.Provider value={isPending}>
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        // Se envía manualmente para evitar que React 19 vacíe el formulario cuando hay errores.
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(fd));
      }}
    >
      {hidden && Object.entries(hidden).map(([k, v]) => v != null && <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {showMessage && state?.error && <p role="alert" className="mt-2 text-sm text-rose-600">{state.error}</p>}
      {showMessage && !state?.error && state?.message && <p className="mt-2 text-sm text-emerald-700">{state.message}</p>}
      {showMessage && typeof state?.data?.link === "string" && <CopyField value={state.data.link} />}
    </form>
    </PendingCtx.Provider>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2">
      <input readOnly value={value} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn-secondary shrink-0"
        onClick={async () => { await navigator.clipboard.writeText(value).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

export function Modal({
  trigger, title, children, wide, triggerClassName = "btn-primary", open: controlled, onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  wide?: boolean;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (o: boolean) => { setInner(o); onOpenChange?.(o); };
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      {trigger && <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>{trigger}</button>}
      {mounted && open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-modal="true" aria-label={title} className={clsx("max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink-900">{title}</h2>
              <button type="button" onClick={close} className="btn-ghost -mr-2 p-1.5" aria-label="Cerrar"><X className="h-4 w-4" /></button>
            </div>
            {typeof children === "function" ? children(close) : children}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Botón que ejecuta una acción con confirmación opcional. */
export function ActionButton({
  action, hidden, children, className = "btn-ghost btn-sm", confirm, title,
}: { action: FormAction; hidden: Record<string, string | undefined | null>; children: React.ReactNode; className?: string; confirm?: string; title?: string }) {
  return (
    <ActionForm action={action} hidden={hidden} confirm={confirm} className="inline">
      <SubmitButton className={className}><span title={title} className="inline-flex items-center gap-1">{children}</span></SubmitButton>
    </ActionForm>
  );
}
