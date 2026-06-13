// Port for sending the Telegram alert (scoring.md §4). Implemented by a
// Telegram Bot API adapter in infrastructure.
export interface TelegramSender {
  sendMessage(text: string): Promise<void>;
}
