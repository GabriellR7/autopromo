import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { friendlyAuthError, signInWithGoogle, validateEmail, validatePassword } from '@/lib/auth';
import { AuthShell, Divider, GoogleButton } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Alert, Checkbox } from '@/components/ui/misc';

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next = {
      name: name.trim().length < 2 ? 'Enter your full name.' : null,
      email: validateEmail(email),
      password: validatePassword(password),
      terms: terms ? null : 'You must accept the Terms of Service and Privacy Policy.',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim(), accepted_terms: 'true' },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(from ?? '/onboarding')}`,
      },
    });
    setLoading(false);

    if (error) {
      setFormError(friendlyAuthError(error.message));
      return;
    }
    // Supabase returns a user with no identities when the email already exists
    // (to avoid leaking which emails are registered).
    if (data.user && data.user.identities?.length === 0) {
      setFormError('An account with this email already exists. Try signing in instead.');
      return;
    }
    if (!data.session) {
      navigate('/check-email', { replace: true, state: { email: email.trim() } });
    }
    // If email confirmation is disabled, a session exists and <GuestOnly> redirects to onboarding.
  }

  async function google() {
    setGoogleLoading(true);
    const { error } = await signInWithGoogle(from ?? '/onboarding');
    if (error) {
      setGoogleLoading(false);
      setFormError(friendlyAuthError(error.message));
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Sell your car faster or earn commissions as a promoter. It's free."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={{ from }} className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton onClick={google} loading={googleLoading} label="Sign up with Google" />
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}
        <Field label="Full name" htmlFor="name" error={errors.name}>
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters, with letters and numbers.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div>
          <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <Checkbox checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>
              I agree to the{' '}
              <Link to="/terms" target="_blank" className="font-medium text-primary hover:underline">Terms of Service</Link> and{' '}
              <Link to="/privacy" target="_blank" className="font-medium text-primary hover:underline">Privacy Policy</Link>.
            </span>
          </label>
          {errors.terms && <p className="mt-1.5 text-xs font-medium text-destructive">{errors.terms}</p>}
        </div>
        <Button type="submit" className="h-11 w-full" loading={loading}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
