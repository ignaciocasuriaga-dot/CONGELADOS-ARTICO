// POST /api/refresh - triggers the GitHub Actions scrape workflow.
// Reads GITHUB_TOKEN and GITHUB_REPO from Vercel environment variables.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO;
  if (!token || !repo) {
    return res.status(501).json({ ok: false, error: 'not_configured' });
  }

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/scrape.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    );

    if (resp.status === 204) {
      return res.status(200).json({ ok: true });
    }
    const body = await resp.text();
    return res.status(resp.status).json({ ok: false, error: `GitHub ${resp.status}`, detail: body });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
