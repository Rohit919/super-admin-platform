import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dependency-free UI primitives for the Super Admin control plane.
 *
 * These deliberately avoid pulling in a component library (no Radix/shadcn) so
 * the Super Admin app stays lean, while still delivering an enterprise-grade
 * look: consistent spacing, focus rings, hover/pressed/disabled states, and
 * accessible semantics (labels, roles, keyboard interaction). The visual
 * language (soft surfaces, slate neutrals, indigo accent, dotted status badges,
 * initials avatars) is adapted from the slash-admin reference without copying
 * its source or dependencies.
 */

// ── Button ────────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "outline" | "ghost" | "danger" | "subtle";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950",
  outline:
    "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 active:bg-slate-100",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-400",
  subtle: "bg-slate-100 text-slate-800 hover:bg-slate-200",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-sm",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Square icon-only button (row actions, toolbar controls). */
export function IconButton({
  className,
  label,
  variant = "ghost",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: ButtonVariant;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        "h-8 w-8 p-0",
        className,
      )}
      {...props}
    />
  );
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition-colors",
        "placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
        "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
        "aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-100",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors",
        "placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
        "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  wrapperClassName,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative inline-block", wrapperClassName)}>
      <select
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-sm text-slate-900 shadow-sm outline-none transition-colors",
          "focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
    </div>
  );
}

/** Accessible label + optional helper/error text wrapper for form controls. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-sm font-medium text-slate-700"
      >
        {label}
        {required && (
          <span className="text-red-500" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

// ── Surfaces ──────────────────────────────────────────────────────────────────

export function Card({
  className,
  padded = true,
  children,
}: {
  className?: string;
  /**
   * Adds default inner padding. Keep `true` (default) for simple content cards
   * so existing screens render correctly; set `false` when composing with
   * `CardHeader`/`CardBody`, which manage their own padding.
   */
  padded?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-sm",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Card header with a title, optional description, and optional right-side slot. */
export function CardHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {Icon && <Icon className="h-4 w-4 text-slate-500" aria-hidden />}
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      )}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

// ── Avatar (deterministic initials) ────────────────────────────────────────────

const AVATAR_PALETTE = [
  "bg-indigo-100 text-indigo-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic initials avatar. Given no uploaded logo in the data model, this
 * gives each tenant a stable, recognizable visual identity keyed off its name.
 */
export function Avatar({
  name,
  seed,
  size = "md",
  className,
}: {
  name: string;
  seed?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const palette =
    AVATAR_PALETTE[hashString(seed ?? name) % AVATAR_PALETTE.length];
  const sizes = {
    sm: "h-7 w-7 text-[11px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-base",
  } as const;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold",
        palette,
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

// ── Status badge (dot + label, never colour-only) ──────────────────────────────

type BadgeTone =
  "success" | "info" | "warning" | "neutral" | "danger" | "accent";

const BADGE_TONES: Record<BadgeTone, { chip: string; dot: string }> = {
  success: {
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    dot: "bg-emerald-500",
  },
  info: { chip: "bg-sky-50 text-sky-700 ring-sky-600/20", dot: "bg-sky-500" },
  warning: {
    chip: "bg-amber-50 text-amber-700 ring-amber-600/20",
    dot: "bg-amber-500",
  },
  neutral: {
    chip: "bg-slate-100 text-slate-600 ring-slate-500/20",
    dot: "bg-slate-400",
  },
  danger: { chip: "bg-red-50 text-red-700 ring-red-600/20", dot: "bg-red-500" },
  accent: {
    chip: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
    dot: "bg-indigo-500",
  },
};

/** Generic pill badge. `dot` adds a leading status dot (icon-independent signal). */
export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = BADGE_TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        t.chip,
        className,
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden />
      )}
      {children}
    </span>
  );
}

const TENANT_STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  TRIAL: "info",
  SUSPENDED: "warning",
  ARCHIVED: "neutral",
  REVOKED: "danger",
};

/**
 * Tenant/credential status badge. Communicates status by dot + text label (not
 * colour alone) with an accessible label for assistive tech.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = TENANT_STATUS_TONE[status] ?? "neutral";
  return (
    <Badge tone={tone} dot className={cn("uppercase tracking-wide", className)}>
      <span className="sr-only">Status: </span>
      {status}
    </Badge>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-slate-200/70", className)}
    />
  );
}

// ── Page header ────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty / error states ─────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-slate-500">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  requestId,
  onRetry,
  icon: Icon,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  requestId?: string | null;
  onRetry?: () => void;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50/60 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-500">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-red-800">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-red-700">{description}</p>
        )}
        {requestId && (
          <p className="text-xs text-red-500">
            Request ID: <span className="font-mono">{requestId}</span>
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

// ── Table primitives ──────────────────────────────────────────────────────────

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          {children}
        </table>
      </div>
    </div>
  );
}

export function Th({
  className,
  align = "left",
  children,
}: {
  className?: string;
  align?: "left" | "right" | "center";
  children?: ReactNode;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  align = "left",
  onClick,
  children,
}: {
  className?: string;
  align?: "left" | "right" | "center";
  onClick?: (e: ReactMouseEvent<HTMLTableCellElement>) => void;
  children?: ReactNode;
}) {
  return (
    <td
      onClick={onClick}
      className={cn(
        "px-4 py-3 text-slate-700",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

// ── Dropdown menu (click-to-open, outside-click + Escape to close) ─────────────

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

export function DropdownMenu({
  trigger,
  label,
  align = "right",
  children,
}: {
  trigger?: ReactNode;
  label: string;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={cn(BUTTON_BASE, BUTTON_VARIANTS.ghost, "h-8 w-8 p-0")}
      >
        {trigger ?? <MenuDots />}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-30 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white p-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  className,
  danger,
  icon: Icon,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        MENU_ITEM,
        danger && "text-red-600 hover:bg-red-50 focus-visible:bg-red-50",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-slate-100" />;
}

function MenuDots() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="10" cy="4" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="10" cy="16" r="1.5" />
    </svg>
  );
}

// ── Tabs (URL-agnostic, controlled by caller) ──────────────────────────────────

export interface TabItem {
  value: string;
  label: string;
  icon?: LucideIcon;
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Sections"
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-slate-200",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
              active
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Dialog / Modal ──────────────────────────────────────────────────────────

const DialogContext = createContext<{ titleId: string } | null>(null);

export function Dialog({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  const fallbackId = useId();
  const titleId = labelledBy ?? fallbackId;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <DialogContext.Provider value={{ titleId }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
          onClick={onClose}
          aria-hidden
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>,
    document.body,
  );
}

export function DialogHeader({
  title,
  description,
  onClose,
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
}) {
  const ctx = useContext(DialogContext);
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <h2
          id={ctx?.titleId}
          className="text-base font-semibold text-slate-900"
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {onClose && (
        <IconButton label="Close dialog" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden />
        </IconButton>
      )}
    </div>
  );
}

export function DialogBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
      {children}
    </div>
  );
}

// ── Copyable code (secrets / keys) ─────────────────────────────────────────────

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

// ── Control-center primitives (Phase 19) ──────────────────────────────────────

/**
 * Compact metric tile for the tenant Control Center. Shows a value with a label
 * and optional icon + sublabel. Use ONLY for real data — never decorative
 * metrics (see docs/PHASE-19-TENANT-CONTROL-CENTER.md §34).
 */
export function SummaryStat({
  label,
  value,
  icon: Icon,
  sublabel,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  sublabel?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  className?: string;
}) {
  const valueTone: Record<string, string> = {
    neutral: "text-slate-900",
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-red-700",
    accent: "text-indigo-700",
  };
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          valueTone[tone],
        )}
      >
        {value}
      </div>
      {sublabel && (
        <div className="mt-1 text-xs text-slate-500">{sublabel}</div>
      )}
    </div>
  );
}

/** A responsive definition grid for structured metadata (2-col → 1-col). */
export function MetadataGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </dl>
  );
}

/** One label/value pair inside a {@link MetadataGrid}. */
export function MetadataItem({
  label,
  value,
  mono,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 break-words text-sm text-slate-900",
          mono && "font-mono text-slate-600",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Vertical timeline container (audit history, lifecycle). */
export function Timeline({ children }: { children: ReactNode }) {
  return (
    <ol className="relative space-y-5 pl-5 before:absolute before:left-[3px] before:top-1 before:h-full before:w-px before:bg-slate-200">
      {children}
    </ol>
  );
}

const TIMELINE_DOT_TONE: Record<string, string> = {
  neutral: "bg-slate-400",
  accent: "bg-indigo-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

/** One event on a {@link Timeline}. */
export function TimelineItem({
  title,
  meta,
  tone = "accent",
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  children?: ReactNode;
}) {
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[calc(1.25rem-1px)] top-1 h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-white",
          TIMELINE_DOT_TONE[tone],
        )}
        aria-hidden
      />
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {meta && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          {meta}
        </p>
      )}
      {children}
    </li>
  );
}

/**
 * An honest "not tracked yet" note for a documented capability gap. Renders a
 * neutral panel that explains the platform does not measure something — used
 * INSTEAD of inventing fake metrics (see docs/PHASE-19-TENANT-CONTROL-CENTER.md).
 */
export function CapabilityGapNote({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3",
        className,
      )}
    >
      {Icon && (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        )}
      </div>
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

/** Thin horizontal rule for separating sections within a card. */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-slate-100", className)} />;
}

// ── InfoRow ───────────────────────────────────────────────────────────────────

/**
 * A compact single-line label/value pair. Sits inside a `InfoList` group.
 * Renders "Not provided" when `value` is null/undefined/empty so the field
 * is always visible and the operator knows the data is absent, not hidden.
 */
export function InfoList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-slate-50", className)}>{children}</div>
  );
}

export function InfoRow({
  label,
  value,
  mono,
  href,
  empty = "Not provided",
  className,
}: {
  label: string;
  value?: ReactNode;
  mono?: boolean;
  /** Wrap the value in an anchor (external links). */
  href?: string;
  /** Text shown when value is nullish/empty string. Defaults to "Not provided". */
  empty?: string;
  className?: string;
}) {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "string" && value.trim() === "");

  const content = isEmpty ? (
    <span className="text-slate-400 italic">{empty}</span>
  ) : href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "text-indigo-600 hover:underline",
        mono && "font-mono text-xs",
      )}
    >
      {value}
    </a>
  ) : (
    <span className={cn(mono && "font-mono text-xs text-slate-700")}>
      {value}
    </span>
  );

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 py-2.5 text-sm",
        className,
      )}
    >
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 text-right text-slate-900">{content}</span>
    </div>
  );
}

// ── SectionLabel ─────────────────────────────────────────────────────────────

/** Small uppercase section separator used inside card bodies. */
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs font-semibold uppercase tracking-widest text-slate-400",
        className,
      )}
    >
      {children}
    </p>
  );
}
