// Identity: Cloudflare Access JWT (who you are). Authorization: users table roles (what you may do).

let jwksCache = { team: '', keys: null, fetchedAt: 0 };

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKeys(team) {
  if (jwksCache.team === team && jwksCache.keys && Date.now() - jwksCache.fetchedAt < 3600_000) return jwksCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = await res.json();
  jwksCache = { team, keys, fetchedAt: Date.now() };
  return keys;
}

/** Returns { email } for a verified Access user, or { error }. */
export async function verifyAccess(request, env) {
  const team = (env.ACCESS_TEAM_DOMAIN || '').trim();
  const aud = (env.ACCESS_AUD || '').trim();
  if (!team || !aud) {
    // Local development only: `wrangler dev` with DEV_ADMIN_BYPASS=true in .dev.vars.
    // DEV_AS lets you test other roles locally, e.g. DEV_AS=producer@example.com
    if (env.DEV_ADMIN_BYPASS === 'true') return { email: (request.headers.get('x-dev-as') || env.DEV_AS || 'owner@dev.local').toLowerCase() };
    return { error: 'Admin is locked: ACCESS_TEAM_DOMAIN and ACCESS_AUD are not configured.' };
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { error: 'Sign in through Cloudflare Access to use the admin.' };
  try {
    const [h, p, sig] = token.split('.');
    const header = b64urlJson(h);
    const payload = b64urlJson(p);
    if (header.alg !== 'RS256') return { error: 'Unexpected token algorithm.' };
    const jwk = (await getKeys(team)).find((k) => k.kid === header.kid);
    if (!jwk) return { error: 'Signing key not found.' };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return { error: 'Invalid token signature.' };
    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return { error: 'Token audience mismatch.' };
    if (payload.iss !== `https://${team}`) return { error: 'Token issuer mismatch.' };
    if (payload.exp && payload.exp < now) return { error: 'Session expired. Sign in again.' };
    if (payload.nbf && payload.nbf > now + 60) return { error: 'Token not yet valid.' };
    if (!payload.email) return { error: 'This sign-in has no email address.' };
    return { email: String(payload.email).toLowerCase() };
  } catch {
    return { error: 'Could not verify sign-in.' };
  }
}

export const ROLES = ['owner', 'producer', 'viewer'];
export const ROLE_LABEL = { owner: 'Owner', producer: 'Producer', viewer: 'Viewer' };

const PERMS = {
  view: ['owner', 'producer', 'viewer'],
  edit: ['owner', 'producer'], // review content, build layouts
  send: ['owner', 'producer'], // send schedules
  admin: ['owner'], // settings, people
};
export const can = (user, perm) => !!user && PERMS[perm].includes(user.role);

/**
 * Resolve the signed-in admin user. The OWNER_EMAIL env var bootstraps the first owner;
 * everyone else must be added on the People page. In local dev, owner@dev.local is an owner.
 */
export async function resolveUser(request, env) {
  const id = await verifyAccess(request, env);
  if (id.error) return id;
  const email = id.email;
  const bootstrap = (env.OWNER_EMAIL || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (email === 'owner@dev.local' && env.DEV_ADMIN_BYPASS === 'true') bootstrap.push(email);

  let user = await env.DB.prepare('SELECT email, name, role, active FROM users WHERE email = ?1').bind(email).first();
  if (!user && bootstrap.includes(email)) {
    await env.DB.prepare("INSERT OR IGNORE INTO users (email, role, created_by) VALUES (?1, 'owner', 'bootstrap')").bind(email).run();
    user = { email, name: '', role: 'owner', active: 1 };
  }
  if (!user || !user.active) return { error: `${email} doesn't have admin access. Ask the show's owner to add you on the People page.` };
  return { user };
}
