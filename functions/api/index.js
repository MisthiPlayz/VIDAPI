import { validateSession } from '../_auth-shared.js';

const HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'same-origin',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token, X-Requested-With',
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function generateRandomName() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}

function sanitize(val) {
    return /^[a-zA-Z0-9_ ]+$/.test(val);
}

function processValue(val) {
    return val.trim().replace(/ /g, '_');
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

export async function onRequestOptions() {
    return new Response(null, { headers: HEADERS });
}

export async function onRequestGet(context) {
    const { request, env } = context;

    const authed = await validateSession(request, env);
    if (!authed) return json({ status: 'failed', error: 'Unauthorized' }, 401);

    const params = new URL(request.url).searchParams;
    const sb = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY };

    try {
        if (params.has('create')) {
            let vidId = params.get('VIDID') || '';
            let name = params.get('NAME') || '';

            if (!vidId) return json({ status: 'failed', error: 'VIDID is required' }, 400);
            if (!sanitize(vidId)) return json({ status: 'failed', error: 'VIDID: only letters, numbers, spaces and underscores allowed' }, 400);
            if (name && !sanitize(name)) return json({ status: 'failed', error: 'Name: only letters, numbers, spaces and underscores allowed' }, 400);

            vidId = processValue(vidId);
            name = name.trim() ? processValue(name) : generateRandomName();

            const check = await sbFetch(sb, `/vidapi?vid_id=eq.${encodeURIComponent(vidId)}&select=vid_id`);
            if (!check.ok) return json({ status: 'failed', error: 'Database error' }, 500);
            if (check.data && check.data.length > 0) return json({ status: 'failed', error: 'VIDID already exists', vidId, name }, 409);

            const insert = await sbFetch(sb, '/vidapi', {
                method: 'POST',
                prefer: 'return=representation',
                body: JSON.stringify({ vid_id: vidId, name }),
            });

            if (!insert.ok) return json({ status: 'failed', error: 'Insert failed' }, 500);
            return json({ status: 'success', message: 'Entry created', data: { vidId, name } });

        } else if (params.has('del')) {
            const delVid = params.get('VIDID') || '';
            const delName = params.get('NAME') || '';

            if (!delVid && !delName) return json({ status: 'failed', error: 'Provide VIDID or NAME to delete' }, 400);

            const path = delVid
                ? `/vidapi?vid_id=eq.${encodeURIComponent(delVid)}`
                : `/vidapi?name=eq.${encodeURIComponent(delName)}`;

            const del = await sbFetch(sb, path, { method: 'DELETE', prefer: 'return=representation' });
            if (!del.ok) return json({ status: 'failed', error: 'Delete failed' }, 500);
            if (!del.data || del.data.length === 0) return json({ status: 'failed', error: 'Entry not found' }, 404);
            return json({ status: 'success', message: 'Entry deleted', removedCount: del.data.length });

        } else if (params.has('list')) {
            const list = await sbFetch(sb, '/vidapi?select=vid_id,name&order=vid_id.asc');
            if (!list.ok) return json({ status: 'failed', error: 'Database error' }, 500);
            const data = (list.data || []).map(r => ({ vidId: r.vid_id, name: r.name }));
            return json({ status: 'success', data });
        }

        return json({ status: 'failed', error: 'Unknown command' }, 400);

    } catch (err) {
        return json({ status: 'failed', error: err.message }, 500);
    }
}