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

export async function onRequestPost(context) {
    const { request, env } = context;

    const authed = await validateSession(request, env);
    if (!authed) return json({ status: 'failed', error: 'Unauthorized' }, 401);

    const sb = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY };

    try {
        const body = await request.json();
        const entries = body.entries;

        if (!Array.isArray(entries) || entries.length === 0) {
            return json({ status: 'failed', error: 'No entries provided' }, 400);
        }

        const existingRes = await sbFetch(sb, '/vidapi?select=vid_id');
        if (!existingRes.ok) return json({ status: 'failed', error: 'Database error' }, 500);

        const existingIds = new Set((existingRes.data || []).map(r => r.vid_id));
        const newEntries = [];
        const errors = [];

        for (const entry of entries) {
            if (!entry.vidId) { errors.push('VIDID is required for all entries'); continue; }
            if (!sanitize(entry.vidId)) { errors.push(`VIDID "${entry.vidId}": invalid characters`); continue; }
            if (entry.name && !sanitize(entry.name)) { errors.push(`Name "${entry.name}": invalid characters`); continue; }

            const vidId = processValue(entry.vidId);
            if (existingIds.has(vidId)) { errors.push(`VIDID "${vidId}" already exists`); continue; }

            const name = entry.name && entry.name.trim() ? processValue(entry.name) : generateRandomName();
            newEntries.push({ vid_id: vidId, name });
            existingIds.add(vidId);
        }

        if (newEntries.length === 0) {
            return json({ status: 'failed', error: 'No valid entries to add', details: errors }, 400);
        }

        const insert = await sbFetch(sb, '/vidapi', {
            method: 'POST',
            prefer: 'return=minimal',
            body: JSON.stringify(newEntries),
        });

        if (!insert.ok) return json({ status: 'failed', error: 'Insert failed' }, 500);

        return json({
            status: 'success',
            message: 'Bulk creation successful',
            addedCount: newEntries.length,
            ...(errors.length > 0 ? { errors } : {}),
        });

    } catch (err) {
        return json({ status: 'failed', error: err.message }, 500);
    }
}