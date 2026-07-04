export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "sam@pacopeptide.com,tortillabar@me.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
