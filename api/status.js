// GET /api/status - returns the latest GitHub Actions scrape workflow status.

export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    return res.status(500).json({
      ok: false,
      error: 'Missing GITHUB_TOKEN or GITHUB_REPO in Vercel',
    });
  }

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/scrape.yml/runs?per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!resp.ok) {
      const body = await resp.text();
      return res.status(resp.status).json({
        ok: false,
        error: `GitHub returned ${resp.status}`,
        detail: body,
      });
    }

    const data = await resp.json();
    const run = data.workflow_runs?.[0];
    res.setHeader('Cache-Control', 'no-store');
    if (!run) return res.status(200).json({ ok: true, status: 'idle', message: 'No scrape workflow has run yet' });

    return res.status(200).json({
      ok: true,
      status: run.status,
      conclusion: run.conclusion,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      url: run.html_url,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
