function SupportPage() {
  return (
    <section className="trust-page">
      <header className="trust-hero">
        <p className="brand-kicker">Support</p>
        <h1>How can we help?</h1>
        <p>
          Get help with account access, secure chat setup, group invitations, notifications, and security settings.
          Our support contact is <a href="mailto:support@shadowlink.cihe.com.au">support@shadowlink.cihe.com.au</a>.
        </p>
      </header>

      <div className="support-action-panel">
        <div>
          <h2>Email support</h2>
          <p>Include your account email, a short summary, and any error message you are seeing.</p>
        </div>
        <a className="submit support-mail-link" href="mailto:support@shadowlink.cihe.com.au?subject=Shadow%20Link%20Support%20Request">
          Contact support
        </a>
      </div>

      <div className="trust-grid">
        <article className="trust-card">
          <h2>Account access</h2>
          <p>
            If you cannot sign in, confirm your email and password, check whether two-factor authentication is
            required, and contact support if your account appears locked or suspended.
          </p>
        </article>

        <article className="trust-card">
          <h2>Secure chat setup</h2>
          <p>
            Sign in once on your trusted browser so your public chat key can be published. Other customers can only
            invite or message you once your secure chat key is available.
          </p>
        </article>

        <article className="trust-card">
          <h2>Group invitations</h2>
          <p>
            Pending group invitations appear in Notifications and Groups. A group becomes visible in your active chat
            list only after you accept the invitation.
          </p>
        </article>

        <article className="trust-card">
          <h2>Privacy and safety</h2>
          <p>
            Never share passwords, 2FA codes, private keys, or recovery secrets with anyone. Shadow Link support will
            not ask for those secrets.
          </p>
        </article>

        <article className="trust-card trust-card--wide">
          <h2>Support hours</h2>
          <p>
            Support requests are reviewed by priority. Security and account access issues should include "Urgent" in
            the subject line when immediate review is needed.
          </p>
        </article>
      </div>
    </section>
  );
}

export default SupportPage;
