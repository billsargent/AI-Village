import { describe, expect, it } from 'vitest';
import { modelSettingsFor, type ModelPurpose } from './models.js';

describe('modelSettingsFor', () => {
  it('returns the DeepSeek talk model settings for the chat purpose', () => {
    const settings = modelSettingsFor('chat');
    expect(settings).toEqual({
      provider: 'deepseek',
      model: 'deepseek-flash',
      thinking: false,
      temperature: 0.7,
      maxSteps: 4,
    });
  });

  it("returns the DeepSeek talk model settings for the mayor-duties purpose (spec section 11's table: thinking off, temperature 0.5, 6 steps)", () => {
    const settings = modelSettingsFor('mayor-duties');
    expect(settings).toEqual({
      provider: 'deepseek',
      model: 'deepseek-flash',
      thinking: false,
      temperature: 0.5,
      maxSteps: 6,
    });
  });

  it('throws clearly for a purpose with no configured settings', () => {
    expect(() => modelSettingsFor('research' as ModelPurpose)).toThrow(/No model settings/);
  });
});
