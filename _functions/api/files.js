export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  let path = new URL(request.url).pathname.replace(/^\/api\/files\//, "");

  // Auto-route snapshots to /snapshots/ and others to /releases/
  const targetBase = path.includes("-SNAPSHOT") ? "snapshots" : "releases";
  path = `${targetBase}/${path}`;

  switch (method) {
    case "GET":
      return handleGet(path, env);
    case "PUT":
      return handlePut(path, request, env);
    case "OPTIONS":
      return new Response(null, { status: 204, headers: corsHeaders() });
    default:
      return new Response("Method Not Allowed", { status: 405 });
  }
}

// ------------------
// GET handler
// ------------------
async function handleGet(path, env) {
  const ghUrl = `https://raw.githubusercontent.com/${env.GH_REPO}/${env.GH_BRANCH}/${path}`;
  const res = await fetch(ghUrl, {
    headers: {
      "User-Agent": "cf-gh-proxy",
      ...(env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : {}),
    },
  });

  if (!res.ok) {
    return new Response(`File not found: ${path}`, {
      status: res.status,
      headers: corsHeaders(),
    });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
      "Cache-Control": "public, max-age=60",
    },
  });
}

// ------------------
// PUT handler
// ------------------
async function handlePut(path, request, env) {
  // Basic auth for uploads
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${env.UPLOAD_KEY}`) {
    return new Response("Unauthorized", { status: 403, headers: corsHeaders() });
  }

  // Read body and encode for GitHub API
  const body = await request.arrayBuffer();
  const content = btoa(String.fromCharCode(...new Uint8Array(body)));

  // Check if file exists for SHA
  const getUrl = `https://api.github.com/repos/${env.GH_REPO}/contents/${path}?ref=${env.GH_BRANCH}`;
  const getRes = await fetch(getUrl, {
    headers: {
      "Authorization": `Bearer ${env.GH_TOKEN}`,
      "User-Agent": "cf-gh-proxy",
    },
  });

  let sha = undefined;
  if (getRes.ok) {
    const existing = await getRes.json();
    sha = existing.sha;
  }

  const payload = {
    message: `Upload ${path}`,
    content,
    branch: env.GH_BRANCH,
    ...(sha ? { sha } : {}),
  };

  const putUrl = `https://api.github.com/repos/${env.GH_REPO}/contents/${path}`;
  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${env.GH_TOKEN}`,
      "User-Agent": "cf-gh-proxy",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!putRes.ok) {
    const error = await putRes.text();
    return new Response(`GitHub API error: ${error}`, {
      status: putRes.status,
      headers: corsHeaders(),
    });
  }

  return new Response(`Committed ${path}`, {
    status: 200,
    headers: corsHeaders(),
  });
}

// ------------------
// Utility: CORS headers
// ------------------
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
