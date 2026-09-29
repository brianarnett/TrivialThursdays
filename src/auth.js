// Cloudflare Access JWT verification for /admin.
// Access puts a signed JWT in the Cf-Access-Jwt-Assertion header on every request it lets through.
// We verify signature (RS256 against the team's JWKS), audience, issuer and expiry, so the admin
// is safe even if someone reaches the workers.dev URL directly and bypasses the Access-protected hostname.

let jwksCache = { team: '', keys: null, fetchedAt: 0 };

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKeys(team) {
  const fresh = Date.now() - jwksCache.fetchedAt < 60 * 60 * 1000;
  if (jwksCache.team === team && jwksCache.keys && fresh) return jwksCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = await res.json();
  jwksCache = { team, keys, fetchedAt: Date.now() };
  return keys;
}

/** Returns { email } for a verified Access user, or { error } explaining why not. */
export async function verifyAccess(request, env) {
  const team = (env.ACCESS_TEAM_DOMAIN || '').trim();
  const aud = (env.ACCESS_AUD || '').trim();

  // Local development only: `wrangler dev` with DEV_ADMIN_BYPASS=true in .dev.vars
  if (!team || !aud) {
    if (env.DEV_ADMIN_BYPASS === 'true') return { email: 'dev@localhost' };
    return { error: 'Admin is locked: ACCESS_TEAM_DOMAIN and ACCESS_AUD are not configured.' };
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { error: 'Sign in through Cloudflare Access to use the admin.' };

  try {
    const [h, p, sig] = token.split('.');
    const header = b64urlJson(h);
    const payload = b64urlJson(p);
    if (header.alg !== 'RS256') return { error: 'Unexpected token algorithm.' };

    const keys = await getKeys(team);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return { error: 'Signing key not found.' };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return { error: 'Invalid token signature.' };

    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return { error: 'Token audience mismatch.' };
    if (payload.iss !== `https://${team}`) return { error: 'Token issuer mismatch.' };
    if (payload.exp && payload.exp < now) return { error: 'Session expired — sign in again.' };
    if (payload.nbf && payload.nbf > now + 60) return { error: 'Token not yet valid.' };

    return { email: payload.email || payload.sub || 'unknown' };
  } catch (e) {
    return { error: 'Could not verify sign-in.' };
  }
}
