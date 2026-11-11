import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyAuthError, signInWithGoogle } from '@/lib/auth';
import { AuthShell, Divider, GoogleButton } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';

export default function Login() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResent(false);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) setError(friendlyAuthError(error.message));
    // On success, <GuestOnly> redirects automatically once the session arrives.
  }

  async function resend() {
    await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setResent(true);
  }

  async function google() {
    setGoogleLoading(true);
    const { error } = await signInWithGoogle(from);
    if (error) {
      setGoogleLoading(false);
      setError(friendlyAuthError(error.message));
    }
  }

  const notConfirmed = error?.startsWith('Please confirm your email');

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your listings and messages."
      footer={
        <>
          New to AutoPromo?{' '}
          <Link to="/signup" state={{ from }} className="font-semibold text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <GoogleButton onClick={google} loading={googleLoading} />
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert variant="error">
            {error}
            {notConfirmed && !resent && (
              <button type="button" onClick={resend} className="ml-1 font-semibold underline">
                Resend email
              </button>
            )}
          </Alert>
        )}
        {resent && <Alert variant="success">Verification email sent. Check your inbox.</Alert>}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="h-11 w-full" loading={loading}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
