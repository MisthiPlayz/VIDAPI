const UPSTREAM_BASE = 'https://files.cloudfam.io';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Origin, Accept',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

async function resolveVidId(sb, name) {
    const res = await fetch(`${sb.url}/rest/v1/vidapi?name=eq.${encodeURIComponent(name)}&select=vid_id&limit=1`, {
        headers: {
            'apikey': sb.key,
            'Authorization': `Bearer ${sb.key}`,
            'Content-Type': 'application/json',
        },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0].vid_id;
}

function abort(status) {
    return new Response(null, { status });
}

function isSafeName(str) {
    return /^[a-zA-Z0-9_-]+$/.test(str);
}

function isSafeFilename(str) {
    return /^[a-zA-Z0-9_.\-]+$/.test(str);
}

function segmentFilename(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            const u = new URL(trimmed);
            return decodeURIComponent(u.pathname.split('/').pop());
        } catch { return null; }
    }
    return decodeURIComponent(trimmed.split('/').pop());
}

function rewriteM3U8(body, proxyBase) {
    return body
        .split('\n')
        .map(line => {
            const filename = segmentFilename(line);
            if (filename === null) return line;
            const normalized = filename.replace(/ /g, '_');
            return `${proxyBase}?_seg=${encodeURIComponent(normalized)}`;
        })
        .join('\n');
}

function upstreamHeaders(request) {
    const h = {};
    const range = request.headers.get('Range');
    if (range) h['Range'] = range;
    return h;
}

function responseHeaders(upRes, contentType) {
    const h = { ...CORS };
    h['Content-Type'] = contentType || upRes.headers.get('Content-Type') || 'application/octet-stream';
    const cl = upRes.headers.get('Content-Length');
    if (cl) h['Content-Length'] = cl;
    const cr = upRes.headers.get('Content-Range');
    if (cr) h['Content-Range'] = cr;
    const ar = upRes.headers.get('Accept-Ranges');
    if (ar) h['Accept-Ranges'] = ar;
    return h;
}

export async function onRequest(context) {
    const { request, env, params } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return abort(405);
    }

    let name = params.name;
    if (Array.isArray(name)) name = name[0];
    if (!name || typeof name !== 'string' || name.length > 128) return abort(400);

    const decodedName = decodeURIComponent(name).replace(/ /g, '_');
    if (!isSafeName(decodedName)) return abort(400);

    const sb = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY };
    const url = new URL(request.url);
    const segParam = url.searchParams.get('_seg');

    const vidId = await resolveVidId(sb, decodedName);
    if (!vidId) return abort(404);

    if (segParam) {
        const filename = decodeURIComponent(segParam).replace(/ /g, '_');
        if (!filename || filename.includes('/') || filename.includes('..') || !filename.endsWith('.ts') || !isSafeFilename(filename)) {
            return abort(400);
        }

        const segUrl = `${UPSTREAM_BASE}/${filename}`;
        const upRes = await fetch(segUrl, {
            method: request.method,
            headers: upstreamHeaders(request),
        });

        if (!upRes.ok && upRes.status !== 206) return abort(upRes.status);

        const ct = upRes.headers.get('Content-Type') || '';
        if (!ct.includes('video') && !ct.includes('octet-stream') && !ct.includes('mp2t')) {
            return abort(502);
        }

        return new Response(request.method === 'HEAD' ? null : upRes.body, {
            status: upRes.status,
            headers: responseHeaders(upRes, 'video/mp2t'),
        });
    }

    const m3u8Url = `${UPSTREAM_BASE}/${encodeURIComponent(vidId)}.m3u8`;
    const upRes = await fetch(m3u8Url, { headers: upstreamHeaders(request) });

    if (!upRes.ok) return abort(upRes.status);

    if (request.method === 'HEAD') {
        return new Response(null, {
            status: 200,
            headers: responseHeaders(upRes, 'application/vnd.apple.mpegurl'),
        });
    }

    const proxyBase = `${url.origin}/vid/${encodeURIComponent(decodedName)}`;
    const rawBody = await upRes.text();
    const rewritten = rewriteM3U8(rawBody, proxyBase);

    const h = responseHeaders(upRes, 'application/vnd.apple.mpegurl');
    h['Cache-Control'] = 'no-store';
    delete h['Content-Length'];

    return new Response(rewritten, { status: 200, headers: h });
}