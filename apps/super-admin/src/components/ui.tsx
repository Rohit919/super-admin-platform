import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/** Minimal, dependency-free UI primitives for the Super Admin app. */

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50";
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    outline:
      "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
  } as const;
  return (
    <button className={cn(base, variants[variant], className)} {...props} />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border bg-white p-4 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  TRIAL: "bg-blue-100 text-blue-800",
  SUSPENDED: "bg-amber-100 text-amber-800",
  ARCHIVED: "bg-slate-200 text-slate-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700",
      )}
    >
      {status}
    </span>
  );
}
