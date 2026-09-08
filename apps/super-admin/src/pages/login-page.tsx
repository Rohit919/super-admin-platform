import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useLogin } from "@/modules/auth/use-login";
import { useAuthStore } from "@/stores/auth.store";
import { Button, Card, Field, Input } from "@/components/ui";
import { ApiError } from "@/lib/api-client";

export function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded bg-slate-900 text-sm font-semibold text-white">
            SA
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Super Admin</h1>
          <p className="text-sm text-slate-500">Platform management</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          {errorMessage && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}

          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
