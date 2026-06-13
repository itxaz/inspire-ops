// Claude-assisted fallback parser for low-confidence or PDF-extracted text.
// Called by the imports route when structured CSV mapping confidence < threshold.
// Uses the Anthropic SDK with structured output (tool_use) to extract line items.

import Anthropic from '@anthropic-ai/sdk';
import type { NormalizedLine } from './parse.js';
import { parseMoney, parsePct } from './parse.js';

export const AI_CONFIDENCE_THRESHOLD = 0.7;

export interface AiParseResult {
  items: NormalizedLine[];
  rawResponse: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
}

const extractTool: Anthropic.Tool = {
  name: 'extract_commission_lines',
  description:
    'Extract normalized commission line items from a carrier statement. Each item represents one policy/endorsement row.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            policyNumberRaw: { type: ['string', 'null'], description: 'Policy or contract number as printed' },
            premiumAmount: { type: ['number', 'null'], description: 'Written premium in dollars' },
            commissionAmount: { type: 'number', description: 'Commission amount in dollars (required)' },
            commissionPct: { type: ['number', 'null'], description: 'Commission rate as 0–1 fraction (e.g. 0.15 for 15%)' },
            isRenewal: { type: ['boolean', 'null'], description: 'True if this is a renewal, false if new business, null if unknown' },
          },
          required: ['commissionAmount'],
        },
      },
    },
    required: ['items'],
  },
};

const SYSTEM = `You are a commission statement parser for transit insurance agencies.
Extract every policy line item from the provided carrier statement text.
- commissionAmount is always required; set to 0 only if explicitly stated as zero
- commissionPct: express as 0–1 fraction (0.15 for 15%); null if not shown
- Ignore header rows, totals rows, and blank lines
- Preserve the raw policy number exactly as printed`;

/**
 * Parse raw text (CSV or PDF-extracted) using Claude when structured mapping fails.
 * Requires ANTHROPIC_API_KEY in the environment.
 */
export async function parseWithClaude(rawText: string): Promise<AiParseResult> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: SYSTEM,
    tools: [extractTool],
    tool_choice: { type: 'tool', name: 'extract_commission_lines' },
    messages: [
      {
        role: 'user',
        content: `Extract all commission line items from this carrier statement:\n\n${rawText.slice(0, 60_000)}`,
      },
    ],
  });

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use block');
  }

  const input = toolBlock.input as { items: Array<{
    policyNumberRaw?: string | null;
    premiumAmount?: number | null;
    commissionAmount: number;
    commissionPct?: number | null;
    isRenewal?: boolean | null;
  }> };

  const items: NormalizedLine[] = (input.items ?? []).map((item) => {
    const commissionAmount = typeof item.commissionAmount === 'number' ? item.commissionAmount : null;
    let flagReason: string | null = null;
    if (commissionAmount == null) flagReason = 'missing or unparseable commission amount';
    else if (!item.policyNumberRaw) flagReason = 'missing policy number';

    return {
      policyNumberRaw: item.policyNumberRaw?.trim() || null,
      premiumAmount: typeof item.premiumAmount === 'number' ? item.premiumAmount : null,
      commissionAmount,
      commissionPct: typeof item.commissionPct === 'number' ? item.commissionPct : null,
      isRenewal: typeof item.isRenewal === 'boolean' ? item.isRenewal : null,
      raw: {},
      flagged: flagReason != null,
      flagReason,
    };
  });

  return {
    items,
    rawResponse: JSON.stringify(input),
    tokenUsage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Thin wrapper used in imports.ts — only fires if confidence is below threshold.
// ---------------------------------------------------------------------------
export async function maybeParseWithClaude(
  items: NormalizedLine[],
  confidence: number,
  rawText: string,
): Promise<{ items: NormalizedLine[]; usedAi: boolean; aiTokens?: { inputTokens: number; outputTokens: number } }> {
  if (confidence >= AI_CONFIDENCE_THRESHOLD || !process.env.ANTHROPIC_API_KEY) {
    return { items, usedAi: false };
  }
  const result = await parseWithClaude(rawText);
  return { items: result.items, usedAi: true, aiTokens: result.tokenUsage };
}
