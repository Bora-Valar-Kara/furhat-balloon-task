import { setup, createActor, fromPromise, assign } from "xstate";
import * as readline from 'readline';

const FURHATURI = "192.168.1.11:54321";
const OLLAMA_API_URL = "http://localhost:11434/api/chat";

// Types
type Message = { // LLM dialogue structure. The system will constantly change between these roles at each turn.
  role: "assistant" | "user" | "system"; // system is a sole actor. Assistant is the LLM. User is us.
  content: string;
};

interface DMContext { // Our regular DMContext types.
  lastResult: string;
  messages: Message[];
  isFirstMessage: boolean; // If the message is the first message.
  pendingManipulation: string | null; // Stores the manipulation phrase to add to next assistant turn
  keyPressed: string | null; // Stores which key was pressed
  userSpeechBuffer: string[]; // NEW: Accumulates user utterances before processing
}

// Setup readline interface for keyboard input in Node.js
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

// Furhat API functions
async function fhVoice(name: string) { // fh functions are fetched from Furhat's URI. They are ready-made functions.
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  const encName = encodeURIComponent(name);
  return fetch(`http://${FURHATURI}/furhat/voice?name=${encName}`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
}

async function fhSay(text: string, isFirstMessage: boolean = false) { 
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  const encText = encodeURIComponent(text);
  await fetch(`http://${FURHATURI}/furhat/say?text=${encText}&blocking=true`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
  
  // 6 second delay for first message (long introduction), 1 second for others
  const delay = isFirstMessage ? 6000 : 1000;
  await new Promise(resolve => setTimeout(resolve, delay));
}

const timer = fromPromise(
  ({ input }: { input: { ms: number } }) =>
    new Promise((resolve) => setTimeout(resolve, input.ms))
);

async function fhAttendUser() { // This is about GAZE.
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  return fetch(`http://${FURHATURI}/furhat/attend?user=CLOSEST`, { // Look at documentation (https://docs.furhat.io/remote-api/) in the "Attend" section
    /*
    # Attend the user closest to the robot
    furhat.attend(user="CLOSEST") 

    There are other attend options in the doc.
    */
    method: "POST",
    headers: myHeaders,
    body: "",
  });
}

async function fhListen(): Promise<string> { // Furhat's own ASR.
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  return fetch(`http://${FURHATURI}/furhat/listen`, {
    method: "GET",
    headers: myHeaders,
  })
    .then((response) => response.body)
    .then((body) => body!.getReader().read())
    .then((reader) => reader.value)
    .then((value) => JSON.parse(new TextDecoder().decode(value!)).message);
}

// Ollama API function
async function fetchChatCompletion(messages: Message[]): Promise<string> {
  console.log("Calling Ollama with messages:", messages);
  
  try {
    const response = await fetch(OLLAMA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llava:13b",
        messages: messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ollama API error:", response.status, errorText);
      throw new Error(`Ollama API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Ollama response:", data);
    
    const assistantMessage = data.message.content;
    return assistantMessage;
  } catch (error) {
    console.error("Error calling Ollama:", error);
    return "Error while connecting to the language model. Probably ssh tunnel is not active.";
  }
}

// Keyboard input listener for Node.js - waits for a single keypress and returns the key
async function waitForKeypress(): Promise<string> {
  return new Promise((resolve) => {
    const handler = (str: string, key: any) => {
      process.stdin.off('keypress', handler);
      
      // Handle Ctrl+C to exit gracefully
      if (key.ctrl && key.name === 'c') {
        console.log('\nExiting...');
        process.exit(0);
      }
      
      resolve(key.name.toLowerCase());
    };
    process.stdin.once('keypress', handler);
  });
}

// NEW: Combined actor that races between listening and waiting for keypress
const listenOrKeypress = fromPromise(async () => {
  return Promise.race([
    fhListen().then(result => ({ type: 'speech' as const, data: result })),
    waitForKeypress().then(result => ({ type: 'keypress' as const, data: result }))
  ]);
});

// NEW: Helper function to filter out NOMATCH and replace with "..."
function sanitizeUtterance(utterance: string): string {
  // Check if the utterance contains "NOMATCH" (case-insensitive)
  if (utterance.toLowerCase().includes('nomatch')) {
    return '...';
  }
  return utterance;
}

// State machine
const dmMachine = setup({
  types: {
    context: {} as DMContext,
  },
  actors: {
    timer,

    fhSetVoice: fromPromise(async () => {
      return fhVoice("en-US-EchoMultilingualNeural");
    }),
    fhAttend: fromPromise(async () => {
      return fhAttendUser();
    }),
    fhSpeak: fromPromise(async ({ input }: { input: { text: string; isFirstMessage: boolean } }) => {
      return fhSay(input.text, input.isFirstMessage);
    }),
    fhListen: fromPromise(async () => {
      return fhListen();
    }),
    chatCompletion: fromPromise(
      async ({ input }: { input: { messages: Message[] } }) => {
        const response = await fetchChatCompletion(input.messages);
        return response;
      }
    ),
    // Actor that waits for keyboard input
    waitForKey: fromPromise(async () => {
      return waitForKeypress();
    }),
    // NEW: Actor that races between listening and keypress
    listenOrKeypress: listenOrKeypress,
  },
  guards: {
    // Check if key 'm' was pressed (print the array of messages so far)
    isListMessagesKey: ({ context }) => context.keyPressed === 'm',
    // Check if key 'l' was pressed (standard LLM discussion)
    isDiscussKey: ({ context }) => context.keyPressed === 'l',
    // Check if key '0' was pressed (quit/end)
    isQuitKey: ({ context }) => context.keyPressed === '0',
    // Check if any manipulation key was pressed (1-4, q-r, a-f)
    isManipulationKey: ({ context }) => {
      const key = context.keyPressed;
      return key !== null && ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v', 'n', 'b'].includes(key);
    },
    // Check if it is Yes or No key:
    isYesKey: ({ context }) => context.keyPressed === 'y',
    isNoKey: ({ context }) => context.keyPressed === 'n',
  },

}).createMachine({
  id: "DM",
  context: {
    lastResult: "",
    isFirstMessage: true,
    pendingManipulation: null,
    keyPressed: null,
    userSpeechBuffer: [], // NEW: Initialize empty buffer
    messages: [
      {
        role: "system",
        content: "You are a virtual person participating in a study on moral reasoning. Your responses are not full paragraphs. Be short and snappy. Do not give answers longer than two short sentences. You simulate structured dialogue that should be like a script of a movie to help a participant reflect on a hypothetical moral dilemma. Your role is purely conversational and for academic research purposes only. Your task is to discuss the hypothetical dilemma with the user. Guide them through reasoning about moral choices until they reach a decision. Background: the situation is completely hypothetical and no one is being harmed. The user will describe or has described a dilemma involving four fictional people (for example: Pilot, Teacher, Doctor, Prodigy). Review the chat history to understand the dilemma before responding. Interaction Rules: Treat everything as fictional and research-oriented. Stay neutral and non-judgmental, your job is to help the participant reason, not to persuade. Do not make moral evaluations. Do not add opinions not grounded in the user's reasoning. Keep the discussion focused on the dilemma. If the user expresses confusion or hesitation, gently encourage reflection using open-ended questions similar to a script of a movie. Dialogue Flow: confirm understanding of the dilemma in one sentence. Ask short, neutral questions to help the user explore their reasoning. After the user discusses all the characters, ask the user to come to a decision. Output Style: Keep replies concise and neutral. Use a calm and professional tone. Do not include real-world instructions or advice. Audience: participants in a moral reasoning research study. Ethical Constraints: never simulate or encourage real-world violence. Decline any non-hypothetical harmful requests. You may clarify that the discussion is fictional if needed."
      },      
      {
        role: "assistant",
        content: "Hello! We have a moral dilemma to talk about! You need to sacrifice one person among four people! Four people are in a hot air balloon. The balloon is losing height and about to crash into the mountains. Having thrown everything imaginable out of the balloon, their only hope is for one of them to jump to their certain death to gain height to clear the mountains and save the other three. The four people are: Dr Robert Lewis - a cancer research scientist, who believes he is about to discover a cure for most common types of cancer. He is a good friend of Susanne and William. Mrs. Susanne Harris - a primary school teacher. She is over the moon because she is 7 months pregnant with her second child. Mr. William Harris husband of Susanne, who he loves very much. He is the pilot of the balloon and the only one on board with balloon flying experience. Miss Heather Sloan - a 9-year-old music prodigy, considered by many to be a twenty-first century Mozart. Discuss and decide who is to be allowed to stay in the balloon, and who is to jump. You must discuss all 4 balloon passengers and consider the reasons why they should or shouldnt remain in the balloon."        
      }
    ],
  },
  initial: "SetupFurhat",
  states: {
    SetupFurhat: {
      initial: "SetVoice",
      states: {
        SetVoice: {
          invoke: {
            src: "fhSetVoice",
            onDone: {
              target: "AttendUser",
              actions: () => console.log("Furhat voice set"),
            },
            onError: {
              target: "#DM.InitialSpeak", // Start even if voice setup fails
              actions: ({ event }) => console.error("Furhat voice error:", event),
            },
          },
        },
        AttendUser: {
          invoke: {
            src: "fhAttend",
            onDone: {
              target: "#DM.InitialSpeak",
              actions: () => console.log("Furhat attending user"),
            },
            onError: {
              target: "#DM.InitialSpeak", // Start even if attend fails
              actions: ({ event }) => console.error("Furhat attend error:", event),
            },
          },
        },
      },
    },
    
    // Speak the initial assistant message (the dilemma introduction)
    InitialSpeak: {
      invoke: {
        src: "fhSpeak",
        input: ({ context }) => {
          const lastMessage = context.messages[context.messages.length - 1];
          return { 
            text: lastMessage.content,
            isFirstMessage: context.isFirstMessage 
          };
        },
        onDone: {
          target: "ListeningOrWaitingForKey", // NEW: Go to the new state that does both
          actions: [
            () => console.log("Initial dilemma spoken, now listening for user or waiting for keypress"),
            assign({ isFirstMessage: false })
          ],
        },
        onError: {
          target: "ListeningOrWaitingForKey",
          actions: ({ event }) => console.error("Furhat speak error:", event),
        },
      },
    },

    // NEW: Listen for user's speech OR wait for keypress (whichever comes first)
    ListeningOrWaitingForKey: {
      entry: () => console.log("Listening for user input OR waiting for keypress..."),
      invoke: {
        src: "listenOrKeypress",
        onDone: {
          actions: assign(({ context, event }) => {
            const result = event.output as { type: 'speech' | 'keypress', data: string };
            
            if (result.type === 'speech') {
              // User spoke - sanitize and add to buffer
              const rawUtterance = result.data;
              const utterance = sanitizeUtterance(rawUtterance);
              console.log(`User said: ${rawUtterance} -> sanitized to: ${utterance}`);
              console.log(`Buffer now contains: [${[...context.userSpeechBuffer, utterance].join(', ')}]`);
              return {
                lastResult: utterance,
                userSpeechBuffer: [...context.userSpeechBuffer, utterance],
                keyPressed: null, // Clear any previous keypress
              };
            } else {
              // Key was pressed
              console.log(`Key pressed: ${result.data}`);
              return {
                keyPressed: result.data,
              };
            }
          }),
          target: "CheckIfKeypressOrContinueListening",
        },
        onError: {
          target: "ListeningOrWaitingForKey",
          actions: ({ event }) => console.error("Listen or keypress error:", event),
        },
      },
    },

    // NEW: Check if we got a keypress or should continue listening
    CheckIfKeypressOrContinueListening: {
      always: [
        {
          // If a key was pressed, process the accumulated speech buffer
          guard: ({ context }) => context.keyPressed !== null,
          target: "ProcessAccumulatedSpeech",
        },
        {
          // Otherwise, continue listening (user spoke but no key was pressed)
          target: "ListeningOrWaitingForKey",
        },
      ],
    },

    // NEW: Process all accumulated speech when a key is pressed
    ProcessAccumulatedSpeech: {
      entry: ({ context }) => {
        console.log(`\n=== Processing ${context.userSpeechBuffer.length} accumulated utterances ===`);
        context.userSpeechBuffer.forEach((utterance, i) => {
          console.log(`${i + 1}. ${utterance}`);
        });
      },
      always: [
        {
          // If there's accumulated speech, add it to messages
          guard: ({ context }) => context.userSpeechBuffer.length > 0,
          target: "ProcessKeypress",
          actions: assign(({ context }) => {
            // Join all accumulated utterances with a space
            const combinedInput = context.userSpeechBuffer.join(" ");
            console.log(`Combined user input: "${combinedInput}"`);
            return {
              messages: [
                ...context.messages,
                { role: "user" as const, content: combinedInput }
              ],
              userSpeechBuffer: [], // Clear the buffer
            };
          }),
        },
        {
          // If no accumulated speech, just process the keypress
          target: "ProcessKeypress",
        },
      ],
    },

    // Determine what to do based on which key was pressed
    ProcessKeypress: {
      always: [
        {
          // If '0' pressed, end the session
          guard: "isQuitKey",
          target: "End",
        },
        {
          // If 'l' pressed, continue normal LLM discussion
          guard: "isDiscussKey",
          target: "ProcessingResponse",
        },

        {
          // If 'm' pressed, print an array of all messages so far.
          guard: "isListMessagesKey",
          target: "ListMessages",
        },

        {
          // If manipulation key (1-4, q-r, a-f) pressed, add manipulation phrase
          guard: "isManipulationKey",
          target: "AddManipulation",
        },
        {
          // Unknown key, go back to listening/waiting
          target: "ListeningOrWaitingForKey",
          actions: () => console.log("Unknown key, please press L, 0, or manipulation keys (1-4, Q-R, A-F)"),
        },
      ],
    },

    // List messages after pressing "m" and return to listening/waiting stage
    ListMessages: {
      entry: ({ context }) => {
        console.log("\n=== MESSAGE HISTORY ===");
        context.messages.forEach((msg, i) => {
          console.log(`${i + 1}. [${msg.role}]: ${msg.content}`);
        });
        console.log("======================\n");
      },
      always: {
        target: "ListeningOrWaitingForKey"
      }
    },

    // Add manipulation phrase based on key pressed
    AddManipulation: {
      entry: assign(({ context }) => {
        // Map keys to manipulation phrases
        const manipulations: Record<string, string> = {
          // Hmm interventions (1-4)
          '1': '<prosody rate="-90%">Hmmm...</prosody>, the doctor?',
          '2': '<prosody rate="-90%">Hmmm...</prosody>, the pregnant lady?',
          '3': '<prosody rate="-90%">Hmmm...</prosody>, the child?',
          '4': '<prosody rate="-90%">Hmmm...</prosody>, the pilot?',
          // Pause interventions (q, w, e, r)
          'q': '<break time="1.2s"/> The doctor?',
          'w': '<break time="1.2s"/> The pregnant lady?',
          'e': '<break time="1.2s"/> The child?',
          'r': '<break time="1.2s"/> The pilot?',
          // Hahaha interventions (a, s, d, f)
          'a': '<prosody rate="-50%">Hahaha</prosody>, the doctor?',
          's': '<prosody rate="-50%">Hahaha</prosody>, the pregnant lady?',
          'd': '<prosody rate="-50%">Hahaha</prosody>, the child?',
          'f': '<prosody rate="-50%">Hahaha</prosody>, the pilot?',
          // Switch topic interventions (z, x, c, v)
          'z': 'Cool, shall we talk about the doctor now?',
          'x': 'Great, shall we talk about the pregnant lady now?',
          'c': 'Perfect, shall we talk about the child now?',
          'v': 'Nice, shall we talk about the pilot now?',
          // Switch to the next topic
          'n': 'Good, shall we talk about the next passenger?',
          // Ask final decision
          'b': 'So, considering all of your discussions, what do you think is your final decision?',
        };
        
        const phrase = manipulations[context.keyPressed || ''];
        console.log(`Adding manipulation phrase: ${phrase}`);
        
        // Add the manipulation phrase as an assistant message
        return {
          messages: [
            ...context.messages,
            { role: "assistant" as const, content: phrase }
          ],
          pendingManipulation: phrase,
        };
      }),
      always: {
        target: "SpeakManipulation",
      },
    },

    // Speak the manipulation phrase
    SpeakManipulation: {
      invoke: {
        src: "fhSpeak",
        input: ({ context }) => ({
          text: context.pendingManipulation || "",
          isFirstMessage: false
        }),
        onDone: {
          target: "ListeningOrWaitingForKey", // After speaking manipulation, go back to listening/waiting
          actions: [
            () => console.log("Manipulation phrase spoken, now listening for user response or keypress"),
            assign({ pendingManipulation: null })
          ],
        },
        onError: {
          target: "ListeningOrWaitingForKey",
          actions: ({ event }) => console.error("Furhat speak error:", event),
        },
      },
    },

    // Send conversation history to LLM and get response
    ProcessingResponse: {
      entry: () => console.log("Getting LLM response..."),
      invoke: {
        src: "chatCompletion",
        input: ({ context }) => ({
          messages: context.messages,
        }),
        onDone: {
          target: "Speaking",
          actions: assign(({ context, event }) => {
            console.log(`LLM responded: ${event.output}`);
            return {
              messages: [
                ...context.messages,
                { role: "assistant" as const, content: event.output }
              ],
            };
          }),
        },
        onError: {
          target: "Speaking",
          actions: assign(({ context }) => ({
            messages: [
              ...context.messages,
              { 
                role: "assistant" as const, 
                content: "I couldn't process that. Please say it again." 
              }
            ],
          })),
        },
      },
    },

    // Speak the LLM's response
    Speaking: {
      invoke: {
        src: "fhSpeak",
        input: ({ context }) => {
          const lastMessage = context.messages[context.messages.length - 1];
          return { 
            text: lastMessage.content,
            isFirstMessage: false
          };
        },
        onDone: {
          target: "ListeningOrWaitingForKey", // After Furhat speaks, go back to listening/waiting
          actions: () => console.log("Finished speaking LLM response, now listening for user or keypress"),
        },
        onError: {
          target: "ListeningOrWaitingForKey",
          actions: ({ event }) => console.error("Furhat speak error:", event),
        },
      },
    },

    // End the session
    End: {
      invoke: {
        src: "fhSpeak",
        input: () => ({
          text: "Thank you for your participation.",
          isFirstMessage: false
        }),
        onDone: {
          target: "LastQuestionWaitForYN",
          actions: assign(({ context }) => ({
            messages: [
              ...context.messages,
              {
                role: "assistant" as const,
                content: "Thank you for your participation."
              }
            ],
          })),
        },
        onError: {
          target: "Done",
          actions: ({ event }) => console.error("Furhat speak error:", event),
        },
      },
    },

    SessionExitingQuestionForTheResearcher: {
      entry: () => {
        console.log("DO YOU WANT TO PRINT THE CONVERSATION (Y/N)")
      },
      always: {target: "LastQuestionWaitForYN"}
    },

    LastQuestionWaitForYN: {
        entry: () => console.log("\n>>> DO YOU WANT TO PRINT THE CONVERSATION (Y/N) <<<"),
        invoke: {
          src: "waitForKey",
          onDone: {
            actions: assign(({ event }) => ({
              keyPressed: event.output,
            })),
            target: "ProcessYN",
          },
        },
    },

    ProcessYN: {
      always: [
        {
          // CONFIRMATION FOR THE FINAL QUESTION.
          guard: "isYesKey",
          target: "ListMessagesBeforeFinal",
        },
        {
          // CONFIRMATION FOR THE FINAL QUESTION.
          guard: "isNoKey",
          target: "Done",
        },
      ]
    },

    ListMessagesBeforeFinal: {
      entry: ({ context }) => {
        console.log("\n=== MESSAGE HISTORY ===");
        context.messages.forEach((msg, i) => {
          console.log(`${i + 1}. [${msg.role}]: ${msg.content}`);
        });
        console.log("======================\n");
      },
      always: {
        target: "Done"
      }
    },

    Done: {
      type: "final",
      entry: () => {
        console.log("Session ended. Exiting...");
        process.exit(0);
      }
    },
  },
});

const actor = createActor(dmMachine).start();

// Subscribe to state changes for debugging
actor.subscribe((snapshot) => {
  console.group("State update");
  console.log("State value:", snapshot.value);
  console.log("Key pressed:", snapshot.context.keyPressed);
  console.log("User speech buffer:", snapshot.context.userSpeechBuffer);
  console.log("Last user message:", snapshot.context.messages.filter(m => m.role === "user").pop()?.content || "none");
  console.log("Message count:", snapshot.context.messages.length);
  console.groupEnd();
});

// Display instructions in console
console.log(`
=== KEYBOARD CONTROLS ===
L = Continue discussion (send to LLM)
M = List all of the conversation so far.
0 = End session
Ctrl+C = Exit immediately

MANIPULATION PHRASES:

Hmm versions:
1 = Hmm, the Doctor?
2 = Hmm, the pregnant lady?
3 = Hmm, the child?
4 = Hmm, the pilot?

Pause versions:
Q = (pause) The Doctor?
W = (pause) The pregnant lady?
E = (pause) The child?
R = (pause) The pilot?

Hahaha versions:
A = Hahaha, the Doctor?
S = Hahaha, the pregnant lady?
D = Hahaha, the child?
F = Hahaha, the pilot?

FORCE CHANGE TOPIC:
Z = Can we talk about the doctor now? 
X = Can we talk about the pregnant lady now?
C = Can we talk about the child now?
V = Can we talk about the pilot now?

N = Can we talk about the next passenger now?

========================

New thing for interruption problem: User speech is accumulated in a buffer. 
The system keeps listening until a key is pressed.
When a key is pressed, all accumulated speech is combined and processed into our message array.
NOMATCH utterances are replaced with "..." in the final output.
`);
