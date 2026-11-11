import { supabase } from './supabase';

export async function signInWithGoogle(redirectPath = '/dashboard') {
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`;
  return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
}

/** Turns Supabase auth errors into friendly English messages. */
export function friendlyAuthError(message: string | undefined | null): string {
  if (!message) return 'Something went wrong. Please try again.';
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for the verification link.';
  if (m.includes('user already registered')) return 'An account with this email already exists. Try signing in instead.';
  if (m.includes('password should be at least')) return 'Your password must be at least 8 characters.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('failed to fetch')) return 'Could not reach the server. Check your connection.';
  return message;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.';
  return null;
}

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Enter a valid email address.';
}
