import { fromPromise } from "xstate";
import * as readline from 'readline';

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
