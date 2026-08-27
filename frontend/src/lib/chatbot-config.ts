/**
 * Chatbot configuration — predefined knowledge and UI constants.
 *
 * This provides the chatbot with context about SentraAI without
 * requiring any external AI model or training.
 */

// Initial greeting shown when the chatbot opens
export const CHATBOT_GREETING =
  "Hi! I'm your AI reporting assistant. Tell me about the issue you're facing in simple words — English, Urdu, or Roman Urdu, whatever you prefer!\n\n" +
  "For example: \"Hostel mein pani nahi aa raha\" or \"AC kharab hai\" or \"washroom bohat ganda hai\"";

// Maximum number of conversation turns before auto-presenting preview
export const MAX_CONVERSATION_TURNS = 3;

// Error messages
export const CHATBOT_ERROR_MESSAGE =
  "Sorry, I encountered an error while processing your message. Please try again.";

export const SUBMISSION_ERROR_MESSAGE =
  "Your issue could not be submitted. Please try again or use the manual reporting form.";

// Success message
export const SUBMISSION_SUCCESS_MESSAGE =
  "Your issue has been submitted successfully! The SentraAI system will now process it — classifying, assessing urgency, checking for duplicates, and routing it to the right department.";

// Chatbot identity
export const CHATBOT_NAME = "AI Assistant";
