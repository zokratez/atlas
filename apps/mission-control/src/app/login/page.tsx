import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error;

  return (
    <main className="login-screen">
      <section className="login-panel">
        <p className="eyebrow">Atlas Mission Control</p>
        <h1>Operator access</h1>
        <p className="muted">
          Enter the allowlisted owner email. Atlas will send a Supabase magic link.
        </p>
        {error ? (
          <p className="login-error" role="alert">
            Login failed: {decodeURIComponent(error)}
          </p>
        ) : null}
        <LoginForm />
      </section>
    </main>
  );
}
