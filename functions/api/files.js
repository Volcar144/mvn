import { Octokit } from "@octokit/core";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/files\/?/, "");

  // Initialize Octokit with your GitHub token
  const octokit = new Octokit({ auth: env.GH_TOKEN });

  // Determine request method
  const method = request.method.toUpperCase();

  // Preflight CORS
  if (method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders(),
    });
  }

  // ✅ Handle GET — read file contents
  if (method === "GET") {
    try {
      const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner: env.GH_REPO.split("/")[0],
        repo: env.GH_REPO.split("/")[1],
        path,
        ref: env.GH_BRANCH,
      });

      if (Array.isArray(res.data)) {
        // It's a directory → show JSON listing
        return new Response(JSON.stringify(res.data, null, 2), {
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }

      // Decode and return file content
      const content = atob(res.data.content);
      return new Response(content, {
        headers: { "Content-Type": res.data.type === "file" ? "application/octet-stream" : "text/plain", ...corsHeaders() },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status || 500,
        headers: corsHeaders(),
      });
    }
  }

  // ✅ Handle PUT — upload or update file
  if (method === "PUT") {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env.UPLOAD_KEY}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.text();
    const content = btoa(body); // GitHub expects base64-encoded content

    // Try to get SHA of existing file (for updates)
    let sha = undefined;
    try {
      const existing = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner: env.GH_REPO.split("/")[0],
        repo: env.GH_REPO.split("/")[1],
        path,
        ref: env.GH_BRANCH,
      });
      sha = existing.data.sha;
    } catch (err) {
      // 404 is fine — means it’s a new file
    }

    // Commit file
    try {
      await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
        owner: env.GH_REPO.split("/")[0],
        repo: env.GH_REPO.split("/")[1],
        path,
        message: `Update ${path}`,
        content,
        branch: env.GH_BRANCH,
        sha,
      });

      return new Response("OK", { status: 200, headers: corsHeaders() });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status || 500,
        headers: corsHeaders(),
      });
    }
  }

  // If method isn’t handled
  return new Response("Method Not Allowed", {
    status: 405,
    headers: corsHeaders(),
  });
}

// Helper for CORS
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
