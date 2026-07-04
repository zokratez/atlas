export type SourceSnapshot = {
  url: string;
  ok: boolean;
  status?: number;
  title?: string;
  excerpt: string;
};

function compactText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2500);
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

export async function fetchSnapshot(url: string): Promise<SourceSnapshot> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "AtlasResearchWorker/0.1 read-only marketing research",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    });

    const text = await response.text();
    return {
      url,
      ok: response.ok,
      status: response.status,
      title: extractTitle(text),
      excerpt: compactText(text),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      excerpt: error instanceof Error ? error.message : "Fetch failed.",
    };
  }
}
