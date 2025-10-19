// _functions/api/files/[...path].js
// Catch-all handler: GET, PUT, OPTIONS for /api/files/*
// Uses GitHub repo: Volcar144/StaticHosting (hardcoded per request).
// Environment variables required:
//   GH_TOKEN   -> GitHub Personal Access Token (repo:contents) for writes
//   GH_BRANCH  -> branch to use (optional, defaults to "main")
//   UPLOAD_KEY -> secret that clients must use in Authorization header for PUT

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const owner = "Volcar144";
  const repo = "StaticHosting";
  const branch = "maven";

  // Build path from catch-all params
  const path = (context.params.path || []).join("/"); // "releases/com/example/mylib/1.0.0/file.jar"

  // CORS headers
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // GET: directory listing or file content
  if (method === "GET") {
    // GitHub contents API url
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path || ""}?ref=${branch}`;

    const ghRes = await fetch(apiUrl, {
      headers: {
        "User-Agent": "cf-files-proxy",
        // If repo public, GH_TOKEN not required for GET; if private, env.GH_TOKEN must be set
        ...(env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : {}),
      },
    });

    if (!ghRes.ok) {
      // forward status and body
    //  const txt = await ghRes.text();
    //  return new Response(txt || `GitHub returned ${ghRes.status}`, {
    //    status: ghRes.status,
    //    headers: CORS,
        return new Response(`${path} and ${branch} https://api.github.com/repos/${owner}/${repo}/contents/${path || ""}?ref=${branch} `)
      });
    }

    const json = await ghRes.json();

    // Directory listing (array) -> return JSON (browse UI can consume)
    if (Array.isArray(json)) {
      return new Response(JSON.stringify(json, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // File -> decode base64 and return binary
    if (json && json.content) {
      const b64 = json.content.replace(/\n/g, "");
      // decode base64 to Uint8Array
      const raw = atob(b64);
      const u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; ++i) u8[i] = raw.charCodeAt(i);

      // Try to map filename to a sensible content-type
      const name = json.name || "";
      const contentType =
        name.endsWith(".html") ? "text/html" :
        name.endsWith(".json") ? "application/json" :
        name.endsWith(".xml")  ? "application/xml" :
        name.endsWith(".jar")  ? "application/java-archive" :
        name.endsWith(".pom")  ? "application/xml" :
        "application/octet-stream";

      return new Response(u8, {
        status: 200,
        headers: { "Content-Type": contentType, ...CORS },
      });
    }

    // Unexpected
    return new Response("Unexpected GitHub response", {
      status: 500,
      headers: CORS,
    });
  }

  // PUT: upload/commit file to GitHub
  if (method === "PUT") {
    // simple upload auth: require a shared upload key
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env.UPLOAD_KEY}`) {
      return new Response("Unauthorized", { status: 401, headers: CORS });
    }

    // require GH_TOKEN to perform the commit
    if (!env.GH_TOKEN) {
      return new Response("Server misconfigured: GH_TOKEN not set", { status: 500, headers: CORS });
    }

    // read request body as binary and base64-encode
    const ab = await request.arrayBuffer();
    const u8 = new Uint8Array(ab);
    // base64 encode (works for moderate sizes)
    let binary = "";
    for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
    const b64 = btoa(binary);

    // Check if file exists to get sha (required for updates)
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
      // if 404, it's new — continue
    } catch (e) {
      // ignore and continue
    }

    // Build commit payload
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

    return new Response(`Committed ${path || "(root)"}`, {
      status: 200,
      headers: CORS,
    });
  }

  // Method not allowed
  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}
