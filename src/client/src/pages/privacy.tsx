function PrivacyPage() {
  return (
    <section className="trust-page">
      <header className="trust-hero">
        <p className="brand-kicker">Privacy</p>
        <h1>Privacy at Shadow Link</h1>
        <p>
          Shadow Link is designed for secure conversations where the service protects account access,
          conversation metadata, and encrypted message delivery without exposing private message content.
        </p>
      </header>

      <div className="trust-grid">
        <article className="trust-card trust-card--wide">
          <h2>What we protect</h2>
          <p>
            Private chat messages are encrypted before storage and transport. The system is built so
            administrative tools show operational and security metadata, not plaintext private messages,
            passwords, private keys, two-factor secrets, or session tokens.
          </p>
        </article>

        <article className="trust-card">
          <h2>Information we use</h2>
          <ul>
            <li>Account details such as name, email address, and profile settings.</li>
            <li>Security events such as sign-in attempts, account status changes, and audit activity.</li>
            <li>Chat metadata such as participants, timestamps, delivery state, and encrypted payload status.</li>
          </ul>
        </article>

        <article className="trust-card">
          <h2>Information we do not expose</h2>
          <ul>
            <li>Plaintext private messages.</li>
            <li>Passwords, recovery secrets, private encryption keys, and two-factor secrets.</li>
            <li>Session tokens or other credentials in support or admin views.</li>
          </ul>
        </article>

        <article className="trust-card">
          <h2>Retention</h2>
          <p>
            Account, audit, and security logs are kept only for operational, compliance, and abuse-prevention
            purposes. Ephemeral message controls can remove eligible messages after their configured expiry.
          </p>
        </article>

        <article className="trust-card">
          <h2>Your choices</h2>
          <p>
            You can manage profile details, security settings, and communication preferences from your account.
            For privacy questions, contact <a href="mailto:support@shadowlink.cihe.com.au">support@shadowlink.cihe.com.au</a>.
          </p>
        </article>
      </div>
    </section>
  );
}

export default PrivacyPage;
