import { notFound } from "next/navigation";
import { atlasDb } from "@/lib/atlas/supabase";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function ReceiptPage({ params }: PageProps) {
  const { token } = await params;
  const { data: intake, error } = await atlasDb()
    .from("intake")
    .select("id, created_at, kind, content, status, notes, finding_ids, source_chars, analyzed_chars, coverage_pct, coverage_method, public_demo_result")
    .eq("receipt_token", token)
    .contains("tags", ["public_demo"])
    .single();

  if (error || !intake) notFound();

  const findingIds = Array.isArray(intake.finding_ids) ? intake.finding_ids : [];
  const findings = findingIds.length > 0
    ? await loadFindings(findingIds)
    : [];

  return (
    <main className="public-page receipt-page">
      <section className="public-section">
        <p className="eyebrow">Atlas receipt</p>
        <h1>{intake.status === "processed" ? "Your dissection is ready." : "Your dissection is queued."}</h1>
        <p>
          {intake.status === "processed"
            ? "Atlas studied the source and pulled out the mechanics worth noticing."
            : "Atlas is still reading. Refresh this page in a minute."}
        </p>
        <div className="proof-strip receipt-proof">
          <span>{intake.kind}</span>
          <span>{coverageLabel(intake)}</span>
          <span>{new Date(intake.created_at).toLocaleString()}</span>
        </div>
      </section>

      <section className="public-section">
        <p className="eyebrow">Autopsy</p>
        <div className="dense-stack">
          {findings.length === 0 ? <div className="empty-state">No findings yet. The receipt will fill in after processing.</div> : null}
          {findings.map((finding) => (
            <article className="panel sample-autopsy" key={finding.id}>
              <h2>{finding.claim}</h2>
              {finding.evidence ? <p>{finding.evidence}</p> : null}
              <div className="tag-row">
                <span className="chip">{finding.channel ?? "general"}</span>
                <span className="chip">{Math.round(Number(finding.confidence ?? 0) * 100)}%</span>
                {(finding.tags ?? []).slice(0, 5).map((tag: string) => <span className="chip" key={tag}>{tag}</span>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section brief-pitch">
        <p className="eyebrow">The Brief</p>
        <h2>Want this every day, not once?</h2>
        <p>Atlas turns drops like this into patterns, draft queues, and receipts for the whole marketing loop.</p>
      </section>
    </main>
  );
}

async function loadFindings(ids: string[]) {
  const { data, error } = await atlasDb()
    .from("findings")
    .select("id, claim, evidence, channel, confidence, tags")
    .in("id", ids);

  if (error) return [];
  const byId = new Map((data ?? []).map((finding) => [finding.id, finding]));
  return ids.map((id) => byId.get(id)).filter((finding): finding is NonNullable<typeof finding> => Boolean(finding));
}

function coverageLabel(value: {
  source_chars?: number | null;
  analyzed_chars?: number | null;
  coverage_pct?: number | null;
  coverage_method?: string | null;
}) {
  const pct = Number(value.coverage_pct ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return "waiting for coverage";
  const method = String(value.coverage_method ?? "full_text").replace("_", " ");
  return `studied ${Math.round(pct)}% via ${method}`;
}
