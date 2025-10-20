// _functions/api/files/[[path]].js
// Supports GET, PUT, OPTIONS for /api/files/*
// Uses hardcoded repo: Volcar144/StaticHosting on branch "maven"

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const owner = "Volcar144";
  const repo = "StaticHosting";
  const branch = "maven";
  const path = (context.params.path || []).join("/");

  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // OPTIONS: preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // GET: read file or directory
  if (method === "GET") {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path || ""}?ref=${branch}`;

    const ghRes = await fetch(apiUrl, {
      headers: {
        "User-Agent": "cf-files-proxy",
        ...(env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : {}),
      },
    });

    if (!ghRes.ok) {
      return new Response(
        `${path} (branch ${branch}) -> GitHub ${ghRes.status}`,
        { status: ghRes.status, headers: CORS }
      );
    }

    const json = await ghRes.json();

    // directory
    if (Array.isArray(json)) {
      return new Response(JSON.stringify(json, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // file
    if (json && json.content) {
      const b64 = json.content.replace(/\n/g, "");
      const raw = atob(b64);
      const u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; ++i) u8[i] = raw.charCodeAt(i);

      const name = json.name || "";
      const contentType =
        name.endsWith(".html") ? "text/html" :
        name.endsWith(".json") ? "application/json" :
        name.endsWith(".xml")  ? "application/xml" :
        name.endsWith(".jar")  ? "application/java-archive" :
        name.endsWith(".pom")  ? "application/xml" :
        "application/octet-stream";

      return new Response(u8, { status: 200, headers: { "Content-Type": contentType, ...CORS } });
    }

    return new Response("Unexpected GitHub response", { status: 500, headers: CORS });
  }

  // PUT: upload or update file
  if (method === "PUT") {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env.UPLOAD_KEY}`) {
      return new Response("Unauthorized", { status: 401, headers: CORS });
    }

    if (!env.GH_TOKEN) {
      return new Response("Server misconfigured: GH_TOKEN not set", { status: 500, headers: CORS });
    }

    const ab = await request.arrayBuffer();
    const u8 = new Uint8Array(ab);
    let binary = "";
    for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
    const b64 = btoa(binary);

    // get existing SHA (if file exists)
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    let sha;
    try {
      const getRes = await fetch(getUrl, {
        headers: {
          "User-Agent": "cf-files-proxy",
          Authorization: `Bearer ${env.GH_TOKEN}`,
        },
      });
      if (getRes.ok) {
        const existing = await getRes.json();
        if (existing && existing.sha) sha = existing.sha;
      }
    } catch (_) {}

    const payload = {
      message: `Upload via CF: ${path || "(root)"}`,
      content: b64,
      branch,
      ...(sha ? { sha } : {}),
    };

    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers: {
        "User-Agent": "cf-files-proxy",
        Authorization: `Bearer ${env.GH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const respText = await putRes.text();
    if (!putRes.ok) {
      return new Response(`GitHub error: ${putRes.status} - ${respText}`, {
        status: putRes.status,
        headers: CORS,
      });
    }

    return new Response(`Committed ${path || "(root)"}`, { status: 200, headers: CORS });
  }

  // fallback
  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}
