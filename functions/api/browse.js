export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  let path = url.searchParams.get("path") || ""; // Current path
  let repoType = url.searchParams.get("repo") || "releases"; // releases or snapshots

  // Construct full GitHub API path
  const apiUrl = `https://api.github.com/repos/${env.GH_REPO}/contents/${repoType}${path ? "/" + path : ""}?ref=${env.GH_BRANCH}`;
  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": "cf-file-browser",
      ...(env.GH_TOKEN ? { "Authorization": `Bearer ${env.GH_TOKEN}` } : {}),
    },
  });

  if (!res.ok) return new Response("Not found", { status: res.status });

  const items = await res.json();

  // Build breadcrumb navigation
  const parts = path.split("/").filter(Boolean);
  let breadcrumb = `<a href="?repo=${repoType}">/${repoType}</a>`;
  let accumulated = "";
  for (const part of parts) {
    accumulated += "/" + part;
    breadcrumb += ` / <a href="?repo=${repoType}&path=${accumulated.slice(1)}">${part}</a>`;
  }

  // Generate HTML
  const html = `
    <html>
      <head>
        <title>File Browser - ${repoType}/${path || ""}</title>
        <style>
          body { font-family: sans-serif; padding: 2rem; }
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
          <a href="?repo=releases"${repoType === "releases" ? " style='color:#000'" : ""}>Releases</a>
          <a href="?repo=snapshots"${repoType === "snapshots" ? " style='color:#000'" : ""}>Snapshots</a>
        </div>
        <h1>📂 ${breadcrumb}</h1>
        <ul>
          ${items
            .map(item => {
              if (item.type === "dir") {
                return `<li class="folder"><a href="?repo=${repoType}&path=${item.path.replace(/^${repoType}\//,'')}">${item.name}</a></li>`;
              } else {
                const fileUrl = `/api/files/${item.path.replace(/^${repoType}\//,'')}`;
                return `<li class="file"><a href="${fileUrl}">${item.name}</a></li>`;
              }
            })
            .join("")}
        </ul>
      </body>
    </html>
  `;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
