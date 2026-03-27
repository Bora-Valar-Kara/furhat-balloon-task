// Imports for server and file system (required for audio importing)
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

import { networkInterfaces } from 'os';
import { Manipulation } from './types';

// Automatically find your computer's IP
function findIPContaining(value: string) {
  for (const [name, ifaceArray] of Object.entries(networkInterfaces())) {
    if (!ifaceArray) continue;
    for (const iface of ifaceArray) {
      if (iface.address.indexOf(value) === 0) {
        return iface.address;
      }
    }
  }
}

const OVERRIDE_IP = ""; // If automatic detection doesn't work, set here. Run ifconfig | grep 192 in terminal to find it. Or ifconfig | grep 10

const PC_IP = OVERRIDE_IP || findIPContaining("192") || findIPContaining("10."); // CHANGE THIS TO YOUR COMPUTER'S LOCAL IP ADDRESS (the one that Furhat can access through the network). Run ifconfig | grep 192 on terminal to find it. It usually starts with 192.168.1.xxx or 10.0.0.xxx


// >>> HANDLING RECORDED AUDIO IMPORTS /BEGIN <<<
const AUDIO_PORT = 8000;
const AUDIO_DIR = path.join(__dirname, 'audio');

http.createServer((req, res) => {
  const filePath = path.join(AUDIO_DIR, req.url || '');
  
  if (fs.existsSync(filePath) && filePath.endsWith('.wav')) {
    res.writeHead(200, { 'Content-Type': 'audio/wav' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('File not found');
  }
}).listen(AUDIO_PORT, () => {
  console.log(`Audio server running at http://${PC_IP}:${AUDIO_PORT}`);
});

function text(text: string): Manipulation {
    // Create a text manipulation
    return {
        audioUri: undefined,
        text
    }
}

function audioFile(filename: string): Manipulation {
    // Create an audio file manipulation
    return {
        audioUri: filename,
        text: undefined
    }
}

// Map keys to manipulation phrases
export const manipulations: Record<string, Manipulation> = {
    // Switch topic interventions (z, x, c, v) -- direct text manipulation
    'z': text('Cool, shall we talk about the doctor now?'),
    'x': text('Great, shall we talk about the pregnant lady now?'),
    'c': text('Perfect, shall we talk about the child now?'),
    'v': text('Nice, shall we talk about the pilot now?'),
    // Switch to the next topic -- direct text manipulation
    'n': text('Good, shall we talk about the next passenger?'),
    // Force conclusion -- direct text manipulation
    'b': text('So, based on your discussions, who do you think should jump?'),
};
export const allManipulationKeys = Object.keys(manipulations);

export const newManipulations: Record<string, Manipulation[]> = {
    hmm: [
        // Hmm interventions (1-4) -- audio cued
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/hmm_doctor.wav`),
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/hmm_pregnant.wav`),
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/hmm_child.wav`),
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/hmm_pilot.wav`),
    ],
    pause: [
        // Pause versions (q, w, e, r) -- audio cued
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/pause_doctor.wav`),
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/pause_pregnant.wav`),
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/pause_child.wav`),
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/pause_pilot.wav`),
    ],
    laughter: [
        // Hahaha interventions (a, s, d, f) -- audio cued
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/hahaha_doctor.wav`),
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/hahaha_pregnant.wav`),
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/hahaha_child.wav`),
        audioFile(`http://${PC_IP}:${AUDIO_PORT}/hahaha_pilot.wav`),
    ]
}

export function interventionTypes(): string[] {
    return Object.keys(newManipulations);
}
