export type ParsedChatMessage = {
  date: string;
  time: string;
  sender: string;
  message: string;
  messageAt?: Date;
};
