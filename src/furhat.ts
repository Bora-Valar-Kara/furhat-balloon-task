const firstMessageWaitTimeMs = 0; // 0 second for the first message
const FURHATURI = "192.168.1.11:54321";

export const realFurhat = {
  async setVoice(name: string) {
    return await fhVoice(name);
  },
  async say(text: string, isFirstMessage: boolean = false) {
    return await fhSay(text, isFirstMessage);
  },
  async sayAudio(audioUrl: string, isFirstMessage: boolean = false) {
    return await fhSayAudio(audioUrl, isFirstMessage);
  },
  async attendUser() {
    return await fhAttendUser();
  },
  async listen(): Promise<string> {
    return await fhListen();
  }
}

export const fakeFurhat = {
  async setVoice(name: string) {},
  async say(text: string, isFirstMessage: boolean = false) {
    console.log("FURHAT SAYS: " + text);
    return { start: new Date(), end: new Date() };
  },
  async sayAudio(audioUrl: string, isFirstMessage: boolean = false) {
    console.log("FURHAT SAYS AUDIO FILE: " + audioUrl);
    return { start: new Date(), end: new Date() };
  },
  async attendUser() {},
  async listen(): Promise<string> {
    return new Promise((resolve) => setTimeout(resolve, 3000)).then(() => "User said something");
  }
}

// Furhat API functions
export async function fhVoice(name: string) { // fh functions are fetched from Furhat's URI. They are ready-made functions.
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  const encName = encodeURIComponent(name);
  await fetch(`http://${FURHATURI}/furhat/face?mask=adult&character=Alex`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
  await fetch(`http://${FURHATURI}/furhat/led?red=0&green=0&blue=0`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
  return fetch(`http://${FURHATURI}/furhat/voice?name=${encName}`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
}

export async function fhSay(text: string, isFirstMessage: boolean = false) { 
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  const encText = encodeURIComponent(text);
  const start = new Date();
  try {
    const result = await fetch(`http://${FURHATURI}/furhat/say?text=${encText}&blocking=true`, {
      method: "POST",
      headers: myHeaders,
      body: "",
    });
  } catch (error) {
    console.error("Error in fhSay:", error);
  }
  const end = new Date();
  
  // 6 second delay for first message (long introduction), 1 second for others
  const delay = isFirstMessage ? firstMessageWaitTimeMs : 200;
  await new Promise(resolve => setTimeout(resolve, delay));
  return { start, end };
}

export async function fhSayAudio(audioUrl: string, isFirstMessage: boolean = false) {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  const encUrl = encodeURIComponent(audioUrl);
  const start = new Date();
  // Remove the 'text=' and use 'url=' instead
  await fetch(`http://${FURHATURI}/furhat/say?url=${encUrl}&blocking=true&lipsync=true`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
  const end = new Date();
  
  const delay = isFirstMessage ? firstMessageWaitTimeMs : 200;
  await new Promise(resolve => setTimeout(resolve, delay));
  return { start, end };
}

export async function fhAttendUser() { // This is about GAZE.
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

export async function fhListen(): Promise<string> { // Furhat's own ASR.
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");

  // Before listenıng, we send a request to stop listening in case Furhat is still processing previous audio. This is a workaround to prevent the problem of Furhat not responding after the first turn due to some issue with the listen endpoint. After sending the stop command, we immediately send the listen command again to start listening for new input.
  return fetch(`http://${FURHATURI}/furhat/listen/stop`, {
    method: "POST",
    headers: myHeaders,
  }).then(() => {
    console.log("(Re)starting to listen...");
    return fetch(`http://${FURHATURI}/furhat/listen`, {
      method: "GET",
      headers: myHeaders,
    });
  })
    .then((response) => response.body)
    .then((body) => body!.getReader().read())
    .then((reader) => reader.value)
    .then((value) => JSON.parse(new TextDecoder().decode(value!)).message);
}

// NEW: Helper function to filter out NOMATCH and replace with "..."
export function sanitizeUtterance(utterance: string): string {
  // Check if the utterance contains "NOMATCH" (case-insensitive)
  if (utterance.toLowerCase().includes('nomatch')) {
    return '...';
  }
  return utterance;
}
