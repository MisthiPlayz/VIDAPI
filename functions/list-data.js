import { validateSession } from './_auth-shared.js';

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

export async function onRequestGet(context) {
    const { request, env } = context;

    const authed = await validateSession(request, env);
    if (!authed) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const sb = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY };

    try {
        const res = await sbFetch(sb, '/vidapi?select=vid_id,name&order=vid_id.asc');
        if (!res.ok) {
            return new Response(JSON.stringify([]), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        const data = (res.data || []).map(r => ({ vidId: r.vid_id, name: r.name }));
        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
            },
        });
    } catch {
        return new Response(JSON.stringify([]), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}