// supabase functions deploy admin-users   (service role key is injected automatically)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), {status: s, headers: {...cors, 'Content-Type': 'application/json'}});
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: cors});
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = await admin.auth.getUser((req.headers.get('Authorization') || '').replace('Bearer ', ''));
  if (!user) return j({error: 'Not signed in'}, 401);
  const { data: me } = await admin.from('liss_profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return j({error: 'Admins only'}, 403);
  const b = await req.json();
  if (b.action === 'create') {
    const u = String(b.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{6,30}$/.test(u)) return j({error: 'Username must be 6-30 letters/numbers (it is also the password)'}, 400);
    if (!['admin', 'teacher', 'student'].includes(b.role)) return j({error: 'Bad role'}, 400);
    const { data, error } = await admin.auth.admin.createUser({email: `${u}@liss.app`, password: u, email_confirm: true});
    if (error) return j({error: error.message}, 400);
    const { error: pe } = await admin.from('liss_profiles').insert({id: data.user.id, username: u, full_name: b.full_name, role: b.role, class_name: b.class_name || null, phone: b.phone || null, guardian: b.guardian || null, gender: b.gender || null});
    if (pe) { await admin.auth.admin.deleteUser(data.user.id); return j({error: pe.message}, 400); }
    return j({ok: true});
  }
  if (b.action === 'delete') {
    if (b.id === user.id) return j({error: 'You cannot delete yourself'}, 400);
    const { error } = await admin.auth.admin.deleteUser(b.id);
    return error ? j({error: error.message}, 400) : j({ok: true});
  }
  return j({error: 'Unknown action'}, 400);
});
