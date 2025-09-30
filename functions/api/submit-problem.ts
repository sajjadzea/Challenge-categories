export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const GH_TOKEN = env.GH_TOKEN;
  if (!GH_TOKEN) return new Response("Missing token", { status: 500 });
  const { id, title, sector, stacey_zone, impact, uncertainty } = await request.json();
  const owner = env.GH_OWNER ?? "OWNER_REPLACE";
  const repo = env.GH_REPO ?? "REPO_REPLACE";
  const gh = async (url, init={}) => fetch(`https://api.github.com${url}`, {
    ...init, headers: { "Authorization": `Bearer ${GH_TOKEN}`, "Accept": "application/vnd.github+json" }
  });
  const mainRef = await (await gh(`/repos/${owner}/${repo}/git/refs/heads/main`)).json();
  const branch = `add-problem-${id}`;
  await gh(`/repos/${owner}/${repo}/git/refs`, { method:"POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainRef.object.sha }) });
  const file = await (await gh(`/repos/${owner}/${repo}/contents/data/problems.csv?ref=${branch}`)).json();
  const csv = atob(file.content);
  const line = `\n${id},${title},${sector},${stacey_zone},${impact},${uncertainty},,,open,edge`;
  const updated = btoa(csv + line);
  await gh(`/repos/${owner}/${repo}/contents/data/problems.csv`, { method:"PUT",
    body: JSON.stringify({ message:`feat(data): add problem ${id}`, content: updated, sha: file.sha, branch })});
  await gh(`/repos/${owner}/${repo}/pulls`, { method:"POST",
    body: JSON.stringify({ title:`add problem ${id}`, head: branch, base: "main" }) });
  return new Response(JSON.stringify({ ok:true }), { headers:{ "content-type":"application/json" } });
};
