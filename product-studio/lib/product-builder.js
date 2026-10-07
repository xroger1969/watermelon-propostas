import { generateText, Output } from 'ai';
import { z } from 'zod';

const ProductSchema = z.object({
  title: z.string(),
  shortTitle: z.string(),
  destination: z.string(),
  category: z.enum(['Private Tour','Day Trip','Walking Tour','Food & Drink','Boat Tour','Transfer','Attraction','Custom Experience']),
  duration: z.string(),
  summary: z.string(),
  description: z.string(),
  highlights: z.array(z.string()),
  itinerary: z.array(z.string()),
  meetingPoint: z.string(),
  pickup: z.string(),
  dropoff: z.string(),
  included: z.array(z.string()),
  excluded: z.array(z.string()),
  language: z.enum(['English','Portuguese','Spanish','French','Multilingual']),
  groupType: z.enum(['Private','Shared','Private / Shared options']),
  maxGuests: z.number().int().min(1).max(99),
  optionTitle: z.string(),
  optionCode: z.string(),
  priceType: z.enum(['Per person','Per group','Per vehicle','Fixed']),
  suggestedPrice: z.number().min(0),
  childPrice: z.number().min(0),
  currency: z.enum(['EUR','USD','GBP']),
  days: z.array(z.enum(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])),
  startTimes: z.array(z.string()),
  capacity: z.number().int().min(1).max(99),
  cutoffHours: z.number().int().min(0).max(168),
  cancellation: z.string(),
  questions: z.array(z.string()),
  assumptions: z.array(z.string()),
  missingInformation: z.array(z.string()),
  priceRationale: z.string(),
  qualityScore: z.number().int().min(0).max(100)
});

const instructions = `
You are Watermelon Experiences Product Builder, a senior tour-product manager.
Turn a rough operator brief into a commercially strong, structured tourism product.

Rules:
- Public-facing commercial copy must be in natural, polished English.
- Internal uncertainty must be explicit in assumptions and missingInformation.
- Never invent supplier names, admissions, exact addresses, opening hours, licences, accessibility, meals, tickets, or services that were not supplied.
- If the meeting point is unknown, leave meetingPoint empty and add it to missingInformation.
- You may propose sensible operational defaults for pickup, start time, cancellation, capacity and booking cut-off, but record every such proposal in assumptions.
- suggestedPrice is a planning estimate, not live market research. Make it commercially plausible from the brief alone and explain the basis in priceRationale. Never claim you checked competitors or current prices.
- Prefer a complete draft over asking questions first. Missing information is highlighted for human review.
- Keep itinerary steps concise and operationally realistic.
- Title should sell the experience without clickbait.
- optionCode must be short uppercase letters, numbers and hyphens.
- No field may contain Markdown.
- The result is always a draft and must never imply it is published.
`;

export async function buildProduct(brief) {
  const cleanBrief = String(brief || '').trim();
  if (cleanBrief.length < 20) {
    throw new Error('Descreve um pouco melhor a experiência para a IA conseguir criar um produto útil.');
  }

  const model = 'openai/gpt-5.6-sol';

  const result = await generateText({
    model,
    instructions,
    prompt: cleanBrief,
    output: Output.object({ schema: ProductSchema })
  });

  return {
    product: result.output,
    model,
    usage: result.usage ?? null
  };
}
