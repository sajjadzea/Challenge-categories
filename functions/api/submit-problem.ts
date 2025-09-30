const enc = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const dec = (b: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));

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

  try {
    const gh = async (url: string, init: RequestInit = {}) => {
      const res = await fetch(`https://api.github.com${url}`, {
        ...init,
        headers: {
          "Authorization": `Bearer ${GH_TOKEN}`,
          "Accept": "application/vnd.github+json",
          ...(init.headers ?? {}),
        },
      });
      const text = await res.text();
      let data: unknown = text;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (err) {
        data = text;
      }
      if (!res.ok) {
        throw new Response(
          JSON.stringify({
            error: "GitHub API error",
            status: res.status,
            body: data,
          }),
          { status: res.status, headers: { "content-type": "application/json" } }
        );
      }
      return data;
    };

    const body = await request.json();
    const defaults: any = {
      id: "",
      title: "",
      sector: "",
      stacey_zone: "",
      impact: "",
      uncertainty: "",
      controllability: "",
      owner: "",
      horizon: "",
      status: "open",
      notes: "",
    };
    const rowObj = { ...defaults, ...body };

    const mainRef: any = await gh(`/repos/${owner}/${repo}/git/refs/heads/main`);
    const branch = `add-problem-${rowObj.id || Date.now()}`;
    await gh(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainRef.object.sha }),
    }).catch(() => {});
    const file: any = await gh(
      `/repos/${owner}/${repo}/contents/data/problems.csv?ref=${branch}`
    );
    const csv = dec(file.content);
    const [headerLine, ...rows] = csv.split(/\r?\n/);
    void rows;
    const headers = headerLine.split(",");
    const newLine = "\n" + headers.map((h) => rowObj[h] ?? "").join(",");
    const updated = enc(csv + newLine);

    await gh(`/repos/${owner}/${repo}/contents/data/problems.csv`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: `feat(data): add problem ${rowObj.id}`,
        content: updated,
        sha: file.sha,
        branch,
      }),
    });
    await gh(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `add problem ${rowObj.id}`, head: branch, base: "main" }),
    });
    return new Response(
      JSON.stringify({ ok: true, added: rowObj.id, headers }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? "Unknown error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
