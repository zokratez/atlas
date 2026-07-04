import fs from "node:fs";
import path from "node:path";
import { getRepoRoot } from "./env.js";

const scoutSoulPath = "/Users/samoteo/.openclaw/agents/scout/SOUL.md";

export function loadScoutDoctrine() {
  const scoutSoul = fs.readFileSync(scoutSoulPath, "utf8");
  const growthSkill = fs.readFileSync(
    path.join(getRepoRoot(), "skills/atlas-growth-rd/SKILL.md"),
    "utf8",
  );

  return [
    "# Scout SOUL",
    scoutSoul,
    "# Atlas Growth R&D Skill",
    growthSkill,
  ].join("\n\n");
}
