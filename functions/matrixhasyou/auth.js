async function generateToken(env) {
    const array = new Uint8Array(64);
    crypto.getRandomValues(array);
    const base = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    const ts = Date.now().toString(36);
    const noise = Math.random().toString(36).slice(2);
    const raw = `${base}${ts}${noise}`;
    const msgBuf = new TextEncoder().encode(raw);
    const keyBuf = new TextEncoder().encode(env.SUPABASE_SERVICE_KEY);
    const key = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, msgBuf);
    const sigHex = Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
    return `${base}${sigHex}`;
}

async function sbFetch(sb, path, options = {}) {
    const { prefer, ...rest } = options;
    const res = await fetch(`${sb.url}/rest/v1${path}`, {
        ...rest,
        headers: {
            'apikey': sb.key,
            'Authorization': `Bearer ${sb.key}`,
            'Content-Type': 'application/json',
            ...(prefer ? { 'Prefer': prefer } : {}),
        },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

function guardRequest(request) {
    if (request.headers.get('X-Requested-With') !== 'XMLHttpRequest') return false;
    const host = new URL(request.url).host;
    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    if (origin && new URL(origin).host !== host) return false;
    if (referer && new URL(referer).host !== host) return false;
    return true;
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!guardRequest(request)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    let body;
    try { body = await request.json(); }
    catch {
        return new Response(JSON.stringify({ error: 'Bad request' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { username, password } = body;
    if (!username || !password) {
        return new Response(JSON.stringify({ error: 'Missing credentials' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    console.log('auth attempt | expected_user_len:', String(env.ADMIN_USERNAME ?? '').length, '| got_user_len:', String(username).length, '| expected_pass_len:', String(env.ADMIN_PASSWORD ?? '').length, '| got_pass_len:', String(password).length, '| user_match:', username === env.ADMIN_USERNAME, '| pass_match:', password === env.ADMIN_PASSWORD);

    if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const sb = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY };
    const token = await generateToken(env);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const insert = await sbFetch(sb, '/vidsessions', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({ token, expires_at: expiresAt }),
    });

    if (!insert.ok) {
        return new Response(JSON.stringify({ error: 'Session creation failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ token }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}