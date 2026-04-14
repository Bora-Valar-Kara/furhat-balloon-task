import { setup, createActor, fromPromise, assign } from "xstate";
import { Message, DMContext } from "./types";
import { fakeFurhat, realFurhat, sanitizeUtterance } from "./furhat";
import { fetchChatCompletion, fetchChatCompletionNoOllama } from "./ollama";
import { waitForKeypress } from "./keypress";
import { allManipulationKeys, newManipulations, manipulations, interventionTypes } from "./audio_manipulations";

const MOCK_FURHAT = false;
const MOCK_LLM = false;

const timer = fromPromise(
  ({ input }: { input: { ms: number } }) =>
    new Promise((resolve) => setTimeout(resolve, input.ms))
);

//const chatCompletion = fetchChatCompletion;
const chatCompletion = MOCK_LLM ? fetchChatCompletionNoOllama : fetchChatCompletion;
const furhat = MOCK_FURHAT ? fakeFurhat : realFurhat;

// NEW: Combined actor that races between listening and waiting for keypress
const listenOrKeypress = fromPromise(async () => {
  return Promise.race([
    furhat.listen().then(result => ({ type: 'speech' as const, data: result })),
    waitForKeypress().then(result => ({ type: 'keypress' as const, data: result }))
  ]);
});

// State machine
const dmMachine = setup({
  types: {
    context: {} as DMContext,
  },
  actors: {
    timer,
    chooseInterventionType: fromPromise(async () => {
      console.log("Choose interventions:");
      const interventionOptions = interventionTypes();
      for (let i = 0; i < interventionOptions.length; i++) {
        console.log(`${i + 1}: ${interventionOptions[i]}`);
      }
      const chosen = await waitForKeypress();
      const chooseInterventions = interventionOptions[parseInt(chosen, 10) - 1];
      console.log("chosen", chooseInterventions);
      return newManipulations[chooseInterventions];
    }),
    loadLLM: fromPromise(async () => {
      console.log("Loading LLM...");
      await chatCompletion([]);
    }),
    fhSetVoice: fromPromise(async () => {
      return furhat.setVoice("en-US-EchoMultilingualNeural");
    }),
    fhAttend: fromPromise(async () => {
      return furhat.attendUser();
    }),
    fhSpeak: fromPromise(async ({ input }: { input: { text: string; isFirstMessage: boolean } }) => {
      return furhat.say(input.text, input.isFirstMessage);
    }),
    fhSpeakAudio: fromPromise(async ({ input }: { input: { audioUrl: string; isFirstMessage: boolean } }) => {
      return furhat.sayAudio(input.audioUrl, input.isFirstMessage);
    }),
    fhListen: fromPromise(async () => {
      return furhat.listen();
    }),
    chatCompletion: fromPromise(
      async ({ input }: { input: { messages: Message[] } }) => {
        const response = await chatCompletion(input.messages);
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
    isTextManipulationKey: ({ context }) => {
      const key = context.keyPressed;
      return key !== null && allManipulationKeys.includes(key);
    },
    // Check if it is Yes or No key:
    isYesKey: ({ context }) => context.keyPressed === 'y',
    isNoKey: ({ context }) => context.keyPressed === 'n',

    // Check if the key is one of the manipulation keys
    isAudioKey: ({ context }) => {
      const key = context.keyPressed;
      if (key === null) return false;
      const interventionIndex = parseInt(key, 10);
      if (isNaN(interventionIndex)) return false;

      return context.interventions.length >= interventionIndex;
    }
  },

}).createMachine({
  id: "DM",
  context: {
    lastResult: "",
    isFirstMessage: true,
    interventions: [],
    pendingManipulation: null,
    keyPressed: null,
    userSpeechBuffer: [], // NEW: Initialize empty buffer
    messages: [
      {
        role: "system",
        content: "You are a virtual person participating in a study on moral reasoning. Your job is to guide the user and give information. Your responses are not full paragraphs. Be short and snappy. Do not give answers longer than two short sentences. Describe the modal dilemma fully, when you are asked. You simulate structured dialogue that should be like a script of a movie to help a participant reflect on a hypothetical moral dilemma. Your role is purely conversational and for academic research purposes only. Your task is to discuss the hypothetical dilemma with the user. Guide them through reasoning about moral choices until they reach a decision. Background: the situation is completely hypothetical and no one is being harmed. It's a dilemma involving four fictional people: Pilot, Teacher, Doctor, Prodigy child. The four people are: Dr Robert Lewis - a cancer research scientist, who believes he is about to discover a cure for most common types of cancer. He is a good friend of Susanne and William. Mrs. Susanne Harris - a primary school teacher. She is over the moon because she is 7 months pregnant with her second child. Mr. William Harris husband of Susanne, who he loves very much. He is the pilot of the balloon and the only one on board with balloon flying experience. Miss Heather Sloan - a 9-year-old music prodigy, considered by many to be a twenty-first century Mozart. Discuss and decide who is to be allowed to stay in the balloon, and who is to jump. Review the chat history to understand the dilemma before responding. Interaction Rules: Treat everything as fictional and research-oriented. Stay neutral and non-judgmental, your job is to help the participant reason, not to persuade. Do not make moral evaluations. Do not add opinions not grounded in the user's reasoning. Keep the discussion focused on the dilemma. If the user expresses confusion or hesitation, gently encourage reflection using open-ended questions similar to a script of a movie. Dialogue Flow: confirm understanding of the dilemma in one sentence. Ask short, neutral questions to help the user explore their reasoning. After the user discusses all the characters, ask the user to come to a decision. Output Style: Keep replies concise and neutral. Use a calm and professional tone. Do not include real-world instructions or advice. Audience: participants in a moral reasoning research study. Ethical Constraints: never simulate or encourage real-world violence. Decline any non-hypothetical harmful requests. You may clarify that the discussion is fictional if needed."
      },      
      {
        role: "assistant",
        content: "Hello. We have a moral dilemma to talk about! Can you introduce yourself a bit? After that I am ready to assist you with the dilemma and your questions about the each passenger."        
      }

      /* 
      Hello! We have a moral dilemma to talk about! You need to sacrifice one person among four people! 
      Four people are in a hot air balloon. The balloon is losing height and about to crash into the mountains. 
      Having thrown everything imaginable out of the balloon, their only hope is for one of them to jump to their certain death 
      to gain height to clear the mountains and save the other three. The four people are: Dr Robert Lewis - a cancer research scientist, 
      who believes he is about to discover a cure for most common types of cancer. He is a good friend of Susanne and William. 
      Mrs. Susanne Harris - a primary school teacher. She is over the moon because she is 7 months pregnant with her second child. 
      Mr. William Harris husband of Susanne, who he loves very much. He is the pilot of the balloon and the only one on board with balloon flying experience. 
      Miss Heather Sloan - a 9-year-old music prodigy, considered by many to be a twenty-first century Mozart. Discuss and decide who is to be allowed to stay in the balloon, 
      and who is to jump. You must discuss all 4 balloon passengers and consider the reasons why they should or shouldnt remain in the balloon.
      */
    ],
  },
  initial: "SetupExperiment",
  states: {
    SetupExperiment: {
      invoke: {
        src: "chooseInterventionType",
        onDone: {
          target: "SetupFurhat",
          actions: assign(({ event }) => {
            console.log("Chosen interventions are", event);
            return {
              interventions: event.output
            }
          })
        }
      }
    },
    SetupFurhat: {
      initial: "LoadLLM",
      states: {
        LoadLLM: {
          invoke: {
            src: "loadLLM",
            onDone: {
              target: "SetVoice",
              actions: () => console.log("Loaded LLM"),
            },
            onError: {
              target: "#DM.InitialSpeak", // Start even if setup fails
              actions: ({ event }) => console.error("LLM error:", event),
            },
          },
        },
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
            

            // 
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
          guard: "isTextManipulationKey",
          target: "AddManipulation",
        },
        {
          // If manipulation key (1-4, q-r, a-f) pressed, add manipulation phrase
          guard: "isAudioKey",
          target: "AddManipulation",
        },
        {
          // Unknown key, go back to listening/waiting
          target: "ListeningOrWaitingForKey",
          actions: () => console.log("Unknown key, please press L, 0, or manipulation keys (1-4, Q-R, A-F, Z-V) or B, N."),
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
        // The following if statement checks if the key pressed is one of the hypothesis manipulation keys (1-4, q-r, a-f). If so, it queues an audio manipulation. 
        // Otherwise, it adds a text manipulation phrase for guidance keys (z-v, n, b).
        const manipulationIndex = parseInt(context.keyPressed || '', 10);
        const manipulation = isNaN(manipulationIndex) ? manipulations[context.keyPressed || ''] : context.interventions[manipulationIndex - 1];
        if (manipulation.audioUri) {
          const textForHistory = manipulation.transcription || `[Audio manipulation: ${manipulation.audioUri}]`;
          
          console.log(`Queuing audio: ${manipulation.audioUri}`);

          return {
            messages: [
              ...context.messages,
              { role: "assistant" as const, content: textForHistory }
            ],
            pendingManipulation: manipulation.audioUri,
          };
        } else {
          const phrase = manipulation.text;
          if (phrase === undefined) {
            throw Error("Could not find manipulation");
          }
          console.log(`Adding manipulation phrase: ${phrase}`);
          // Add the manipulation phrase as an assistant message
          return {
            messages: [
              ...context.messages,
              { role: "assistant" as const, content: phrase }
            ],
            pendingManipulation: phrase,
          };
        }
      }),
      always: [
        {
          // If it's a hypothesis key, go to SpeakManipulationAudio state
          guard: "isAudioKey",
          target: "SpeakManipulationAudio",
        },
        {
          // Otherwise, go to SpeakManipulation state
          target: "SpeakManipulation",
        }, 
      ], // After adding manipulation, go speak it
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

  

    
    SpeakManipulationAudio:{
      invoke: {
        src: "fhSpeakAudio", // Changed from "fhSpeak" to "fhSpeakAudio"
        input: ({ context }) => ({
          audioUrl: context.pendingManipulation || "",
          isFirstMessage: false
        }),
        onDone: {
          target: "ListeningOrWaitingForKey",
          actions: [
            () => console.log("Manipulation audio played, now listening for user response"),
            assign({ pendingManipulation: null })
          ],
        },
        onError: {
          target: "ListeningOrWaitingForKey",
          actions: ({ event }) => console.error("Furhat audio playback error:", event),
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
0 = End session (and press Y to print conversation, N to not print)
Ctrl+C = Exit immediately

Interventions:
1 = Hmm / (pause) / hahaha, the Doctor?
2 = Hmm / (pause) / hahaha, the pregnant lady?
3 = Hmm / (pause) / hahaha, the child?
4 = Hmm / (pause) / hahaha, the pilot?

FORCE CHANGE TOPIC:
Z = Can we talk about the doctor now? 
X = Can we talk about the pregnant lady now?
C = Can we talk about the child now?
V = Can we talk about the pilot now?

N = Can we talk about the next passenger now?

FORCE CONCLUDE:
B = So, based on your discussions, who do you think should jump?

FORCE EXPLANATION:
P = Read out the full dilemma prompt

`);
