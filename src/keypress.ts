import { fromPromise } from "xstate";
import * as readline from 'readline';
import { fhListen } from "./furhat";

// Setup readline interface for keyboard input in Node.js
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

// Keyboard input listener for Node.js - waits for a single keypress and returns the key
export async function waitForKeypress(): Promise<string> {
  return new Promise((resolve) => {
    const handler = (str: string, key: any) => {
      // Handle Ctrl+C to exit gracefully
      if (key.ctrl && key.name === 'c') {
        console.log('\nExiting...');
        process.exit(0);
      }
      
      resolve(key.name.toLowerCase());
    };
    process.stdin.removeAllListeners('keypress');
    process.stdin.once('keypress', handler);
  });
}

// NEW: Combined actor that races between listening and waiting for keypress
export const listenOrKeypress = fromPromise(async () => {
  return Promise.race([
    fhListen().then(result => ({ type: 'speech' as const, data: result })),
    waitForKeypress().then(result => ({ type: 'keypress' as const, data: result }))
  ]);
});

