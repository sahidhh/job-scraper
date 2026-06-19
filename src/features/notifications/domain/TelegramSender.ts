// Port for sending Telegram alerts (scoring.md §4). Implemented by
// TelegramBotSender in infrastructure.

// A URL button opens the given URL in Telegram's in-app browser.
// A callback_data button sends a callback_query update to the bot webhook.
export type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; callback_data: string };

export interface TelegramSender {
  sendMessage(text: string): Promise<void>;
  sendMessageWithButtons(text: string, buttons: InlineKeyboardButton[][]): Promise<void>;
}
