import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Building2,
  KeyRound,
  ScrollText,
} from "lucide-react";
import { useLogin } from "@/modules/auth/use-login";
import { useAuthStore } from "@/stores/auth.store";
import { Button, Field, Input } from "@/components/ui";
import { ApiError } from "@/lib/api-client";

const HIGHLIGHTS = [
  {
    icon: Building2,
    title: "Tenant lifecycle control",
    description: "Provision, suspend and archive organizations from one place.",
  },
  {
    icon: KeyRound,
    title: "Credentials & entitlements",
    description: "Issue API credentials and manage platform plan access.",
  },
  {
    icon: ScrollText,
    title: "Full auditability",
    description: "Every platform action is recorded and traceable.",
  },
];

export function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Already signed in → skip the login screen.
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  const errorMessage =
    login.error instanceof ApiError
      ? login.error.statusCode === 401
        ? "Invalid email or password."
        : login.error.message
      : login.error
        ? "Something went wrong. Please try again."
        : null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Brand panel — hidden on small screens. */}
      <aside className="relative hidden w-[46%] max-w-2xl overflow-hidden bg-slate-950 lg:flex lg:flex-col">
        {/* Decorative gradient wash + grid. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(99,102,241,0.35),transparent_55%),radial-gradient(90%_90%_at_100%_100%,rgba(56,189,248,0.22),transparent_50%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px]"
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur">
              SA
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">Super Admin</p>
              <p className="text-xs text-slate-400">SaaS Control Plane</p>
            </div>
          </div>

          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
              Control the platform,
              <br />
              not the paperwork.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              The operator console for managing tenants, provisioning,
              entitlements, credentials and platform configuration.
            </p>

            <ul className="mt-10 space-y-5">
              {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-indigo-300 ring-1 ring-inset ring-white/10">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="text-sm text-slate-400">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Protected platform environment · Authorized operators only
          </p>
        </div>
      </aside>

      {/* Sign-in panel */}
      <main className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {/* Compact brand for small screens (brand panel is hidden). */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">
              SA
            </span>
            <h1 className="text-lg font-semibold text-slate-900">
              Super Admin
            </h1>
            <p className="text-sm text-slate-500">SaaS Control Plane</p>
          </div>

          <div className="mb-6 hidden lg:block">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Sign in to the platform control plane.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <Field label="Email" htmlFor="login-email">
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={Boolean(errorMessage)}
                  className="pl-9"
                  required
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="login-password">
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={Boolean(errorMessage)}
                  className="pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
            </Field>

            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{errorMessage}</span>
              </div>
            )}

            <Button
              type="submit"
              size="md"
              className="h-11 w-full text-sm"
              loading={login.isPending}
            >
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Secured platform access
          </p>
        </div>
      </main>
    </div>
  );
}
