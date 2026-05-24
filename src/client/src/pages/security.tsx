function SecurityPage() {
  return (
    <section className="trust-page">
      <header className="trust-hero">
        <p className="brand-kicker">Security</p>
        <h1>Security architecture</h1>
        <p>
          Shadow Link combines encrypted messaging, account protection, access control, and continuous monitoring
          to keep secure collaboration practical for everyday users.
        </p>
      </header>

      <div className="trust-security-strip">
        <span>End-to-end encrypted</span>
        <span>Role-based access</span>
        <span>2FA ready</span>
        <span>Audit logged</span>
      </div>

      <div className="trust-grid">
        <article className="trust-card">
          <h2>Encryption</h2>
          <p>
            Messages are handled as encrypted payloads. The server stores ciphertext and integrity metadata, while
            private conversation content remains unavailable to dashboard and admin views.
          </p>
        </article>

        <article className="trust-card">
          <h2>Access control</h2>
          <p>
            Customer and admin roles are separated. Admin users can manage customer account status, but customer
            profile information and private chat content are not altered through admin workflows.
          </p>
        </article>

        <article className="trust-card">
          <h2>Monitoring</h2>
          <p>
            Login attempts, suspicious activity, message integrity failures, and admin actions are recorded as
            security metadata to support incident review and accountability.
          </p>
        </article>

        <article className="trust-card">
          <h2>Group membership</h2>
          <p>
            Group invitations require explicit acceptance. Pending users cannot open groups, read history, send
            messages, receive realtime group events, or access group keys.
          </p>
        </article>

        <article className="trust-card trust-card--wide">
          <h2>Report a security concern</h2>
          <p>
            If you believe you have found a vulnerability or account safety issue, email
            {' '}<a href="mailto:support@shadowlink.cihe.com.au?subject=Security%20Concern%20-%20Shadow%20Link">support@shadowlink.cihe.com.au</a>
            {' '}with a clear description, affected account or feature, reproduction steps, and screenshots if safe to share.
          </p>
        </article>
      </div>
    </section>
  );
}

export default SecurityPage;
