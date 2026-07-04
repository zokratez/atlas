import { atlasDb } from "../lib/db.js";

function assetIdFromArgs() {
  const index = process.argv.indexOf("--asset");
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function main() {
  const assetId = assetIdFromArgs();
  if (!assetId) throw new Error("Usage: npm run video:dissect -- --asset <asset-id>");

  const { data: asset, error } = await atlasDb()
    .from("assets")
    .select("id, kind, title, raw_video_path, file_path, duration_seconds")
    .eq("id", assetId)
    .single();

  if (error) throw error;
  if (asset.kind !== "video") throw new Error("Only video assets can be deep-dissected.");

  console.log(`atlas-video-dissect ready for ${asset.title}`);
  console.log("Pipeline contract: ffmpeg keyframes + local transcript + governed vision dissection.");
  console.log("Not running extraction yet: Sam must configure local ffmpeg/whisper path before first paid/vision pass.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
