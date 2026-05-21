import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type AxiosError } from 'axios';
import { createApiClient } from '../lib/api';

type Contact = {
  threadId: string;
  id: string;
  username: string;
  email: string;
  lastMessageAt: string | null;
  messageCount: number;
};

function initials(name: string) {
  return name
    .split(' ')
    .map((word) => word[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Stable per-username hue so each contact always gets the same colour.
function avatarHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) % 360;
}

function ContactsPage() {
  const api = useMemo(() => createApiClient(), []);
  const navigate = useNavigate();
  const currentUser = useMemo(() => {
    const raw = localStorage.getItem('secureChatUser');
    return raw ? JSON.parse(raw) : null;
  }, []);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const response = await api.get('/api/chat/threads');
        const threads = response.data.threads || [];
        const mapped: Contact[] = threads.map((thread: any) => {
          const peer = (thread.participants || []).find(
            (participant: any) => String(participant.id) !== String(currentUser?.id),
          );
          return {
            threadId: String(thread.id),
            id: String(peer?.id || ''),
            username: peer?.username || 'Unknown',
            email: peer?.email || '',
            lastMessageAt: thread.lastActivityAt || null,
            messageCount: thread.messageCount || 0,
          };
        });
        mapped.sort((a, b) => {
          if (!a.lastMessageAt) return 1;
          if (!b.lastMessageAt) return -1;
          return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
        });
        setContacts(mapped);
      } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message?: string }>;
        setStatusMsg(axiosError.response?.data?.message || 'Unable to load contacts.');
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openChat(threadId: string) {
    navigate(`/chat?thread=${threadId}`);
  }

  const filtered = search.trim()
    ? contacts.filter(
        (contact) =>
          contact.username.toLowerCase().includes(search.toLowerCase()) ||
          contact.email.toLowerCase().includes(search.toLowerCase()),
      )
    : contacts;

  return (
    <section className="contacts-shell">
      <header className="contacts-header card">
        <div>
          <p className="brand-kicker">End-to-end encrypted</p>
          <h2>Contacts</h2>
          <p>People you have an active secure conversation with.</p>
        </div>
        <div className="contacts-header-meta">
          <span className="contacts-count">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</span>
        </div>
      </header>

      <div className="contacts-search-row">
        <input
          className="contacts-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search contacts"
        />
      </div>

      {loading && <p className="status">Loading contacts…</p>}
      {!loading && statusMsg && <p className="status error">{statusMsg}</p>}

      {!loading && filtered.length === 0 && !statusMsg && (
        <div className="contacts-empty card">
          <p className="empty-state">
            {search.trim()
              ? 'No contacts match your search.'
              : 'No contacts yet. Accept a chat request to add someone here.'}
          </p>
        </div>
      )}

      <ul className="contacts-list" aria-label="Contacts">
        {filtered.map((contact) => {
          const hue = avatarHue(contact.username);
          return (
            <li key={contact.threadId} className="contact-card card">
              <div
                className="contact-avatar"
                style={{ '--avatar-hue': hue } as React.CSSProperties}
                aria-hidden="true"
              >
                {initials(contact.username)}
              </div>
              <div className="contact-info">
                <strong className="contact-name">{contact.username}</strong>
                <span className="contact-email">{contact.email}</span>
                <span className="contact-meta">
                  {contact.messageCount} message{contact.messageCount !== 1 ? 's' : ''}
                  {contact.lastMessageAt ? ` · Last active ${formatDate(contact.lastMessageAt)}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="contact-msg-btn submit"
                onClick={() => openChat(contact.threadId)}
                aria-label={`Message ${contact.username}`}
              >
                Message
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ContactsPage;
