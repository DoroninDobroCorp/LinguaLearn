/**
 * Complete CEFR A1 Grammar Theory & Pedagogical Packages
 * All 30 official A1 preset topics mapped to their curriculum_topics ID.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, 'a1TopicPackagesData.json');

let packages = {};
try {
  packages = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
} catch (e) {
  console.error('Failed to load a1TopicPackagesData.json:', e);
}

export const GRAMMAR_THEORY_GUIDES = Object.freeze(packages);

export function getGrammarTheoryGuide(topicId, topicName) {
  if (!topicId && !topicName) return null;
  if (topicId && GRAMMAR_THEORY_GUIDES[Number(topicId)]) {
    return GRAMMAR_THEORY_GUIDES[Number(topicId)];
  }
  if (topicName) {
    const match = Object.values(GRAMMAR_THEORY_GUIDES).find(p => p.topicName.toLowerCase() === String(topicName).toLowerCase());
    if (match) return match;
  }
  return null;
}

export function getAllA1TopicPackages() {
  return Object.values(GRAMMAR_THEORY_GUIDES);
}
