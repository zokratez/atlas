export type ComplianceResult = {
  status: "passed" | "failed";
  notes: string;
};

const hardFailPatterns = [
  { name: "human-use or dosing implication", pattern: /\b(take|inject|dose|dosage|mg|mcg|cycle|stack|protocol|use this|for you)\b/i },
  { name: "health or therapeutic claim", pattern: /\b(treat|cure|heal|therapy|therapeutic|medical|doctor|patient|disease|symptom|diagnos|inflammation|pain|sleep|anxiety|depression|fat loss|weight loss|muscle growth)\b/i },
  { name: "cosmetic claim", pattern: /\b(anti-aging|wrinkle|skin|hair growth|glow|beauty|cosmetic|before.?after)\b/i },
  { name: "customer results", pattern: /\b(results|transformation|testimonial|before and after|lost \d+|gained \d+)\b/i },
  { name: "paid-ad targeting", pattern: /\b(target people|targeting|retarget|lookalike|facebook ads|meta ads|paid ads|ad set)\b/i },
];

const allowedStoreClaimPattern = /\b(RUO|research use only|not for human|purity|testing|tested|COA|certificate of analysis|lot|logistics|shipping|storage|Janoshik|pendiente)\b/i;
const janoshikPattern = /https?:\/\/(?:www\.)?janoshik\.com\/[^\s)]+/i;

export function runComplianceGate(property: string, draftText: string): ComplianceResult {
  if (property === "store") return runRuoGate(draftText);
  if (property === "huh") return runBasicClaimsGate(draftText);

  return {
    status: "passed",
    notes: "Non-store draft: RUO gate not applicable; no hard claim gate triggered.",
  };
}

function runRuoGate(text: string): ComplianceResult {
  const failures = hardFailPatterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ name }) => name);

  if (failures.length > 0) {
    return {
      status: "failed",
      notes: `RUO hard fail: ${failures.join(", ")}.`,
    };
  }

  if (!/\b(RUO|research use only|not for human)\b/i.test(text)) {
    return {
      status: "failed",
      notes: "RUO hard fail: missing explicit RUO / research-use-only framing.",
    };
  }

  if (!allowedStoreClaimPattern.test(text)) {
    return {
      status: "failed",
      notes: "RUO hard fail: claims must stay limited to purity, testing, logistics, COA, or pendiente.",
    };
  }

  if (/\bCOA|certificate of analysis|Janoshik\b/i.test(text) && !janoshikPattern.test(text) && !/\bpendiente\b/i.test(text)) {
    return {
      status: "failed",
      notes: "RUO hard fail: COA references must be real Janoshik links or pendiente.",
    };
  }

  return {
    status: "passed",
    notes: "RUO passed: research-use framing; claims limited to purity/testing/logistics; COA refs Janoshik or pendiente.",
  };
}

function runBasicClaimsGate(text: string): ComplianceResult {
  if (/\b(guarantee|fluent in \d+|native in \d+|learn spanish overnight|perfect spanish)\b/i.test(text)) {
    return {
      status: "failed",
      notes: "Basic claims fail: overpromises language-learning outcome.",
    };
  }

  return {
    status: "passed",
    notes: "Basic claims passed: no obvious language-learning overpromise.",
  };
}
