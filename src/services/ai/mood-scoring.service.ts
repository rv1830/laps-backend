
// ============================================================================
// src/services/ai/mood-scoring.service.ts
// ============================================================================
import Anthropic from '@anthropic-ai/sdk';

export class MoodScoringService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }

  async scoreEmailReply(emailBody: string, context?: string) {
    const prompt = `Analyze the following email reply and determine the lead's mood and intent.

Context: ${context || 'None provided'}

Email:
${emailBody}

Respond in JSON format with:
{
  "moodScore": <number 0-100>,
  "moodLabel": "<negative|neutral|positive>",
  "intentScore": <number 0-100>,
  "intentLabel": "<not_interested|exploring|interested|ready_to_buy>",
  "reasoning": "<brief explanation>",
  "suggestedAction": "<next_best_action>"
}`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const result = JSON.parse(content.text);
    return result;
  }

  async qualifyLead(leadData: any) {
    const prompt = `Qualify this lead based on available information:

Lead Data:
${JSON.stringify(leadData, null, 2)}

Respond in JSON format with:
{
  "qualificationLabel": "<hot|warm|cold|unqualified>",
  "score": <number 0-100>,
  "reasoning": "<explanation>",
  "missingInfo": ["<field1>", "<field2>"],
  "suggestedQuestions": ["<question1>", "<question2>"]
}`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    return JSON.parse(content.text);
  }
}
