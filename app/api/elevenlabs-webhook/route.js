import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const elevenlabs = new ElevenLabsClient();
const memoryFile = path.join(process.cwd(), "conversations.json");

// 🧠 Helper function to read or create our notebook file
async function loadConversations() {
  try {
    const data = await fs.readFile(memoryFile, "utf8");
    return JSON.parse(data);
  } catch {
    return {}; // Start with an empty notebook if none exists
  }
}

// ✏️ Helper function to save our notebook
async function saveConversations(conversations) {
  await fs.writeFile(memoryFile, JSON.stringify(conversations, null, 2));
}

// 📬 When ElevenLabs sends us a new message (the webhook)
export async function POST(req) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  const { event, error } = await constructWebhookEvent(req, secret);

  if (error) {
    return NextResponse.json({ error }, { status: 401 });
  }

  // 💌 When the talk finishes, save the conversation
  if (event.type === "post_call_transcription") {
    const { conversation_id, transcript, analysis, metadata } = event.data;

    const conversations = await loadConversations();

    // Save a new entry
    conversations[conversation_id] = {
      transcript,
      summary: analysis?.transcript_summary || "No summary",
      duration: metadata?.call_duration_secs,
      timestamp: metadata?.start_time_unix_secs,
      cost: metadata?.cost,
    };

    await saveConversations(conversations);
    console.log("✅ Conversation saved:", conversation_id);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

// 🕵️‍♂️ Check that the message really came from ElevenLabs
const constructWebhookEvent = async (req, secret) => {
  const body = await req.text();
  const signature = req.headers.get("ElevenLabs-Signature");
  return await elevenlabs.webhooks.constructEvent(body, signature, secret);
};

// Add a simple GET method so browsers get a proper response
export async function GET() {
  return NextResponse.json({ message: "Webhook endpoint is live" }, { status: 200 });
}

