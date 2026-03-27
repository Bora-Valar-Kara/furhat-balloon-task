// Types
export type Message = { // LLM dialogue structure. The system will constantly change between these roles at each turn.
  role: "assistant" | "user" | "system"; // system is a sole actor. Assistant is the LLM. User is us.
  content: string;
};

export interface DMContext { // Our regular DMContext types.
  lastResult: string;
  messages: Message[];
  interventions: Manipulation[];
  isFirstMessage: boolean; // If the message is the first message.
  pendingManipulation: string | null; // Stores the manipulation phrase to add to next assistant turn
  keyPressed: string | null; // Stores which key was pressed
  userSpeechBuffer: string[]; // NEW: Accumulates user utterances before processing
}

export type Manipulation = {
  audioUri: string | undefined;
  text: string | undefined;
}
