import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyAuthError, validateEmail, validatePassword } from '@/lib/auth';
import { useAuth } from '@/context/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Alert, PageLoader } from '@/components/ui/misc';

/* ---------------- Check your email ---------------- */
export function CheckEmail() {
  const email = (useLocation().state as { email?: string } | null)?.email;
  const [sent, setSent] = useState(false);

  async function resend() {
    if (!email) return;
    await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    });
    setSent(true);
  }

  return (
    <AuthShell title="Check your email">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-accent">
          <MailCheck className="size-7 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to {email ? <strong className="text-foreground">{email}</strong> : 'your email'}.
          Click it to activate your account. It may take a minute — check your spam folder too.
        </p>
        {email && (
          <Button variant="outline" className="mt-6" onClick={resend} disabled={sent}>
            {sent ? 'Email sent again' : 'Resend email'}
          </Button>
        )}
        <Link to="/login" className="mt-4 text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

/* ---------------- OAuth / email-link callback ---------------- */
export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [error, setError] = useState<string | null>(params.get('error_description'));

  useEffect(() => {
    if (error) return;
    // detectSessionInUrl exchanges the ?code automatically; give it a moment.
    const timeout = setTimeout(() => {
      if (!user) setError('This link is invalid or has expired. Please sign in again.');
    }, 8000);
    return () => clearTimeout(timeout);
  }, [user, error]);

  useEffect(() => {
    if (loading || !user || !profile) return;
    const next = params.get('next');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
    navigate(profile.onboarded ? safeNext : '/onboarding', { replace: true, state: { from: safeNext } });
  }, [loading, user, profile, params, navigate]);

  if (error) {
    return (
      <AuthShell title="Sign-in problem">
        <Alert variant="error">{error}</Alert>
        <Button asChild className="mt-6 w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthShell>
    );
  }
  return <PageLoader />;
}

/* ---------------- Forgot password ---------------- */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validateEmail(email);
    if (v) return setError(v);
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) setError(friendlyAuthError(error.message));
    else setSent(true);
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to choose a new password."
      footer={<Link to="/login" className="font-semibold text-primary hover:underline">Back to sign in</Link>}
    >
      {sent ? (
        <Alert variant="success" title="Check your inbox">
          If an account exists for {email}, you'll receive a reset link shortly.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert variant="error">{error}</Alert>}
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="h-11 w-full" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

/* ---------------- Reset password (from email link) ---------------- */
export function ResetPassword() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 5000);
    return () => clearTimeout(t);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validatePassword(password);
    if (v) return setError(v);
    if (password !== confirm) return setError('Passwords do not match.');
    setError(null);
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) setError(friendlyAuthError(error.message));
    else navigate('/dashboard', { replace: true });
  }

  if (loading || (!user && !waited)) return <PageLoader />;

  if (!user) {
    return (
      <AuthShell title="Link expired">
        <Alert variant="error">This password reset link is invalid or has expired.</Alert>
        <Button asChild className="mt-6 w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert variant="error">{error}</Alert>}
        <Field label="New password" htmlFor="password" hint="At least 8 characters, with letters and numbers.">
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" className="h-11 w-full" loading={saving}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
