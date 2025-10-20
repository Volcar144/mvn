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
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Maven Browser - ${repoType}/${path || ""}</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background-color: #f3f4f6;
              margin: 0;
              padding: 2rem;
              color: #333;
            }
            .tabs { margin-bottom: 1.5rem; }
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
            h1 { font-size: 1.5rem; margin-bottom: 1rem; }
            .breadcrumb a { color: #d00000; text-decoration: none; }
            .breadcrumb a:hover { text-decoration: underline; }
            ul {
              list-style: none;
              padding: 0;
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
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
            a.item-link {
              color: #333;
              text-decoration: none;
              flex: 1;
              word-break: break-word;
            }
            a.item-link:hover { text-decoration: underline; color: #d00000; }

            #editorModal {
              position: fixed;
              top: 0; left: 0;
              width: 100%; height: 100%;
              background: rgba(0,0,0,0.5);
              display: none;
              justify-content: center;
              align-items: center;
              z-index: 1000;
            }
            #editorBox {
              background: white;
              border-radius: 10px;
              width: 80%;
              max-width: 900px;
              padding: 1rem;
              display: flex;
              flex-direction: column;
            }
            #editor {
              border: 1px solid #ddd;
              height: 400px;
              border-radius: 6px;
              margin-bottom: 1rem;
            }
            #closeBtn, #saveBtn {
              padding: 0.5rem 1rem;
              border: none;
              border-radius: 6px;
              font-weight: bold;
              cursor: pointer;
            }
            #closeBtn { background: #ccc; color: #333; margin-right: 0.5rem; }
            #saveBtn { background: #d00000; color: white; }
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
              const name = item.type === "dir" ? item.name + "/" : item.name;
              const ext = name.split('.').pop().toLowerCase();
              const editable = ['txt', 'xml', 'yml', 'yaml', 'json'].includes(ext);
              if (item.type === "dir") {
                return '<li><a class="item-link" href="?repo=' + repoType + '&path=' + item.path.replace(new RegExp('^' + repoType + '/'), '') + '">' + name + '</a></li>';
              } else if (editable) {
                return `<li><a class="item-link" href="javascript:void(0)" data-path="${item.path}" data-name="${item.name}" class="editable">${name}</a></li>`;
              } else {
                return `<li><a class="item-link" href="/api/files/${item.path}">${name}</a></li>`;
              }
            }).join("")}
          </ul>

          <div id="editorModal">
            <div id="editorBox">
              <h2 id="editorTitle"></h2>
              <div id="editor"></div>
              <div style="margin-top:1rem;text-align:right;">
                <button id="closeBtn">Close</button>
                <button id="saveBtn">Save</button>
              </div>
            </div>
          </div>

          <script type="module">
            import { EditorView, basicSetup } from "https://esm.sh/@codemirror/basic-setup";
            import { EditorState } from "https://esm.sh/@codemirror/state";
            import { xml } from "https://esm.sh/@codemirror/lang-xml";
            import { yaml } from "https://esm.sh/@codemirror/lang-yaml";
            import { json } from "https://esm.sh/@codemirror/lang-json";

            const editorModal = document.getElementById("editorModal");
            const editorBox = document.getElementById("editorBox");
            const editorTitle = document.getElementById("editorTitle");
            const closeBtn = document.getElementById("closeBtn");
            const saveBtn = document.getElementById("saveBtn");
            const editorContainer = document.getElementById("editor");

            let editorView = null;

            async function openEditor(path, displayName) {
              editorModal.style.display = "flex";
              editorBox.dataset.path = path;
              editorTitle.textContent = displayName;

              const res = await fetch("/api/files/" + path);
              const text = await res.text();

              const ext = displayName.split(".").pop().toLowerCase();
              let lang = null;
              if (ext === "xml") lang = xml();
              if (["yml", "yaml"].includes(ext)) lang = yaml();
              if (ext === "json") lang = json();

              editorView = new EditorView({
                state: EditorState.create({
                  doc: text,
                  extensions: [basicSetup, lang ?? []],
                }),
                parent: editorContainer,
              });
            }

            function closeEditor() {
              editorModal.style.display = "none";
              if (editorView) {
                editorView.destroy();
                editorView = null;
              }
            }

            async function saveFile() {
              const path = editorBox.dataset.path;
              const key = prompt("Enter upload key:");
              if (!key) return alert("Upload key required.");
              const content = editorView.state.doc.toString();
              const res = await fetch("/api/files/" + path, {
                method: "PUT",
                headers: { Authorization: "Bearer " + key },
                body: new Blob([content]),
              });
              alert(await res.text());
              if (res.ok) closeEditor();
            }

            closeBtn.addEventListener("click", closeEditor);
            saveBtn.addEventListener("click", saveFile);

            document.querySelectorAll("a.editable").forEach(a => {
              a.addEventListener("click", () => openEditor(a.dataset.path, a.dataset.name));
            });
          </script>
        </body>
      </html>
    `;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });

  } catch (err) {
    return new Response(`<pre>Error: ${err.message}</pre>`, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  }
}
