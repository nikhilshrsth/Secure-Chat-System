import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { type AxiosError } from 'axios';
import { createApiClient } from '../lib/api';
import {
  decryptMessageText,
  decryptThreadKeyForUser,
  encryptMessageText,
  encryptThreadKeyForUser,
  generateThreadKeyRaw,
  getOrCreateIdentity,
} from '../lib/chatE2ee';

type ThreadParticipant = {
  id: string;
  username: string;
  email: string;
};

type RawChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  encryptedPayload: {
    ciphertext: string;
    iv: string;
    authTag: string;
    algorithm: string;
  };
  isOwn: boolean;
  createdAt: string;
  replyTo?: {
    id: string;
    senderName: string;
  } | null;
};

type ChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  text: string;
  isOwn: boolean;
  createdAt: string;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  } | null;
};

type ChatThread = {
  id: string;
  threadType: string;
  participants: ThreadParticipant[];
  lastActivityAt: string;
  messageCount: number;
  lastMessage?: {
    text: string;
    senderName: string;
    createdAt: string;
  } | null;
};

type SearchedUser = {
  id: string;
  username: string;
  email: string;
  publicKey?: string | null;
};

type IncomingRequest = {
  id: string;
  requester: {
    id: string;
    username: string;
    email: string;
    publicKey?: string | null;
  };
  status: string;
  initialMessage: {
    ciphertext: string;
    iv: string;
    authTag: string;
    algorithm: string;
  };
  participantKeys: Array<{ userId: string; encryptedKey: string }>;
  createdAt: string;
};

type OutgoingRequest = {
  id: string;
  recipient: { id: string; username: string; email: string };
  status: string;
  lockAfterRejection: boolean;
  createdAt: string;
};

type SocketAck = {
  ok: boolean;
  message?: RawChatMessage;
};

function formatTime(value: string) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ChatPage() {
  const api = useMemo(() => createApiClient(), []);
  const socketUrl = import.meta.env.VITE_SOCKET_URL || '';
  const token = localStorage.getItem('secureChatToken') || '';
  const currentUser = useMemo(() => {
    const raw = localStorage.getItem('secureChatUser');
    return raw ? JSON.parse(raw) : null;
  }, []);

  const socketRef = useRef<Socket | null>(null);
  const activeThreadIdRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const threadKeysRef = useRef<Map<string, string>>(new Map());
  const identityRef = useRef<{ publicKey: string; privateKeyJwk: JsonWebKey } | null>(null);

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [requestEmail, setRequestEmail] = useState('');
  const [firstMessageInput, setFirstMessageInput] = useState('');
  const [searchedUser, setSearchedUser] = useState<SearchedUser | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<Array<IncomingRequest & { preview: string }>>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const activeThread = threads.find((thread) => thread.id === activeThreadId) || null;

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  async function ensureThreadKey(threadId: string): Promise<string> {
    const cached = threadKeysRef.current.get(threadId);
    if (cached) return cached;

    const identity = identityRef.current;
    if (!identity) throw new Error('Encryption identity not initialized');

    const response = await api.get(`/api/chat/threads/${threadId}/key`);
    const encryptedKey = String(response.data?.encryptedKey || '');
    if (!encryptedKey) throw new Error('No encrypted key available for this thread');

    const threadKey = await decryptThreadKeyForUser(encryptedKey, identity.privateKeyJwk);
    threadKeysRef.current.set(threadId, threadKey);
    return threadKey;
  }

  async function decryptRawMessage(rawMessage: RawChatMessage, threadKey: string, byId: Map<string, ChatMessage>) {
    const text = await decryptMessageText(rawMessage.encryptedPayload, threadKey);
    const replied = rawMessage.replyTo ? byId.get(rawMessage.replyTo.id) : null;

    const mapped: ChatMessage = {
      id: rawMessage.id,
      threadId: rawMessage.threadId,
      senderId: rawMessage.senderId,
      senderName: rawMessage.senderName,
      text,
      isOwn: rawMessage.isOwn,
      createdAt: rawMessage.createdAt,
      replyTo: rawMessage.replyTo
        ? {
            id: rawMessage.replyTo.id,
            senderName: rawMessage.replyTo.senderName,
            text: replied?.text || '[Encrypted reply]',
          }
        : null,
    };

    byId.set(mapped.id, mapped);
    return mapped;
  }

  async function refreshThreads() {
    const response = await api.get('/api/chat/threads');
    const nextThreads = response.data.threads || [];
    setThreads(nextThreads);
    if (!activeThreadId && nextThreads[0]?.id) setActiveThreadId(nextThreads[0].id);
  }

  async function refreshRequests() {
    const identity = identityRef.current;
    if (!identity) return;

    const [incomingResponse, outgoingResponse] = await Promise.all([
      api.get('/api/chat/requests/incoming'),
      api.get('/api/chat/requests/outgoing'),
    ]);

    const incomingRaw: IncomingRequest[] = incomingResponse.data.requests || [];
    const incomingWithPreview = await Promise.all(
      incomingRaw.map(async (request) => {
        try {
          const encryptedKeyForMe = request.participantKeys.find((item) => String(item.userId) === String(currentUser.id));
          if (!encryptedKeyForMe) return { ...request, preview: '[Unable to decrypt request]' };
          const threadKey = await decryptThreadKeyForUser(encryptedKeyForMe.encryptedKey, identity.privateKeyJwk);
          const preview = await decryptMessageText(request.initialMessage, threadKey);
          return { ...request, preview };
        } catch (_error) {
          return { ...request, preview: '[Unable to decrypt request]' };
        }
      }),
    );

    setIncomingRequests(incomingWithPreview);
    setOutgoingRequests(outgoingResponse.data.requests || []);
  }

  useEffect(() => {
    const socketOptions = {
      auth: { token },
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    };

    const socket = socketUrl
      ? io(socketUrl, socketOptions)
      : io(socketOptions);

    socketRef.current = socket;

    socket.on('connect_error', (error) => {
      setStatus({ type: 'error', message: error.message || 'Realtime connection failed.' });
    });

    socket.on('chat:message:new', async (payload: { threadId: string; message: RawChatMessage }) => {
      if (!payload?.threadId || !payload?.message) return;

      try {
        const threadKey = await ensureThreadKey(payload.threadId);
        const messageMap = new Map<string, ChatMessage>();
        const decrypted = await decryptRawMessage(payload.message, threadKey, messageMap);

        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === payload.threadId
              ? {
                  ...thread,
                  lastActivityAt: decrypted.createdAt,
                  messageCount: (thread.messageCount || 0) + 1,
                  lastMessage: {
                    text: decrypted.text,
                    senderName: decrypted.senderName,
                    createdAt: decrypted.createdAt,
                  },
                }
              : thread,
          ),
        );

        if (payload.threadId === activeThreadIdRef.current) {
          setMessages((prev) => {
            if (prev.some((message) => message.id === decrypted.id)) return prev;
            return [...prev, decrypted];
          });
        }
      } catch (_error) {
        setStatus({ type: 'error', message: 'Failed to decrypt incoming message.' });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, socketUrl]);

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      try {
        const identity = await getOrCreateIdentity();
        identityRef.current = identity;
        await api.put('/api/chat/keys/public', { publicKey: identity.publicKey });

        await Promise.all([refreshThreads(), refreshRequests()]);
      } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message?: string }>;
        setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to load chat.' });
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [api]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    async function loadMessages() {
      try {
        const threadKey = await ensureThreadKey(activeThreadId);
        const response = await api.get(`/api/chat/threads/${activeThreadId}/messages`, { params: { limit: 80 } });
        const incoming = response.data.messages || [];
        const byId = new Map<string, ChatMessage>();
        const nextMessages: ChatMessage[] = [];

        for (const raw of incoming) {
          const decrypted = await decryptRawMessage(raw, threadKey, byId);
          nextMessages.push(decrypted);
        }

        setMessages(nextMessages);
      } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message?: string }>;
        setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to load messages.' });
      }
    }

    loadMessages();
    socketRef.current?.emit('room:join', activeThreadId);
  }, [activeThreadId, api]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function searchByEmail() {
    try {
      const response = await api.get('/api/chat/users/search', { params: { email: requestEmail } });
      const user = response.data.user || null;
      setSearchedUser(user);
      if (!user) {
        setStatus({ type: 'error', message: response.data.message || 'No active customer found for that email.' });
        return;
      }
      if (!user.publicKey) {
        setStatus({
          type: 'warn',
          message: 'User found, but they have not activated secure chat yet. They must sign in once before you can message them.',
        });
        return;
      }
      setStatus({ type: 'success', message: 'User found. You can send your first message request.' });
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setSearchedUser(null);
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'User not found.' });
    }
  }

  async function sendFirstRequest() {
    if (!searchedUser || !firstMessageInput.trim() || requesting) return;
    setRequesting(true);
    try {
      const identity = identityRef.current;
      if (!identity) throw new Error('Encryption identity is not ready');
      if (!searchedUser.publicKey) throw new Error('Recipient public key is unavailable');

      const threadKey = await generateThreadKeyRaw();
      const encryptedPayload = await encryptMessageText(firstMessageInput.trim(), threadKey);
      const myEncryptedKey = await encryptThreadKeyForUser(threadKey, identity.publicKey);
      const recipientEncryptedKey = await encryptThreadKeyForUser(threadKey, searchedUser.publicKey);

      await api.post('/api/chat/requests', {
        recipientEmail: searchedUser.email,
        encryptedPayload,
        participantKeys: [
          { userId: currentUser.id, encryptedKey: myEncryptedKey },
          { userId: searchedUser.id, encryptedKey: recipientEncryptedKey },
        ],
      });

      setFirstMessageInput('');
      setSearchedUser(null);
      setRequestEmail('');
      setStatus({ type: 'success', message: 'Chat request sent. Waiting for recipient approval.' });
      await refreshRequests();
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || (error as Error).message || 'Unable to send request.' });
    } finally {
      setRequesting(false);
    }
  }

  async function acceptIncomingRequest(requestId: string) {
    try {
      const response = await api.post(`/api/chat/requests/${requestId}/accept`);
      const threadId = String(response.data?.threadId || '');
      if (threadId) setActiveThreadId(threadId);
      setStatus({ type: 'success', message: 'Request accepted. Secure chat is now active.' });
      await Promise.all([refreshThreads(), refreshRequests()]);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to accept request.' });
    }
  }

  async function rejectIncomingRequest(requestId: string) {
    try {
      await api.post(`/api/chat/requests/${requestId}/reject`);
      setStatus({ type: 'success', message: 'Request rejected. Sender is blocked from messaging you again.' });
      await refreshRequests();
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to reject request.' });
    }
  }

  async function sendMessage() {
    if (!activeThreadId || !messageInput.trim() || sending) return;

    setSending(true);
    setStatus({ type: '', message: '' });

    try {
      const threadKey = await ensureThreadKey(activeThreadId);
      const encryptedPayload = await encryptMessageText(messageInput.trim(), threadKey);
      const socket = socketRef.current;

      if (!socket || !socket.connected) {
        const response = await api.post(`/api/chat/threads/${activeThreadId}/messages`, {
          encryptedPayload,
          replyToMessageId: replyTo?.id || null,
        });

        const rawCreated = response.data?.message as RawChatMessage;
        if (rawCreated) {
          const map = new Map(messages.map((message) => [message.id, message]));
          const created = await decryptRawMessage(rawCreated, threadKey, map);
          setMessages((prev) => [...prev, created]);
          await refreshThreads();
        }
      } else {
        await new Promise<void>((resolve) => {
          socket.emit(
            'chat:message:send',
            { threadId: activeThreadId, encryptedPayload, replyToMessageId: replyTo?.id || null },
            async (ack: SocketAck) => {
              if (!ack?.ok || !ack.message) {
                setStatus({ type: 'error', message: 'Unable to send message.' });
                resolve();
                return;
              }

              const map = new Map(messages.map((message) => [message.id, message]));
              const created = await decryptRawMessage(ack.message, threadKey, map);
              setMessages((prev) => (prev.some((message) => message.id === created.id) ? prev : [...prev, created]));
              await refreshThreads();
              resolve();
            },
          );
        });
      }

      setMessageInput('');
      setReplyTo(null);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to send message.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="chat-shell">
      <aside className="chat-sidebar card">
        <h3>First Conversation</h3>
        <div className="chat-user-list">
          <input value={requestEmail} onChange={(event) => setRequestEmail(event.target.value)} placeholder="Search customer by email" />
          <button type="button" className="secondary" onClick={searchByEmail} disabled={!requestEmail.trim()}>
            Search
          </button>
          {searchedUser && (
            <div className="request-preview">
              <p>{searchedUser.username} ({searchedUser.email})</p>
              {!searchedUser.publicKey && (
                <p className="status warn">
                  This user hasn't activated secure chat yet. Ask them to sign in once so their
                  device can publish a public key — then you can send your first encrypted request.
                </p>
              )}
              <textarea
                value={firstMessageInput}
                onChange={(event) => setFirstMessageInput(event.target.value)}
                placeholder="Write your first encrypted message"
                rows={3}
                disabled={!searchedUser.publicKey}
              />
              <button
                type="button"
                className="submit"
                onClick={sendFirstRequest}
                disabled={requesting || !firstMessageInput.trim() || !searchedUser.publicKey}
              >
                {requesting ? 'Sending...' : 'Send request'}
              </button>
            </div>
          )}
        </div>

        <h3>Incoming Requests</h3>
        <div className="thread-list">
          {incomingRequests.length === 0 && <p className="empty-state">No pending requests.</p>}
          {incomingRequests.map((request) => (
            <div key={request.id} className="thread-item">
              <strong>{request.requester.username}</strong>
              <span>{request.requester.email}</span>
              <span>{request.preview}</span>
              <div className="admin-actions">
                <button onClick={() => acceptIncomingRequest(request.id)}>Accept</button>
                <button onClick={() => rejectIncomingRequest(request.id)}>Reject</button>
              </div>
            </div>
          ))}
        </div>

        <h3>Outgoing Requests</h3>
        <div className="thread-list">
          {outgoingRequests.length === 0 && <p className="empty-state">No outgoing requests.</p>}
          {outgoingRequests.map((request) => (
            <div key={request.id} className="thread-item">
              <strong>{request.recipient.username}</strong>
              <span>{request.recipient.email}</span>
              <span>Status: {request.status}</span>
            </div>
          ))}
        </div>

        <h3>Active Threads</h3>
        <div className="thread-list">
          {threads.map((thread) => {
            const peer = thread.participants.find((participant) => participant.id !== currentUser?.id);
            return (
              <button
                key={thread.id}
                type="button"
                className={thread.id === activeThreadId ? 'thread-item active' : 'thread-item'}
                onClick={() => setActiveThreadId(thread.id)}
              >
                <strong>{peer?.username || 'Group thread'}</strong>
                <span>{thread.lastMessage?.text || 'No messages yet'}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="chat-main card">
        {!activeThread ? (
          <p className="status">No active chat selected yet. Accept a request or wait for acceptance.</p>
        ) : (
          <>
            <header className="chat-header">
              <div>
                <p className="brand-kicker">True end-to-end encrypted chat</p>
                <h3>
                  {activeThread.participants
                    .filter((participant) => participant.id !== currentUser?.id)
                    .map((participant) => participant.username)
                    .join(', ') || 'Chat'}
                </h3>
              </div>
            </header>

            <section className="chat-messages">
              {messages.map((message) => (
                <article key={message.id} className={message.isOwn ? 'bubble own' : 'bubble'}>
                  <p className="meta">
                    <strong>{message.senderName}</strong>
                    <span>{formatTime(message.createdAt)}</span>
                  </p>
                  {message.replyTo && (
                    <blockquote>
                      <strong>{message.replyTo.senderName}</strong>: {message.replyTo.text}
                    </blockquote>
                  )}
                  <p>{message.text}</p>
                  {!message.replyTo && (
                    <button type="button" className="reply-link" onClick={() => setReplyTo(message)}>
                      Reply
                    </button>
                  )}
                </article>
              ))}
              <div ref={messagesEndRef} />
            </section>

            {replyTo && (
              <div className="reply-banner">
                <span>Replying to {replyTo.senderName}: {replyTo.text}</span>
                <button type="button" className="secondary" onClick={() => setReplyTo(null)}>Cancel</button>
              </div>
            )}

            <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
              <input
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder="Write an end-to-end encrypted message"
                maxLength={2000}
              />
              <button type="submit" className="submit" disabled={sending || !messageInput.trim()}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </>
        )}

        {loading && <p className="status">Loading secure chat...</p>}
        {status.message && <p className={`status ${status.type}`}>{status.message}</p>}
      </main>
    </section>
  );
}

export default ChatPage;
