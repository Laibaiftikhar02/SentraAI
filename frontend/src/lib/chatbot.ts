/**
 * Chatbot API types and helper functions.
 */
import { api } from "./api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: "user" | "bot";
  content: string;
}

export interface ExtractedFields {
  title: string | null;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  zone_id: string | null;
  zone_name: string | null;
}

export interface ChatbotParseResponse {
  bot_message: string;
  fields: ExtractedFields;
  status: "conversing" | "ready";
  suggestions: string[];
}

// ── API Functions ────────────────────────────────────────────────────────────

export async function parseChatbotMessage(
  message: string,
  conversation: ConversationMessage[],
  extractedFields: Record<string, unknown>
): Promise<ChatbotParseResponse> {
  return api.post<ChatbotParseResponse>("/chatbot/parse", {
    message,
    conversation,
    extracted_fields: extractedFields,
  });
}
