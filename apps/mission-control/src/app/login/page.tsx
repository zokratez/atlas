import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="login-screen">
      <section className="login-panel">
        <p className="eyebrow">Atlas Mission Control</p>
        <h1>Operator access</h1>
        <p className="muted">
          Enter the allowlisted owner email. Atlas will send a Supabase magic link.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
