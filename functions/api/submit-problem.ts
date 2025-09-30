const enc = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const dec = (b: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitMap = new Map<string, { count: number; start: number }>();

const JSON_HEADERS = {
  "content-type": "application/json",
  "Access-Control-Allow-Origin": "*",
} as const;

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

const getClientIp = (request: Request) =>
  request.headers.get("cf-connecting-ip") ??
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  "unknown";

const enforceRateLimit = (ip: string) => {
  const now = Date.now();
  const info = rateLimitMap.get(ip);
  if (info && now - info.start < RATE_LIMIT_WINDOW_MS) {
    if (info.count >= RATE_LIMIT_MAX) {
      throw jsonResponse(
        {
          error: "Too many requests",
          details: "Rate limit of 30 requests per minute exceeded.",
        },
        429
      );
    }
    rateLimitMap.set(ip, { ...info, count: info.count + 1 });
    return;
  }

  rateLimitMap.set(ip, { start: now, count: 1 });

  // Cleanup old entries
  for (const [key, value] of rateLimitMap) {
    if (now - value.start >= RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(key);
    }
  }
};

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { error: "Unsupported Media Type", details: "Expected application/json." },
      415
    );
  }

  const ip = getClientIp(request);
  try {
    enforceRateLimit(ip);
  } catch (err) {
    if (err instanceof Response) {
      return err;
    }
    throw err;
  }

  const GH_TOKEN = env.GH_TOKEN;
  if (!GH_TOKEN) {
    return jsonResponse({ error: "Missing GH_TOKEN" }, 500);
  }

  const owner = env.GH_OWNER;
  const repo = env.GH_REPO;
  if (!owner || !repo) {
    return jsonResponse({ error: "Missing GH_OWNER or GH_REPO" }, 500);
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
        throw jsonResponse(
          {
            error: "GitHub API error",
            status: res.status,
            body: data,
          },
          res.status
        );
      }
      return data;
    };

    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > 10 * 1024) {
      return jsonResponse(
        { error: "Payload too large", details: "Body must be less than 10KB." },
        413
      );
    }

    const rawBody = await request.text();
    if (rawBody.length > 10 * 1024) {
      return jsonResponse(
        { error: "Payload too large", details: "Body must be less than 10KB." },
        413
      );
    }

    let body: Record<string, unknown>;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return jsonResponse(
        { error: "Invalid JSON", details: "Request body must be valid JSON." },
        400
      );
    }

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

    const isMissing = (value: unknown) =>
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "");

    const requiredFields: Array<keyof typeof rowObj> = ["id", "title", "impact", "uncertainty"];
    const missing = requiredFields.filter((field) => isMissing(rowObj[field]));
    if (missing.length > 0) {
      return jsonResponse(
        {
          error: "Missing required fields",
          details: `Fields required: ${missing.join(", ")}`,
        },
        400
      );
    }

    const toNumber = (value: unknown) =>
      typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

    const impactValue = toNumber(rowObj.impact);
    if (!Number.isFinite(impactValue) || impactValue < 1 || impactValue > 5) {
      return jsonResponse(
        {
          error: "Invalid impact",
          details: "Impact must be a number between 1 and 5.",
        },
        400
      );
    }

    const uncertaintyValue = toNumber(rowObj.uncertainty);
    if (!Number.isFinite(uncertaintyValue) || uncertaintyValue < 1 || uncertaintyValue > 4) {
      return jsonResponse(
        {
          error: "Invalid uncertainty",
          details: "Uncertainty must be a number between 1 and 4.",
        },
        400
      );
    }

    rowObj.impact = impactValue;
    rowObj.uncertainty = uncertaintyValue;

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
    return jsonResponse({ ok: true, added: rowObj.id, headers });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return jsonResponse(
      { error: (error as Error).message ?? "Unknown error" },
      500
    );
  }
};
