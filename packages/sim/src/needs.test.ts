import { describe, expect, it } from 'vitest';
import {
  applyPurposeForDay,
  createNeeds,
  decayNeeds,
  moodFactorFromMood,
  moodFromNeeds,
  restoreEnergyFromSleep,
  restoreHunger,
} from './needs.js';

describe('decayNeeds', () => {
  it('falls hunger by 1 per village hour, always', () => {
    const needs = decayNeeds(createNeeds(), {
      villageHours: 10,
      isWorking: false,
      isAlone: false,
      hasShelter: true,
    });
    expect(needs.hunger).toBe(90);
  });

  it('falls energy by 1 per waking hour', () => {
    const needs = decayNeeds(createNeeds(), {
      villageHours: 8,
      isWorking: false,
      isAlone: false,
      hasShelter: true,
    });
    expect(needs.energy).toBe(92);
  });

  it('only falls social while alone', () => {
    const alone = decayNeeds(createNeeds(), {
      villageHours: 5,
      isWorking: false,
      isAlone: true,
      hasShelter: true,
    });
    const withOthers = decayNeeds(createNeeds(), {
      villageHours: 5,
      isWorking: false,
      isAlone: false,
      hasShelter: true,
    });
    expect(alone.social).toBe(95);
    expect(withOthers.social).toBe(100);
  });

  it('only falls fun while working', () => {
    const working = decayNeeds(createNeeds(), {
      villageHours: 4,
      isWorking: true,
      isAlone: false,
      hasShelter: true,
    });
    expect(working.fun).toBe(96);
  });

  it('only falls comfort without shelter', () => {
    const exposed = decayNeeds(createNeeds(), {
      villageHours: 3,
      isWorking: false,
      isAlone: false,
      hasShelter: false,
    });
    expect(exposed.comfort).toBe(97);
  });

  it('never goes below 0', () => {
    const needs = decayNeeds(createNeeds(), {
      villageHours: 1000,
      isWorking: false,
      isAlone: false,
      hasShelter: true,
    });
    expect(needs.hunger).toBe(0);
  });
});

describe('applyPurposeForDay', () => {
  it('rises on a worked day and falls on an idle day', () => {
    const needs = createNeeds();
    expect(applyPurposeForDay({ ...needs, purpose: 50 }, true).purpose).toBe(60);
    expect(applyPurposeForDay({ ...needs, purpose: 50 }, false).purpose).toBe(45);
  });
});

describe('restoreHunger', () => {
  it("restores by the spec's amount for each food", () => {
    expect(restoreHunger({ ...createNeeds(), hunger: 0 }, 'bread').hunger).toBe(40);
    expect(restoreHunger({ ...createNeeds(), hunger: 0 }, 'fish').hunger).toBe(40);
    expect(restoreHunger({ ...createNeeds(), hunger: 0 }, 'vegetables').hunger).toBe(25);
    expect(restoreHunger({ ...createNeeds(), hunger: 0 }, 'apples').hunger).toBe(15);
  });

  it('clamps at 100 and ignores unknown foods', () => {
    expect(restoreHunger({ ...createNeeds(), hunger: 90 }, 'bread').hunger).toBe(100);
    expect(restoreHunger(createNeeds(), 'iron').hunger).toBe(100);
  });
});

describe('restoreEnergyFromSleep', () => {
  it('restores 12 energy per sleep hour, clamped at 100', () => {
    expect(restoreEnergyFromSleep({ ...createNeeds(), energy: 0 }, 5).energy).toBe(60);
    expect(restoreEnergyFromSleep({ ...createNeeds(), energy: 50 }, 8).energy).toBe(100);
  });
});

describe('mood', () => {
  it('is 100 at full needs and 0 at empty needs', () => {
    expect(moodFromNeeds(createNeeds())).toBe(100);
    expect(moodFromNeeds({ hunger: 0, energy: 0, social: 0, fun: 0, comfort: 0, purpose: 0 })).toBe(
      0,
    );
  });

  it('maps full mood to a moodFactor of 1 and zero mood to 0.5', () => {
    expect(moodFactorFromMood(100)).toBe(1);
    expect(moodFactorFromMood(0)).toBe(0.5);
  });
});
