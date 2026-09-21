import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

let client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set — copy .env.example to .env and fill it in.");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Pin the model in one place so it's easy to bump later.
export const CLAUDE_MODEL = "claude-sonnet-5";

export async function askClaudeJSON<T>(system: string, user: string, maxTokens = 1024): Promise<T> {
  const anthropic = getClaude();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`Claude response did not contain JSON: ${text.slice(0, 200)}`);
  }
  return JSON.parse(jsonMatch[0]) as T;
}
