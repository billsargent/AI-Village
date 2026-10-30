/**
 * Every model call has a purpose, and the purpose decides the model,
 * thinking, temperature, tools and budget (spec section 11). Only the
 * `chat` purpose is configured so far - the owner picked DeepSeek as the
 * talk model to start; the rest of spec section 11's Purposes table
 * (letters, meetings, work sessions, research, ...) is added purpose by
 * purpose as each is actually built.
 */

export const MODEL_PURPOSES = ['chat'] as const;
export type ModelPurpose = (typeof MODEL_PURPOSES)[number];

export interface ModelSettings {
  provider: 'deepseek';
  model: string;
  thinking: boolean;
  temperature: number;
  maxSteps: number;
}

// Partial, not a full Record: most purposes from spec section 11's table
// (letters, meetings, work sessions, research, ...) have no settings yet,
// and modelSettingsFor's check below is how that shows up instead of
// guessing.
const PURPOSE_SETTINGS: Partial<Readonly<Record<ModelPurpose, ModelSettings>>> = {
  chat: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    thinking: false,
    temperature: 0.7,
    maxSteps: 4,
  },
};

/** Looks up a purpose's model settings. Throws rather than guessing for an unconfigured purpose. */
export function modelSettingsFor(purpose: ModelPurpose): ModelSettings {
  const settings = PURPOSE_SETTINGS[purpose];
  if (!settings) {
    throw new Error(`No model settings configured for purpose "${purpose}"`);
  }
  return settings;
}
