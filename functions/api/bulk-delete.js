import { validateSession } from '../_auth-shared.js';

const HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'same-origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token, X-Requested-With',
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: HEADERS });
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

export async function onRequestPost(context) {
    const { request, env } = context;

    const authed = await validateSession(request, env);
    if (!authed) return json({ status: 'failed', error: 'Unauthorized' }, 401);

    const sb = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY };

    try {
        const body = await request.json();
        const vidIds = body.vidIds;

        if (!Array.isArray(vidIds) || vidIds.length === 0) {
            return json({ status: 'failed', error: 'No VIDIDs provided' }, 400);
        }

        const inFilter = vidIds.map(id => encodeURIComponent(id)).join(',');
        const del = await sbFetch(sb, `/vidapi?vid_id=in.(${inFilter})`, {
            method: 'DELETE',
            prefer: 'return=representation',
        });

        if (!del.ok) return json({ status: 'failed', error: 'Delete failed' }, 500);

        const removedCount = Array.isArray(del.data) ? del.data.length : 0;
        if (removedCount === 0) return json({ status: 'failed', error: 'No matching entries found' }, 404);

        return json({ status: 'success', message: 'Bulk deletion successful', removedCount });

    } catch (err) {
        return json({ status: 'failed', error: err.message }, 500);
    }
}