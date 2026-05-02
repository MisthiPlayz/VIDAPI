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

    if (!guardRequest(request)) return new Response(null, { status: 403 });

    const token = request.headers.get('X-Session-Token');
    if (!token || token.length < 64) return new Response(null, { status: 401 });

    const sb = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY };
    const res = await sbFetch(sb, `/vidsessions?token=eq.${encodeURIComponent(token)}&select=expires_at&limit=1`);

    if (!res.ok || !res.data || res.data.length === 0) return new Response(null, { status: 401 });

    const expires = new Date(res.data[0].expires_at);
    if (expires < new Date()) {
        await sbFetch(sb, `/vidsessions?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' });
        return new Response(null, { status: 401 });
    }

    return new Response(null, { status: 200 });
}