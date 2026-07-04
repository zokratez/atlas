export function parseJsonArray<T>(text: string): T[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain a JSON array.");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as T[];
}

export function parseJsonObject<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain a JSON object.");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
