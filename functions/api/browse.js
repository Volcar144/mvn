import { Octokit } from "@octokit/core";

export async function onRequest(context) {
  const { env, request } = context;
  const octokit = new Octokit({ auth: env.GH_TOKEN });
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  const repoType = url.searchParams.get("repo") || "releases";

  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: env.GH_REPO.split("/")[0],
      repo: env.GH_REPO.split("/")[1],
      path: `${repoType}${path ? "/" + path : ""}`,
      ref: env.GH_BRANCH,
    });

    const items = Array.isArray(res.data) ? res.data : [];
    const parts = path.split("/").filter(Boolean);

    let breadcrumb = `<a href="?repo=${repoType}">/${repoType}</a>`;
    let accumulated = "";
    for (const part of parts) {
      accumulated += "/" + part;
      breadcrumb += ` / <a href="?repo=${repoType}&path=${accumulated.slice(1)}">${part}</a>`;
    }

    const html = `
      <html>
        <head>
          <title>Maven Browser - ${repoType}/${path || ""}</title>
          <style>
            body { font-family: sans-serif; padding: 2rem; background: #f7f7f7; }
            a { text-decoration: none; color: #d00000; }
            a:hover { text-decoration: underline; }
            .folder::before { content: "📁 "; }
            .file::before { content: "📄 "; }
            .tabs { margin-bottom: 1rem; }
            .tabs a { margin-right: 1rem; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="tabs">
            <a href="?repo=releases"${repoType === "releases" ? " style='color:black;'" : ""}>Releases</a>
            <a href="?repo=snapshots"${repoType === "snapshots" ? " style='color:black;'" : ""}>Snapshots</a>
          </div>
          <h1>${breadcrumb}</h1>
          <ul>
            ${items.map(item => {
              if (item.type === "dir") {
                return `<li class="folder"><a href="?repo=${repoType}&path=${item.path.replace(/^${repoType}\//,'')}">${item.name}</a></li>`;
              } else {
                return `<li class="file"><a href="/api/files/${item.path}">${item.name}</a></li>`;
              }
            }).join("")}
          </ul>
        </body>
      </html>
    `;

    return new Response(html, { headers: { "Content-Type": "text/html" } });
  } catch (err) {
    return new Response(`<pre>Error: ${err.message}</pre>`, { status: err.status || 500 });
  }
}
