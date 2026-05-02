const STATIC_EXTS = /\.(js|css|ico|png|jpg|jpeg|svg|webp|woff|woff2|ttf|otf|map)$/i;

const PING_PONG = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Ping-Pong</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#000;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh}h1{font-size:2rem;letter-spacing:.2em}</style></head><body><h1>Ping-Pong</h1></body></html>';

export async function onRequest(context) {
    const path = new URL(context.request.url).pathname;

    if (
        path.startsWith('/matrixhasyou/') ||
        path.startsWith('/vid/') ||
        path.startsWith('/api/') ||
        path === '/list-data' ||
        path === '/list-data/' ||
        STATIC_EXTS.test(path)
    ) {
        return context.next();
    }

    return new Response(PING_PONG, {
        status: 200,
        headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
    });
}