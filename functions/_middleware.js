const CANONICAL_HOST = 'prymelabs.net'

const REDIRECT_HOSTS = new Set([
  'prymelabs.cc',
  'www.prymelabs.cc',
  'prymelabs.app',
  'www.prymelabs.app',
  'prymelabs.store',
  'www.prymelabs.store',
  'www.prymelabs.net',
])

const STALE_ENTRYPOINTS = new Set([
  '/assets/index-CihNn1gD.js',
  '/assets/index-Cyxcjnnt.js',
])

export function onRequest({ request, next }) {
  const url = new URL(request.url)
  const host = url.hostname.toLowerCase()

  if (REDIRECT_HOSTS.has(host)) {
    url.protocol = 'https:'
    url.hostname = CANONICAL_HOST
    url.port = ''
    return Response.redirect(url.toString(), 301)
  }

  if (STALE_ENTRYPOINTS.has(url.pathname)) {
    return new Response("import '/assets/stale-entry-refresh.js'\n", {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/javascript; charset=utf-8',
      },
    })
  }

  return next()
}
