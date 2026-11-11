import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, CalendarDays, Check, CheckCheck, ImagePlus, Loader2, Lock, Mail, MessageSquare, Phone, Send, ShieldAlert,
  Unlock, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  ROLE_LABEL, chatImageUrl, fetchContactDetails, fetchConversations, fetchMessages, fetchVisits, looksLikeContactInfo,
  markRead, proposeVisit, respondVisit, sendMessage, uploadChatImage,
  type ContactDetails, type ConversationSummary, type Message, type Visit,
} from '@/lib/chat';
import { cn, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Alert, Avatar, Badge, EmptyState, PageLoader, Skeleton } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { CarImage } from '@/components/cars/CarImage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ReportButton } from '@/components/community/Community';

export default function Messages() {
  useDocumentTitle('Messages');
  const { id } = useParams();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setConversations(await fetchConversations());
    } catch (e) {
      setError((e as Error).message);
      setConversations([]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadList();
    const channel = supabase
      .channel(`inbox-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => loadList())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadList())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadList]);

  const active = conversations?.find((c) => c.id === id) ?? null;

  return (
    <div className="space-y-4">
      <h1 className={cn('text-2xl font-bold', id && 'hidden lg:block')}>Messages</h1>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="grid h-[calc(100vh-12rem)] min-h-[520px] overflow-hidden rounded-xl border bg-card lg:grid-cols-[300px_1fr]">
        {/* Inbox */}
        <aside className={cn('flex min-h-0 flex-col border-r', id && 'hidden lg:flex')}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations === null ? (
              <div className="space-y-2 p-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : conversations.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No messages yet"
                description="Open a car you like and tap “Contact” to start a conversation."
                className="m-3 border-0"
                action={<Button asChild size="sm" variant="outline"><Link to="/cars">Browse cars</Link></Button>}
              />
            ) : (
              conversations.map((c) => (
                <Link
                  key={c.id}
                  to={`/dashboard/messages/${c.id}`}
                  className={cn('flex gap-3 border-b px-3 py-3 transition-colors hover:bg-secondary/60', c.id === id && 'bg-accent hover:bg-accent')}
                >
                  <div className="relative">
                    <Avatar name={c.other_name} src={c.other_avatar} />
                    {c.unread > 0 && (
                      <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                        {c.unread > 9 ? '9+' : c.unread}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('truncate text-sm', c.unread ? 'font-bold' : 'font-semibold')}>{c.other_name ?? 'User'}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.last_message_at ?? c.created_at)}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[c.other_role]} · {c.car_title}</p>
                    <p className={cn('truncate text-xs', c.unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                      {c.last_message_preview ?? 'No messages yet'}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </aside>

        {/* Thread */}
        <section className={cn('min-h-0', !id && 'hidden lg:block')}>
          {!id ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Select a conversation to start chatting.
            </div>
          ) : conversations === null ? (
            <PageLoader />
          ) : active && user ? (
            <Thread key={active.id} conversation={active} userId={user.id} onChanged={loadList} />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState icon={MessageSquare} title="Conversation not found" action={<Button asChild variant="outline"><Link to="/dashboard/messages">Back to inbox</Link></Button>} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* =============================== Thread =============================== */

function Thread({ conversation: c, userId, onChanged }: { conversation: ConversationSummary; userId: string; onChanged: () => void }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [visitOpen, setVisitOpen] = useState(params.get('visit') === '1');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isOwner = userId === c.car_owner_id;
  const canProposeVisit = !isOwner && c.other_role === 'owner';
  const showVisits = c.other_role === 'owner' || (isOwner && c.other_role === 'buyer');

  const loadVisits = useCallback(() => fetchVisits(c.id).then(setVisits).catch(() => undefined), [c.id]);

  useEffect(() => {
    fetchMessages(c.id)
      .then((m) => {
        setMessages(m);
        markRead(c.id).then(() => window.dispatchEvent(new Event('ap:messages-read')));
      })
      .catch((e: Error) => {
        toast.error(e.message);
        setMessages([]);
      });
    loadVisits();

    const channel = supabase
      .channel(`conv-${c.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${c.id}` }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev));
        if (m.sender_id !== userId) markRead(c.id).then(() => window.dispatchEvent(new Event('ap:messages-read')));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${c.id}` }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => prev?.map((x) => (x.id === m.id ? { ...x, read_at: m.read_at } : x)) ?? prev);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: `conversation_id=eq.${c.id}` }, () => {
        loadVisits();
        onChanged();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [c.id, userId, loadVisits, onChanged]);

  useEffect(() => {
    if (c.contact_unlocked) fetchContactDetails(c.id).then(setContact);
  }, [c.id, c.contact_unlocked]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const m = await sendMessage(c.id, userId, body);
      setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev));
      setText('');
      if (m.masked) toast.info('Contact details were hidden. They are shared automatically after a visit is confirmed.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function sendImage(file: File) {
    setUploading(true);
    try {
      const path = await uploadChatImage(c.id, file);
      const m = await sendMessage(c.id, userId, '', path);
      setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const openVisit = visits.find((v) => v.status === 'proposed' || v.status === 'confirmed');
  const lastOwn = useMemo(() => [...(messages ?? [])].reverse().find((m) => m.sender_id === userId), [messages, userId]);
  const warn = !c.contact_unlocked && looksLikeContactInfo(text);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b px-3 py-2.5 sm:px-4">
        <button className="rounded-md p-1.5 hover:bg-secondary lg:hidden" onClick={() => navigate('/dashboard/messages')} aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <Avatar name={c.other_name} src={c.other_avatar} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{c.other_name ?? 'User'} <Badge variant="secondary" className="ml-1">{ROLE_LABEL[c.other_role]}</Badge></p>
          <Link to={`/cars/${c.car_public_id}`} className="truncate text-xs text-muted-foreground hover:text-primary">{c.car_title}</Link>
        </div>
        <ReportButton targetType="user" targetId={c.other_id} label="Report" />
        <CarImage src={c.car_cover} alt="" className="hidden h-10 w-14 rounded-md sm:block" />
      </header>

      {/* Visit / contact banner */}
      {showVisits && (
        <div className="space-y-2 border-b bg-secondary/40 px-3 py-2.5 sm:px-4">
          {openVisit ? (
            <VisitBanner visit={openVisit} isOwner={isOwner} onDone={loadVisits} />
          ) : canProposeVisit ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="size-4" />Ready to see the car in person?</span>
              <Button size="sm" onClick={() => setVisitOpen(true)}>Schedule a visit</Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-4" />The buyer can request a visit from this chat.</p>
          )}
          {c.contact_unlocked ? (
            <ContactCard contact={contact} />
          ) : (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Phone numbers and emails stay hidden until a visit is confirmed.
            </p>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-4">
        {messages === null ? (
          <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Say hi 👋 and ask anything about the car.</p>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender_id === userId;
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            return (
              <div key={m.id}>
                {newDay && (
                  <p className="my-3 text-center text-[11px] font-medium text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                )}
                <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm', mine ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md bg-secondary')}>
                    {m.attachment_path && <ChatImage path={m.attachment_path} />}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    <p className={cn('mt-0.5 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-blue-100' : 'text-muted-foreground')}>
                      {m.masked && <ShieldAlert className="size-3" />}
                      {new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {mine && (m.read_at ? <CheckCheck className="size-3.5" /> : <Check className="size-3.5" />)}
                    </p>
                  </div>
                </div>
                {mine && m.id === lastOwn?.id && m.read_at && (
                  <p className="mt-0.5 text-right text-[10px] text-muted-foreground">Seen</p>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form onSubmit={send} className="border-t p-2.5 sm:p-3">
        {warn && (
          <p className="mb-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            <ShieldAlert className="size-3.5 shrink-0" />
            For your safety, contact details are shared after a visit is scheduled. They'll be hidden from this message.
          </p>
        )}
        <div className="flex items-end gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Send a photo">
            {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) sendImage(f);
              e.target.value = '';
            }}
          />
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            onKeyDown={onKeyDown}
            placeholder="Write a message…"
            rows={1}
            className="max-h-32 min-h-[40px] flex-1 resize-none py-2.5"
          />
          <Button type="submit" size="icon" disabled={!text.trim() || sending} aria-label="Send">
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
      </form>

      <ProposeVisitDialog
        open={visitOpen}
        conversationId={c.id}
        onClose={() => {
          setVisitOpen(false);
          if (params.get('visit')) {
            params.delete('visit');
            setParams(params, { replace: true });
          }
        }}
        onDone={loadVisits}
      />
    </div>
  );
}

function ChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    chatImageUrl(path).then(setUrl);
  }, [path]);
  if (!url) return <div className="mb-1 h-40 w-56 animate-pulse rounded-lg bg-black/10" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mb-1 block">
      <img src={url} alt="Shared photo" className="max-h-64 rounded-lg object-cover" />
    </a>
  );
}

function ContactCard({ contact }: { contact: ContactDetails | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm">
      <span className="flex items-center gap-1.5 font-medium text-success"><Unlock className="size-4" /> Contact shared</span>
      {contact?.phone ? (
        <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-1.5 hover:underline"><Phone className="size-3.5" />{contact.phone}</a>
      ) : (
        <span className="flex items-center gap-1.5 text-muted-foreground"><Phone className="size-3.5" />No phone added</span>
      )}
      {contact?.email && (
        <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 hover:underline"><Mail className="size-3.5" />{contact.email}</a>
      )}
    </div>
  );
}

function VisitBanner({ visit, isOwner, onDone }: { visit: Visit; isOwner: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const when = new Date(visit.scheduled_at);
  const label = when.toLocaleString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  async function act(action: 'confirm' | 'decline' | 'cancel' | 'complete') {
    if (action === 'cancel' && !window.confirm('Cancel this visit?')) return;
    setBusy(true);
    try {
      await respondVisit(visit.id, action);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-4 text-primary" />
        <span>
          <strong>{visit.status === 'confirmed' ? 'Visit confirmed' : 'Visit requested'}</strong> · {label}
          {visit.note && <span className="text-muted-foreground"> · “{visit.note}”</span>}
        </span>
      </div>
      <div className="flex gap-2">
        {visit.status === 'proposed' && isOwner && (
          <>
            <Button size="sm" onClick={() => act('confirm')} loading={busy}><Check /> Confirm</Button>
            <Button size="sm" variant="outline" onClick={() => act('decline')} disabled={busy}><X /> Decline</Button>
          </>
        )}
        {visit.status === 'confirmed' && isOwner && when < new Date() && (
          <Button size="sm" variant="outline" onClick={() => act('complete')} disabled={busy}>Mark as completed</Button>
        )}
        {(visit.status === 'confirmed' || (visit.status === 'proposed' && !isOwner)) && (
          <Button size="sm" variant="ghost" onClick={() => act('cancel')} disabled={busy}>Cancel</Button>
        )}
      </div>
    </div>
  );
}

function ProposeVisitDialog({ open, conversationId, onClose, onDone }: {
  open: boolean;
  conversationId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const [date, setDate] = useState(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`);
  const [time, setTime] = useState('10:00');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const when = new Date(`${date}T${time}`);
    if (Number.isNaN(when.getTime())) return setError('Pick a valid date and time.');
    setSaving(true);
    setError(null);
    try {
      await proposeVisit(conversationId, when, note);
      toast.success('Visit request sent to the owner');
      setNote('');
      onDone();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Schedule a visit" description="Suggest a day and time. The owner confirms, and then you both get each other's contact details.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="v-date">
            <Input id="v-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Time" htmlFor="v-time">
            <Input id="v-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="v-note">
          <Textarea id="v-note" rows={3} value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="e.g. I'd like to bring my mechanic for a quick inspection." />
        </Field>
        <p className="text-xs text-muted-foreground">Times are shown in your device's time zone. Meet in a safe, public place.</p>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Send request</Button>
        </div>
      </form>
    </Dialog>
  );
}
