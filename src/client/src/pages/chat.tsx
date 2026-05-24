import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  publicKey?: string | null;
  keyExchangePublicKey?: string | null;
};

type RawChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  clientMessageId?: string | null;
  encryptedPayload: {
    ciphertext: string;
    iv: string;
    authTag: string;
    algorithm: string;
  };
  isOwn: boolean;
  createdAt: string;
  readAt?: string | null;
  expiresAt?: string | null;
  deleteAfterReadSeconds?: number | null;
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
  clientMessageId?: string | null;
  text: string;
  isOwn: boolean;
  createdAt: string;
  readAt?: string | null;
  expiresAt?: string | null;
  deleteAfterReadSeconds?: number | null;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  } | null;
};

type ChatThread = {
  id: string;
  threadType: string;
  name?: string | null;
  participants: ThreadParticipant[];
  lastActivityAt: string;
  messageCount: number;
  lastMessage?: {
    text: string;
    senderName: string;
    createdAt: string;
    encryptedPayload?: {
      ciphertext: string;
      iv: string;
      authTag: string;
      algorithm: string;
    } | null;
  } | null;
};

type SearchedUser = {
  id: string;
  username: string;
  email: string;
  publicKey?: string | null;
  keyExchangePublicKey?: string | null;
};

type IncomingRequest = {
  id: string;
  requester: {
    id: string;
    username: string;
    email: string;
    publicKey?: string | null;
    keyExchangePublicKey?: string | null;
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

function sortMessages(messages: ChatMessage[]) {
  return [...messages].sort((a, b) => {
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });
}

function mergeLoadedMessages(previous: ChatMessage[], loaded: ChatMessage[]) {
  const byId = new Map<string, ChatMessage>();

  previous.forEach((message) => {
    byId.set(message.id, message);
  });

  loaded.forEach((message) => {
    byId.set(message.id, message);
  });

  return sortMessages(Array.from(byId.values()));
}

function reconcileSentMessage(previous: ChatMessage[], clientMessageId: string, created: ChatMessage) {
  const next = previous.filter(
    (message) => message.id !== created.id && message.clientMessageId !== clientMessageId,
  );

  return sortMessages([
    ...next,
    {
      ...created,
      clientMessageId,
    },
  ]);
}

function ChatPage() {
  const api = useMemo(() => createApiClient(), []);
  const socketUrl = import.meta.env.VITE_SOCKET_URL || '';
  const token = localStorage.getItem('secureChatToken') || '';
  const [searchParams] = useSearchParams();
  const currentUser = useMemo(() => {
    const raw = localStorage.getItem('secureChatUser');
    return raw ? JSON.parse(raw) : null;
  }, []);

  const socketRef = useRef<Socket | null>(null);
  const activeThreadIdRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const expiryTimersRef = useRef<Map<string, number>>(new Map());
  const threadKeysRef = useRef<Map<string, string>>(new Map());
  const identityRef = useRef<{
    publicKey: string;
    privateKeyJwk: JsonWebKey;
    keyExchangePublicKey: string;
    keyExchangePrivateKeyJwk: JsonWebKey;
  } | null>(null);

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [deleteMenuFor, setDeleteMenuFor] = useState<string | null>(null);
  const [requestEmail, setRequestEmail] = useState('');
  const [firstMessageInput, setFirstMessageInput] = useState('');
  const [searchedUser, setSearchedUser] = useState<SearchedUser | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<Array<IncomingRequest & { preview: string }>>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequest[]>([]);
  const [deleteAfterReadSeconds, setDeleteAfterReadSeconds] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
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

    let threadKey = '';
    try {
      threadKey = await decryptThreadKeyForUser(encryptedKey, identity);
    } catch (error) {
      if (currentUser?.publicKey && currentUser.publicKey !== identity.publicKey) {
        throw new Error('This browser does not have this account encryption key. Sign in from the browser that activated secure chat for this account, or reset the account chat key.');
      }
      throw error;
    }
    threadKeysRef.current.set(threadId, threadKey);
    return threadKey;
  }

  function scheduleMessageExpiry(messageId: string, expiresAt: string | null | undefined) {
    if (!expiresAt) return;

    const existing = expiryTimersRef.current.get(messageId);
    if (existing) {
      window.clearTimeout(existing);
    }

    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
      return;
    }

    const timer = window.setTimeout(() => {
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
      expiryTimersRef.current.delete(messageId);
    }, ms);

    expiryTimersRef.current.set(messageId, timer);
  }

  async function markAsRead(threadId: string, messageId: string) {
    try {
      const response = await api.post(`/api/chat/threads/${threadId}/messages/${messageId}/read`);
      const expiresAt = response.data?.expiresAt || null;
      if (expiresAt) {
        scheduleMessageExpiry(messageId, expiresAt);
        setMessages((prev) => prev.map((message) => (
          message.id === messageId ? { ...message, readAt: response.data?.readAt || message.readAt, expiresAt } : message
        )));
      }
      window.dispatchEvent(new Event('securechat-notifications-changed'));
    } catch (_error) {
      // Non-fatal: read receipts should not interrupt chat rendering.
    }
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
      isOwn: String(rawMessage.senderId) === String(currentUser?.id),
      createdAt: rawMessage.createdAt,
      readAt: rawMessage.readAt || null,
      expiresAt: rawMessage.expiresAt || null,
      deleteAfterReadSeconds: rawMessage.deleteAfterReadSeconds || null,
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

  async function decryptThreadPreviews(rawThreads: ChatThread[]): Promise<ChatThread[]> {
    return Promise.all(
      rawThreads.map(async (thread) => {
        const ep = thread.lastMessage?.encryptedPayload;
        if (!ep) return thread;
        try {
          const threadKey = await ensureThreadKey(thread.id);
          const text = await decryptMessageText(ep, threadKey);
          return { ...thread, lastMessage: { ...thread.lastMessage!, text, encryptedPayload: null } };
        } catch {
          return { ...thread, lastMessage: { ...thread.lastMessage!, text: '', encryptedPayload: null } };
        }
      }),
    );
  }

  async function refreshThreads(overrideThreadId?: string) {
    const response = await api.get('/api/chat/threads');
    const rawThreads = response.data.threads || [];
    const nextThreads = await decryptThreadPreviews(rawThreads);
    setThreads(nextThreads);
    socketRef.current?.emit('threads:join-all');
    // Prefer explicit override (from URL param); do not auto-select first thread.
    const target = overrideThreadId || searchParams.get('thread') || '';
    if (target && nextThreads.some((t: ChatThread) => t.id === target)) {
      setActiveThreadId(target);
    }
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
          const threadKey = await decryptThreadKeyForUser(encryptedKeyForMe.encryptedKey, identity);
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

    socket.on('connect', () => {
      socket.emit('threads:join-all');
      setStatus((prev) => (prev.message === 'Realtime connection failed.' ? { type: '', message: '' } : prev));
    });

    socket.on('connect_error', (error) => {
      setStatus({ type: 'error', message: error.message || 'Realtime connection failed.' });
    });

    socket.on('chat:message:new', async (payload: { threadId: string; message: RawChatMessage }) => {
      if (!payload?.threadId || !payload?.message) return;

      try {
        const threadKey = await ensureThreadKey(payload.threadId);
        const messageMap = new Map<string, ChatMessage>();
        const decrypted = await decryptRawMessage(payload.message, threadKey, messageMap);

        const clientMessageId = payload.message.clientMessageId || null;

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
            if (clientMessageId) {
              const reconciled = reconcileSentMessage(prev, clientMessageId, decrypted);
              return reconciled;
            }

            if (prev.some((message) => message.id === decrypted.id)) return prev;
            return sortMessages([...prev, decrypted]);
          });

          if (!decrypted.isOwn) {
            await markAsRead(payload.threadId, decrypted.id);
          }
        }
      } catch (_error) {
        setStatus({ type: 'error', message: 'Failed to decrypt incoming message.' });
      }
    });

    socket.on('chat:message:deleted', (payload: { messageId: string }) => {
      if (!payload?.messageId) return;
      setMessages((prev) => prev.filter((message) => message.id !== payload.messageId));
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
        try {
          const keyResp = await api.put('/api/chat/keys/public', {
            publicKey: identity.publicKey,
            keyExchangePublicKey: identity.keyExchangePublicKey,
          });
          if (!keyResp.data?.skipped) {
            // Keys were accepted (first registration or same key re-confirmed).
            // Update the cached user so the mismatch check in ensureThreadKey()
            // sees the correct registered public key on subsequent decryptions.
            if (currentUser) {
              localStorage.setItem('secureChatUser', JSON.stringify({
                ...currentUser,
                publicKey: identity.publicKey,
                keyExchangePublicKey: identity.keyExchangePublicKey,
              }));
            }
          }
          // If skipped: the server already has a different key registered.
          // ensureThreadKey() will catch the mismatch and surface the message:
          // "This browser does not have this account encryption key..."
        } catch {
          // Non-fatal: thread loading continues. Key will be retried next bootstrap.
        }

        const urlThread = searchParams.get('thread') || '';
        await Promise.all([refreshThreads(urlThread), refreshRequests()]);
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
    return () => {
      expiryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      expiryTimersRef.current.clear();
    };
  }, []);

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

        setMessages((prev) => mergeLoadedMessages(prev, nextMessages));

        nextMessages.forEach((message) => {
          if (message.expiresAt) {
            scheduleMessageExpiry(message.id, message.expiresAt);
          }
        });

        await Promise.all(
          nextMessages
            .filter((message) => !message.isOwn && !message.readAt)
            .map((message) => markAsRead(activeThreadId, message.id)),
        );
      } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message?: string }>;
        setStatus({ type: 'error', message: axiosError.response?.data?.message || (error as Error).message || 'Unable to load messages.' });
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
        setStatus({ type: 'error', message: response.data.message || 'No active user found for that email.' });
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
      const myEncryptedKey = await encryptThreadKeyForUser(
        threadKey,
        identity.publicKey,
        identity.keyExchangePublicKey,
        identity,
      );
      const recipientEncryptedKey = await encryptThreadKeyForUser(
        threadKey,
        searchedUser.publicKey,
        searchedUser.keyExchangePublicKey || null,
        identity,
      );

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
      setShowNewChat(false);
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
      window.dispatchEvent(new Event('securechat-notifications-changed'));
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
      window.dispatchEvent(new Event('securechat-notifications-changed'));
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to reject request.' });
    }
  }

  async function handleDeleteMessage(messageId: string, deleteFor: 'me' | 'everyone') {
    setDeleteMenuFor(null);
    // Optimistically remove from local state
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await api.delete(`/api/chat/threads/${activeThreadId}/messages/${messageId}`, {
        data: { deleteFor },
      });
      // For 'everyone', the server emits chat:message:deleted via socket to other clients.
      // For 'me', no broadcast needed — already removed locally.
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to delete message.' });
    }
  }

  async function sendMessage() {
    if (!activeThreadId || !messageInput.trim() || sending) return;

    setSending(true);
    setStatus({ type: '', message: '' });

    const clientMessageId = crypto.randomUUID();
    const draftText = messageInput.trim();
    const draftCreatedAt = new Date().toISOString();
    const optimisticMessage: ChatMessage = {
      id: clientMessageId,
      clientMessageId,
      threadId: activeThreadId,
      senderId: currentUser?.id || '',
      senderName: currentUser?.username || 'You',
      text: draftText,
      isOwn: true,
      createdAt: draftCreatedAt,
      deleteAfterReadSeconds: deleteAfterReadSeconds === '' ? null : Number(deleteAfterReadSeconds),
      replyTo: replyTo
        ? {
            id: replyTo.id,
            senderName: replyTo.senderName,
            text: replyTo.text,
          }
        : null,
    };

    setMessages((prev) => sortMessages([...prev, optimisticMessage]));

    try {
      const threadKey = await ensureThreadKey(activeThreadId);
      const encryptedPayload = await encryptMessageText(draftText, threadKey);
      const socket = socketRef.current;

      if (!socket || !socket.connected) {
        const response = await api.post(`/api/chat/threads/${activeThreadId}/messages`, {
          encryptedPayload,
          replyToMessageId: replyTo?.id || null,
          clientMessageId,
          deleteAfterReadSeconds: deleteAfterReadSeconds === '' ? null : Number(deleteAfterReadSeconds),
        });

        const rawCreated = response.data?.message as RawChatMessage;
        if (rawCreated) {
          const map = new Map(messages.map((message) => [message.id, message]));
          const created = await decryptRawMessage(rawCreated, threadKey, map);
          setMessages((prev) => reconcileSentMessage(prev, clientMessageId, created));
          await refreshThreads();
        }
      } else {
        await new Promise<void>((resolve) => {
          socket.emit(
            'chat:message:send',
            {
              threadId: activeThreadId,
              encryptedPayload,
              replyToMessageId: replyTo?.id || null,
              clientMessageId,
              deleteAfterReadSeconds: deleteAfterReadSeconds === '' ? null : Number(deleteAfterReadSeconds),
            },
            async (ack: SocketAck) => {
              if (!ack?.ok || !ack.message) {
                setStatus({ type: 'error', message: 'Unable to send message.' });
                setMessages((prev) => prev.filter((message) => message.clientMessageId !== clientMessageId));
                resolve();
                return;
              }

              const map = new Map(messages.map((message) => [message.id, message]));
              const created = await decryptRawMessage(ack.message, threadKey, map);
              setMessages((prev) => reconcileSentMessage(prev, clientMessageId, created));
              await refreshThreads();
              resolve();
            },
          );
        });
      }

      setMessageInput('');
      setReplyTo(null);
    } catch (error: unknown) {
      setMessages((prev) => prev.filter((message) => message.clientMessageId !== clientMessageId));
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to send message.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="chat-shell">
      <aside className="chat-sidebar card">
        <section className="chat-sidebar-section">
          <div className="chat-sidebar-heading">
            <h3>Recent Chats</h3>
            <span>{threads.length}</span>
          </div>
          <div className="thread-list">
            {threads.length === 0 && <p className="empty-state">No active chats yet.</p>}
            {threads.map((thread) => {
              const peer = thread.participants.find((participant) => participant.id !== currentUser?.id);
              return (
                <button
                  key={thread.id}
                  type="button"
                  className={thread.id === activeThreadId && !showNewChat ? 'thread-item active' : 'thread-item'}
                  onClick={() => { setActiveThreadId(thread.id); setShowNewChat(false); }}
                >
                  <span className={thread.threadType === 'group' ? 'thread-avatar thread-avatar-group' : 'thread-avatar thread-avatar-direct'}>
                    {thread.threadType === 'group' ? '👥' : '👤'}
                  </span>
                  <div className="thread-item-info">
                    <strong>{thread.threadType === 'group' ? (thread.name || 'Group thread') : (peer?.username || 'Direct thread')}</strong>
                    <span>{thread.lastMessage?.text || 'No messages yet'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {(incomingRequests.length > 0 || outgoingRequests.some((r) => r.status !== 'accepted')) && (
          <section className="chat-sidebar-section">
            <div className="chat-sidebar-heading">
              <h3>Requests</h3>
              <span>{incomingRequests.length + outgoingRequests.filter((r) => r.status !== 'accepted').length}</span>
            </div>
            <div className="thread-list">
              {incomingRequests.map((request) => (
                <div key={request.id} className="thread-item request-item">
                  <strong>{request.requester.username}</strong>
                  <span>{request.preview}</span>
                  <div className="chat-request-actions">
                    <button onClick={() => acceptIncomingRequest(request.id)}>Accept</button>
                    <button onClick={() => rejectIncomingRequest(request.id)}>Reject</button>
                  </div>
                </div>
              ))}
              {outgoingRequests
                .filter((r) => r.status !== 'accepted')
                .map((request) => (
                  <div key={request.id} className="thread-item request-item">
                    <strong>{request.recipient.username}</strong>
                    <span className={`request-status-badge request-status-${request.status}`}>
                      {request.status === 'pending' ? 'Pending approval' : 'Request rejected'}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        )}

      </aside>

      <main className="chat-main card">
        {showNewChat ? (
          <>
            <header className="chat-header">
              <div>
                <h3>New Direct Chat</h3>
                <p className="brand-kicker">Search for a user and send your first encrypted message</p>
              </div>
              <button
                type="button"
                className="secondary chat-new-cancel"
                onClick={() => { setShowNewChat(false); setSearchedUser(null); setRequestEmail(''); setFirstMessageInput(''); }}
              >
                ✕ Cancel
              </button>
            </header>

            <div className="chat-new-form">
              {status.message && <p className={`status ${status.type}`}>{status.message}</p>}
              <div className="chat-search-row">
                <input
                  value={requestEmail}
                  onChange={(event) => setRequestEmail(event.target.value)}
                  placeholder="Enter user email address"
                  onKeyDown={(e) => { if (e.key === 'Enter') searchByEmail(); }}
                />
                <button type="button" className="secondary" onClick={searchByEmail} disabled={!requestEmail.trim()}>
                  Search
                </button>
              </div>

              {searchedUser && (() => {
                const existingOutgoing = outgoingRequests.find(
                  (req) => String(req.recipient.id) === String(searchedUser.id),
                );
                const isPending = existingOutgoing?.status === 'pending';
                const isBlocked =
                  existingOutgoing?.status === 'rejected' && existingOutgoing.lockAfterRejection;
                const wasRejected =
                  existingOutgoing?.status === 'rejected' && !existingOutgoing.lockAfterRejection;
                const canSend = !isPending && !isBlocked && !!searchedUser.publicKey;

                return (
                  <div className="request-preview">
                    <p><strong>{searchedUser.username}</strong> — {searchedUser.email}</p>
                    {!searchedUser.publicKey && (
                      <p className="status warn">This user needs to sign in once before you can send an encrypted request.</p>
                    )}
                    {isPending && (
                      <p className="status warn">Request already sent — waiting for {searchedUser.username} to accept.</p>
                    )}
                    {isBlocked && (
                      <p className="status error">{searchedUser.username} rejected your request. You cannot message this user again.</p>
                    )}
                    {wasRejected && (
                      <p className="status warn">Your previous request was rejected. You may send a new one.</p>
                    )}
                    <textarea
                      value={firstMessageInput}
                      onChange={(event) => setFirstMessageInput(event.target.value)}
                      placeholder="Write your first message…"
                      rows={4}
                      disabled={!canSend}
                    />
                    <button
                      type="button"
                      className="submit"
                      onClick={sendFirstRequest}
                      disabled={requesting || !firstMessageInput.trim() || !canSend}
                    >
                      {requesting ? 'Sending...' : 'Send chat request'}
                    </button>
                  </div>
                );
              })()}
            </div>
          </>
        ) : !activeThread ? (
          <div className="chat-landing">
            <div className="chat-landing-icon">💬</div>
            <h3>Secure Conversations</h3>
            <p>Select a chat from the sidebar or start a new end-to-end encrypted conversation.</p>
            <button
              type="button"
              className="chat-landing-btn"
              onClick={() => { setShowNewChat(true); setStatus({ type: '', message: '' }); setSearchedUser(null); setRequestEmail(''); setFirstMessageInput(''); }}
            >
              + Create New Chat
            </button>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <div>
                <h3>
                  {activeThread.threadType === 'group'
                    ? (activeThread.name || 'Encrypted Group')
                    : (activeThread.participants
                      .filter((participant) => participant.id !== currentUser?.id)
                      .map((participant) => participant.username)
                      .join(', ') || 'Chat')}
                </h3>
              </div>
            </header>

            <section className="chat-messages" onClick={() => setDeleteMenuFor(null)}>
              {messages.map((message) => (
                <article key={message.id} className={message.isOwn ? 'bubble own' : 'bubble'}>
                  <div className="meta">
                    <strong>{message.senderName}</strong>
                    <span>{formatTime(message.createdAt)}</span>
                    <span className="bubble-actions">
                      <button
                        type="button"
                        className="reply-link"
                        onClick={(e) => { e.stopPropagation(); setReplyTo(message); }}
                      >
                        Reply
                      </button>
                      <span className="msg-delete-wrap">
                        <button
                          type="button"
                          className="reply-link delete-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteMenuFor((prev) => (prev === message.id ? null : message.id));
                          }}
                          aria-label="Delete message"
                        >
                          ✕
                        </button>
                        {deleteMenuFor === message.id && (
                          <div className="msg-delete-menu" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(message.id, 'me')}
                            >
                              Only for Me
                            </button>
                            {message.isOwn && (
                              <button
                                type="button"
                                onClick={() => handleDeleteMessage(message.id, 'everyone')}
                              >
                                For Everyone
                              </button>
                            )}
                          </div>
                        )}
                      </span>
                    </span>
                  </div>
                  {message.replyTo && (
                    <blockquote>
                      <strong>{message.replyTo.senderName}</strong>: {message.replyTo.text}
                    </blockquote>
                  )}
                  <p>{message.text}</p>
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
              <select
                className="chat-retention-select"
                value={deleteAfterReadSeconds}
                onChange={(event) => {
                  const value = event.target.value;
                  setDeleteAfterReadSeconds(value ? Number(value) : '');
                }}
                aria-label="Ephemeral mode"
              >
                <option value="">Keep message</option>
                <option value="10">Delete 10s after read</option>
                <option value="30">Delete 30s after read</option>
                <option value="60">Delete 60s after read</option>
                <option value="300">Delete 5m after read</option>
              </select>
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
