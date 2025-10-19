export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.searchParams.get("path") || "";
  const repoType = url.searchParams.get("repo") || "releases";

  const apiUrl = `https://api.github.com/repos/Volcar144/StaticHosting/contents/${repoType}${path ? "/" + path : ""}?ref=maven`;

  try {
    const res = await fetch(apiUrl, { headers: { "User-Agent": "cf-browse" } });
    if (!res.ok) {
      return new Response(`GitHub returned ${res.status}`, { status: res.status });
    }

    const items = await res.json();
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
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background-color: #f3f4f6;
              margin: 0;
              padding: 2rem;
              color: #333;
            }

            .tabs {
              margin-bottom: 1.5rem;
            }
            .tabs a {
              display: inline-block;
              margin-right: 1rem;
              padding: 0.5rem 1rem;
              font-weight: bold;
              text-decoration: none;
              border-radius: 6px;
              background-color: #fff;
              color: #d00000;
              box-shadow: 0 2px 4px rgba(0,0,0,0.05);
              transition: 0.2s;
            }
            .tabs a.active, .tabs a:hover {
              background-color: #d00000;
              color: #fff;
            }

            h1 {
              font-size: 1.5rem;
              margin-bottom: 1rem;
            }

            .breadcrumb a {
              color: #d00000;
              text-decoration: none;
            }
            .breadcrumb a:hover { text-decoration: underline; }

            ul {
              list-style: none;
              padding: 0;
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
              gap: 0.75rem;
            }

            li {
              background-color: #fff;
              padding: 0.75rem 1rem;
              border-radius: 6px;
              box-shadow: 0 2px 6px rgba(0,0,0,0.05);
              display: flex;
              align-items: center;
              transition: 0.2s;
            }

            li:hover {
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              transform: translateY(-2px);
            }

            .folder::before {
              content: "📁";
              margin-right: 0.5rem;
              font-size: 1.2rem;
            }
            .file::before {
              content: "📄";
              margin-right: 0.5rem;
              font-size: 1.2rem;
            }

            a.item-link {
              color: #333;
              text-decoration: none;
              flex: 1;
              word-break: break-word;
            }
            a.item-link:hover { text-decoration: underline; color: #d00000; }

          </style>
        </head>
        <body>
          <div class="tabs">
            <a href="?repo=releases"${repoType === "releases" ? " class='active'" : ""}>Releases</a>
            <a href="?repo=snapshots"${repoType === "snapshots" ? " class='active'" : ""}>Snapshots</a>
          </div>

          <h1 class="breadcrumb">${breadcrumb}</h1>

          <ul>
            ${items.map(item => {
              const itemClass = item.type === "dir" ? "folder" : "file";
              const link = item.type === "dir"
                ? `?repo=${repoType}&path=${item.path.replace(/^${repoType}\//,'')}`
                : `/api/files/${item.path}`;
              return `<li class="${itemClass}"><a class="item-link" href="${link}">${item.name}</a></li>`;
            }).join("")}
          </ul>
        </body>
      </html>
    `;

    return new Response(html, { headers: { "Content-Type": "text/html" } });

  } catch (err) {
    return new Response(`<pre>Error: ${err.message}</pre>`, { status: 500 });
  }
}
