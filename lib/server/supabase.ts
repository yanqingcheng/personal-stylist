import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Authentication is not configured');
  return { url, key };
}
export async function userClient() {
  const { url, key } = config();
  const jar = await cookies();
  return createServerClient(url, key, { cookies: {
    getAll: () => jar.getAll(),
    setAll: (items) => { for (const { name, value, options } of items) jar.set(name, value, options); },
  }});
}
export function serviceClient() {
  const { url } = config();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Service is not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function identity() {
  const client = await userClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return user;
}
export async function activeUser() {
  const user = await identity();
  if (!user) return null;
  const service = serviceClient();
  const { data } = await service.from('access_grants').select('cohort,active').eq('user_id', user.id).maybeSingle();
  return data?.active ? { user, service, cohort: data.cohort as string } : null;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !!origin && origin === new URL(request.url).origin;
}
export function fail(status: number, error: string) { return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } }); }
export async function body(request: Request) {
  const text = await request.text();
  if (text.length > 100_000) throw new Error('too large');
  return JSON.parse(text) as unknown;
}
