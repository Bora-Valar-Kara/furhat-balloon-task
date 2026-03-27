// Imports for server and file system (required for audio importing)
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

import { networkInterfaces } from 'os';

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

export const audioFiles: Record<string, string> = {
  '1': `http://${PC_IP}:${AUDIO_PORT}/hmm_doctor.wav`,
  '2': `http://${PC_IP}:${AUDIO_PORT}/hmm_pregnant.wav`,
  '3': `http://${PC_IP}:${AUDIO_PORT}/hmm_child.wav`,
  '4': `http://${PC_IP}:${AUDIO_PORT}/hmm_pilot.wav`,

  'q': `http://${PC_IP}:${AUDIO_PORT}/pause_doctor.wav`,
  'w': `http://${PC_IP}:${AUDIO_PORT}/pause_pregnant.wav`,
  'e': `http://${PC_IP}:${AUDIO_PORT}/pause_child.wav`,
  'r': `http://${PC_IP}:${AUDIO_PORT}/pause_pilot.wav`,

  'a': `http://${PC_IP}:${AUDIO_PORT}/hahaha_doctor.wav`,
  's': `http://${PC_IP}:${AUDIO_PORT}/hahaha_pregnant.wav`,
  'd': `http://${PC_IP}:${AUDIO_PORT}/hahaha_child.wav`,
  'f': `http://${PC_IP}:${AUDIO_PORT}/hahaha_pilot.wav`,
};
// >>> HANDLING RECORDED AUDIO IMPORTS /END <<<

const laughterKeys = ['a', 's', 'd', 'f'];
const pauseKeys = ['q', 'w', 'e', 'r'];
const filledPauseKeys = ['1', '2', '3', '4'];
export const hypothesisKeys = [...laughterKeys, ...pauseKeys, ...filledPauseKeys];

const switchTopicKeys = ['z', 'x', 'c', 'v'];
const forceConcludeKey = 'b';
const nextTopicKey = 'n';
const guidanceKeys = [...switchTopicKeys, forceConcludeKey, nextTopicKey];

export const allManipulationKeys = [...hypothesisKeys, ...guidanceKeys];

// Map keys to manipulation phrases
export const manipulations: Record<string, string> = {
    // Hmm interventions (1-4) -- audio cued
    '1': `http://${PC_IP}:${AUDIO_PORT}/hmm_doctor.wav`,
    '2': `http://${PC_IP}:${AUDIO_PORT}/hmm_pregnant.wav`,
    '3': `http://${PC_IP}:${AUDIO_PORT}/hmm_child.wav`,
    '4': `http://${PC_IP}:${AUDIO_PORT}/hmm_pilot.wav`,
    // Pause versions (q, w, e, r) -- audio cued
    'q': `http://${PC_IP}:${AUDIO_PORT}/pause_doctor.wav`,
    'w': `http://${PC_IP}:${AUDIO_PORT}/pause_pregnant.wav`,
    'e': `http://${PC_IP}:${AUDIO_PORT}/pause_child.wav`,
    'r': `http://${PC_IP}:${AUDIO_PORT}/pause_pilot.wav`,
    // Hahaha interventions (a, s, d, f) -- audio cued
    'a': `http://${PC_IP}:${AUDIO_PORT}/hahaha_doctor.wav`,
    's': `http://${PC_IP}:${AUDIO_PORT}/hahaha_pregnant.wav`,
    'd': `http://${PC_IP}:${AUDIO_PORT}/hahaha_child.wav`,
    'f': `http://${PC_IP}:${AUDIO_PORT}/hahaha_pilot.wav`,
    // Switch topic interventions (z, x, c, v) -- direct text manipulation
    'z': 'Cool, shall we talk about the doctor now?',
    'x': 'Great, shall we talk about the pregnant lady now?',
    'c': 'Perfect, shall we talk about the child now?',
    'v': 'Nice, shall we talk about the pilot now?',
    // Switch to the next topic -- direct text manipulation
    'n': 'Good, shall we talk about the next passenger?',
    // Force conclusion -- direct text manipulation
    'b': 'So, based on your discussions, who do you think should jump?',
};
