interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetBinding;
}

const SECURITY_HEADERS = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

async function finalizeResponse(response: Response, requestUrl: URL): Promise<Response> {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  if ((headers.get("content-type") ?? "").includes("text/html")) {
    const html = (await response.text()).replaceAll(
      "__SITE_ORIGIN__",
      requestUrl.origin,
    );
    headers.delete("content-length");
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url);
    let response = await env.ASSETS.fetch(request);

    if (
      response.status === 404 &&
      request.method === "GET" &&
      (request.headers.get("accept") ?? "").includes("text/html")
    ) {
      response = await env.ASSETS.fetch(
        new Request(new URL("/index.html", requestUrl), request),
      );
    }

    return finalizeResponse(response, requestUrl);
  },
};

export default worker;
