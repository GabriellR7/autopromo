import { supabase } from './supabase';
import { compressImage } from './image';

export const CHAT_BUCKET = 'chat-attachments';

export type ParticipantRole = 'owner' | 'promoter' | 'buyer';
export type VisitStatus = 'proposed' | 'confirmed' | 'declined' | 'cancelled' | 'completed';

export interface ConversationSummary {
  id: string;
  car_id: string;
  car_public_id: number;
  car_title: string;
  car_city: string | null;
  car_state: string | null;
  car_cover: string | null;
  car_owner_id: string;
  other_id: string;
  other_name: string | null;
  other_avatar: string | null;
  other_role: ParticipantRole;
  promotion_id: string | null;
  contact_unlocked: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread: number;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  attachment_path: string | null;
  masked: boolean;
  read_at: string | null;
  created_at: string;
}

export interface Visit {
  id: string;
  conversation_id: string;
  car_id: string;
  buyer_id: string;
  owner_id: string;
  scheduled_at: string;
  note: string | null;
  status: VisitStatus;
  created_at: string;
  responded_at: string | null;
}

export interface ContactDetails {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export async function startConversation(carId: string, recipientId?: string | null, refCode?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('start_conversation', {
    p_car_id: carId,
    p_recipient_id: recipientId ?? null,
    p_ref_code: refCode ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) throw error;
  return (data ?? []) as ConversationSummary[];
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, attachment_path, masked, read_at, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(conversationId: string, senderId: string, body: string, attachmentPath?: string | null): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() || null, attachment_path: attachmentPath ?? null })
    .select('id, conversation_id, sender_id, body, attachment_path, masked, read_at, created_at')
    .single();
  if (error) throw error;
  return data as Message;
}

export async function uploadChatImage(conversationId: string, file: File): Promise<string> {
  const blob = await compressImage(file, 1400, 0.8);
  const path = `${conversationId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(CHAT_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

const signedCache = new Map<string, { url: string; expires: number }>();

/** Private bucket → short-lived signed URL (cached for 50 minutes). */
export async function chatImageUrl(path: string): Promise<string | null> {
  const hit = signedCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  signedCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

export async function markRead(conversationId: string) {
  await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await supabase.rpc('unread_message_count');
  return Number(data ?? 0);
}

export async function fetchVisits(conversationId: string): Promise<Visit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('id, conversation_id, car_id, buyer_id, owner_id, scheduled_at, note, status, created_at, responded_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Visit[];
}

export async function proposeVisit(conversationId: string, when: Date, note?: string) {
  const { data, error } = await supabase.rpc('propose_visit', {
    p_conversation_id: conversationId,
    p_scheduled_at: when.toISOString(),
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as Visit;
}

export async function respondVisit(visitId: string, action: 'confirm' | 'decline' | 'cancel' | 'complete') {
  const { data, error } = await supabase.rpc('respond_visit', { p_visit_id: visitId, p_action: action });
  if (error) throw error;
  return data as Visit;
}

export async function fetchContactDetails(conversationId: string): Promise<ContactDetails | null> {
  const { data } = await supabase.rpc('get_contact_details', { p_conversation_id: conversationId });
  return (data as ContactDetails | null) ?? null;
}

/**
 * Client-side preview of the server's anti-bypass rule, so we can warn the
 * user before sending. The database applies the real masking.
 */
export function looksLikeContactInfo(text: string) {
  return (
    /[A-Za-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[A-Za-z0-9.-]+\s*(\.|\(dot\)|\[dot\])\s*[A-Za-z]{2,}/i.test(text) ||
    /(https?:\/\/|www\.)\S+/i.test(text) ||
    /\b[A-Za-z0-9-]+\.(com|net|org|io|me|co|us|app|link|ly|gg|info|biz)\b/i.test(text) ||
    /(\+?\d[\s().-]*){7,}\d/.test(text)
  );
}

export const ROLE_LABEL: Record<ParticipantRole, string> = { owner: 'Owner', promoter: 'Promoter', buyer: 'Buyer' };
