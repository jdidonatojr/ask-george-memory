import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { NextResponse } from "next/server";

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

const memoryFile = path.join(process.cwd(), "conversations.json");

// === Helper: read or create the memory file ===
async function loadConversations() {
  try {
    const data = await fs.readFile(memoryFile, "utf8");
    return JSON.parse(data);
  } catch {
    return {}; // start fresh if no file yet
  }
}

// === Helper: save memory file ===
async function saveConversations(conversations) {
  await fs.writeFile(memoryFile, JSON.stringify(conversations, null, 2));
}

// === Helper: verify HMAC signature ===
function verifySignature(secret, body, signatureHeader) {
  if (!secret || !signatureHeader) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body, "utf8");
  const expected = `sha256=${hmac.digest("hex")}`;
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}

// === POST: handle new conversation event ===
export async function POST(req) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  const body = await req.text();
  const signature = req.headers.get("ElevenLabs-Signature");

  // verify webhook authenticity
  if (!verifySignature(secret, body, signature)) {
    console.log("❌ Invalid signature. Ignoring request.");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(body);

  // === Always save all conversations ===
  const allowMemory = true;

  // === Identify the user ===
  const userName =
    event.data.conversation_initiation_client_data?.dynamic_variables
      ?.user_name || "Anonymous";

  // === Save the conversation ===
  const { conversation_id, transcript, analysis, metadata } = event.data;
  const conversations = await loadConversations();

  conversations[conversation_id] = {
    user: userName,
    transcript,
    summary: analysis?.transcript_summary || "No summary provided",
    duration: metadata?.call_duration_secs,
    timestamp: metadata?.start_time_unix_secs,
    cost: metadata?.cost,
  };

  await saveConversations(conversations);
  console.log(`✅ Conversation saved for user: ${userName}`);

  return NextResponse.json({ received: true }, { status: 200 });
}

// === GET: show that webhook is online ===
export async function GET() {
  return NextResponse.json({ message: "Webhook endpoint is live" }, { status: 200 });
}
