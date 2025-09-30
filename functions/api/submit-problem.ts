const enc = (input: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(input)));

const dec = (encoded: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const GH_TOKEN = env.GH_TOKEN;
  if (!GH_TOKEN) {
    return new Response(JSON.stringify({ error: "Missing GH_TOKEN" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const owner = env.GH_OWNER;
  const repo = env.GH_REPO;
  if (!owner || !repo) {
    return new Response(JSON.stringify({ error: "Missing GH_OWNER or GH_REPO" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const { id, title, sector, stacey_zone, impact, uncertainty } = await request.json();
  const gh = async (url, init: RequestInit = {}) =>
    fetch(`https://api.github.com${url}`, {
      ...init,
      headers: {
        "Authorization": `Bearer ${GH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        ...(init.headers ?? {}),
      },
    });
  const mainRef = await (await gh(`/repos/${owner}/${repo}/git/refs/heads/main`)).json();
  const branch = `add-problem-${id}`;
  await gh(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainRef.object.sha }),
  }).catch(() => {});
  const file = await (await gh(`/repos/${owner}/${repo}/contents/data/problems.csv?ref=${branch}`)).json();
  const csv = dec(file.content);
  const line = `\n${id},${title},${sector},${stacey_zone},${impact},${uncertainty},,,open,edge`;
  const updated = enc(csv + line);
  await gh(`/repos/${owner}/${repo}/contents/data/problems.csv`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: `feat(data): add problem ${id}`, content: updated, sha: file.sha, branch }),
  });
  await gh(`/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: `add problem ${id}`, head: branch, base: "main" }),
  });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
};
