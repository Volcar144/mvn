export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Block sensitive paths
  if (
    pathname.includes("package.json") ||
    pathname.startsWith("/node_modules")
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  // Allow everything else
  return context.next();
}
