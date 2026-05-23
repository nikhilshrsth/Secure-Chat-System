import { NavLink } from 'react-router-dom'

function Footer() {
  return (
    <footer className="app-footer" aria-label="Application footer">
      <p>&copy; 2026 Shadow Link. All rights reserved.</p>
      <p className="footer-tagline">Secure Conversations. Trusted Connections.</p>

      <nav className="footer-links" aria-label="Footer navigation">
        <NavLink to="/privacy">Privacy</NavLink>
        <NavLink to="/security">Security</NavLink>
        <NavLink to="/support">Support</NavLink>
      </nav>
    </footer>
  )
}

export default Footer
