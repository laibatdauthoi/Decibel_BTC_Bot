import type { buildResearchSamples } from './research_dataset.js';

export type research_sample = ReturnType<typeof buildResearchSamples>[number];
