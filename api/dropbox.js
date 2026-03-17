// api/dropbox.js
// Proxy para Dropbox - token fica no servidor

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
  if (!DROPBOX_TOKEN) return res.status(500).json({ error: 'Dropbox token not configured' });

  const { action, url, path, fileName } = req.body;

  try {
    if (action === 'list') {
      // List files in shared folder
      const r = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: '', shared_link: { url }, recursive: false })
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: e?.error_summary || `Dropbox error ${r.status}` });
      }
      const data = await r.json();
      const exts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];
      const files = (data.entries || []).filter(e =>
        e['.tag'] === 'file' && exts.some(x => e.name.toLowerCase().endsWith(x))
      );
      return res.status(200).json({ files });

    } else if (action === 'download') {
      // Download a specific file
      const r = await fetch('https://content.dropboxapi.com/2/sharing/get_shared_link_file', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_TOKEN}`,
          'Dropbox-API-Arg': JSON.stringify({ url, path: '/' + fileName })
        }
      });
      if (!r.ok) return res.status(r.status).json({ error: `Download error ${r.status}` });

      const buffer = await r.arrayBuffer();
      const b64 = Buffer.from(buffer).toString('base64');
      const contentType = r.headers.get('content-type') || 'image/jpeg';
      return res.status(200).json({ b64, mimeType: contentType !== 'application/octet-stream' ? contentType : guessMime(fileName) });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function guessMime(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff' }[ext] || 'image/jpeg';
}
