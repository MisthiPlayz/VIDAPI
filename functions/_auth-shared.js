export async function validateSession(request, env) {
    if (request.headers.get('X-Requested-With') !== 'XMLHttpRequest') return false;

    const host = new URL(request.url).host;
    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    if (origin && new URL(origin).host !== host) return false;
    if (referer && new URL(referer).host !== host) return false;

    const token = request.headers.get('X-Session-Token');
    if (!token || token.length < 64) return false;

    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/vidsessions?token=eq.${encodeURIComponent(token)}&select=expires_at&limit=1`,
        {
            headers: {
                'apikey': env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
            },
        }
    );

    if (!res.ok) return false;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return false;
    return new Date(data[0].expires_at) >= new Date();
}