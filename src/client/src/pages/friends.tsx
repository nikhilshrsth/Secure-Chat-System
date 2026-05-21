import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type AxiosError } from 'axios';
import { createApiClient } from '../lib/api';

type Friend = {
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

// Stable per-username hue so each friend always gets the same colour.
function avatarHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) % 360;
}

function FriendsPage() {
  const api = useMemo(() => createApiClient(), []);
  const navigate = useNavigate();
  const currentUser = useMemo(() => {
    const raw = localStorage.getItem('secureChatUser');
    return raw ? JSON.parse(raw) : null;
  }, []);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const response = await api.get('/api/chat/threads');
        const threads = response.data.threads || [];
        const mapped: Friend[] = threads
          .filter((thread: any) => thread.threadType === 'direct')
          .map((thread: any) => {
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
        // Deduplicate by peer id — keep the thread with the most recent activity.
        const seen = new Set<string>();
        const unique = mapped.filter((f) => {
          if (!f.id || seen.has(f.id)) return false;
          seen.add(f.id);
          return true;
        });
        unique.sort((a, b) => {
          if (!a.lastMessageAt) return 1;
          if (!b.lastMessageAt) return -1;
          return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
        });
        setFriends(unique);
      } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message?: string }>;
        setStatusMsg(axiosError.response?.data?.message || 'Unable to load friends.');
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
    ? friends.filter(
        (friend) =>
          friend.username.toLowerCase().includes(search.toLowerCase()) ||
          friend.email.toLowerCase().includes(search.toLowerCase()),
      )
    : friends;

  return (
    <section className="friends-shell">
      <div className="friends-search-row">
        <input
          className="friends-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search friends"
        />
      </div>

      {loading && <p className="status">Loading friends…</p>}
      {!loading && statusMsg && <p className="status error">{statusMsg}</p>}

      {!loading && filtered.length === 0 && !statusMsg && (
        <div className="friends-empty card">
          <p className="empty-state">
            {search.trim()
              ? 'No friends match your search.'
              : 'No friends yet. Accept a chat request to add someone here.'}
          </p>
        </div>
      )}

      <ul className="friends-list" aria-label="Friends">
        {filtered.map((friend) => {
          const hue = avatarHue(friend.username);
          return (
            <li key={friend.threadId} className="friend-card card">
              <div
                className="friend-avatar"
                style={{ '--avatar-hue': hue } as React.CSSProperties}
                aria-hidden="true"
              >
                {initials(friend.username)}
              </div>
              <div className="friend-info">
                <strong className="friend-name">{friend.username}</strong>
                <span className="friend-email">{friend.email}</span>
                <span className="friend-meta">
                  {friend.messageCount} message{friend.messageCount !== 1 ? 's' : ''}
                  {friend.lastMessageAt ? ` · Last active ${formatDate(friend.lastMessageAt)}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="friend-msg-btn submit"
                onClick={() => openChat(friend.threadId)}
                aria-label={`Message ${friend.username}`}
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

export default FriendsPage;
