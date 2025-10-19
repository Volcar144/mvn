export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  let path = url.searchParams.get("path") || ""; // e.g., "releases/com/example/mylib"

  // Fetch directory contents from GitHub API
  const apiUrl = `https://api.github.com/repos/${env.GH_REPO}/contents/${path}?ref=${env.GH_BRANCH}`;
  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": "cf-file-browser",
      ...(env.GH_TOKEN ? { "Authorization": `Bearer ${env.GH_TOKEN}` } : {}),
    },
  });

  if (!res.ok) return new Response("Not found", { status: res.status });

  const items = await res.json(); // Array of files/folders

  // Generate HTML
  const html = `
    <html>
      <head>
        <title>File Browser - ${path || "/"}</title>
        <style>
          body { font-family: sans-serif; padding: 2rem; }
          a { text-decoration: none; color: #0070f3; }
          a:hover { text-decoration: underline; }
          .folder::before { content: "📁 "; }
          .file::before { content: "📄 "; }
        </style>
      </head>
      <body>
        <h1>📂 File Browser: ${path || "/"}</h1>
        <ul>
          ${items
            .map(item => {
              if (item.type === "dir") {
                return `<li class="folder"><a href="?path=${item.path}">${item.name}</a></li>`;
              } else {
                // Direct link to files via your existing /api/files proxy
                const fileUrl = `/api/files/${item.path.replace(/^releases\/|^snapshots\//, "")}`;
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
