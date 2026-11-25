const EDITIONS = [
  { id: 'v1-obsidian', name: 'NEXUS V1 Obsidian', packageName: 'nexus-v1-obsidian' },
  { id: 'v2-cockpit', name: 'NEXUS V2 Cockpit', packageName: 'nexus-v2-cockpit' },
  { id: 'v3-spatial', name: 'NEXUS V3 Spatial', packageName: 'nexus-v3-spatial' },
  { id: 'v4-minimal', name: 'NEXUS V4 Minimal', packageName: 'nexus-v4-minimal' },
  { id: 'v5-command', name: 'NEXUS V5 Command', packageName: 'nexus-v5-command' },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const owner = env.GITHUB_OWNER || 'NiranX-Resolute';
    const repo = env.GITHUB_REPO || 'NEXUS-OS';
    const defaultTag = env.DEFAULT_RELEASE_TAG || 'v5.1.0-editions';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        },
      });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json(
        {
          service: 'nexus-releases',
          status: 'online',
          github_repo: `${owner}/${repo}`,
          release_tag: defaultTag,
          r2_bound: Boolean(env.BUCKET),
          r2_status: env.BUCKET ? 'active' : env.R2_STATUS || 'not-bound',
          editions: EDITIONS,
          usage: `GET /${defaultTag}/<artifact-filename>`,
        },
        {
          headers: { 'Access-Control-Allow-Origin': '*' },
        }
      );
    }

    const parts = url.pathname.replace(/^\/+/, '').split('/');
    if (parts.length < 2) {
      return Response.json({ error: 'Specify /<tag>/<filename>' }, { status: 400 });
    }

    const tag = decodeURIComponent(parts[0]);
    const filename = parts.slice(1).map((seg) => decodeURIComponent(seg)).join('/');
    if (!tag || !filename || filename.includes('..')) {
      return Response.json({ error: 'Invalid release path' }, { status: 400 });
    }

    const r2Key = `${tag}/${filename}`;
    if (env.BUCKET) {
      const obj = await env.BUCKET.get(r2Key);
      if (obj) {
        const headers = new Headers();
        obj.writeHttpMetadata(headers);
        headers.set('etag', obj.httpEtag);
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(obj.body, { headers });
      }
    }

    const ghAssetUrl = `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`;
    return Response.redirect(ghAssetUrl, 302);
  },
};
