import { Message } from "./types";

const OLLAMA_API_URL = "http://localhost:11434/api/chat";

const GROQ = "llama3-groq-tool-use:latest"; // GROQ model name
const OLLAMA = "llava:13b"; // OLLAMA model name

// Ollama API function
export async function fetchChatCompletion(messages: Message[]): Promise<string> {
  console.log("Calling Ollama with messages:", messages);
  
  try {
    const response = await fetch(OLLAMA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA, // Choose between GROQ and OLLAMA here
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

export async function fetchChatCompletionNoOllama(messages: Message[]): Promise<string> {
    return "This is just a test";
}
