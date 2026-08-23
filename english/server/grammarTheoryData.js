/**
 * English Grammar Theory & Interactive Rule Data
 * Provides structured educational rule explanations, SVG infographics,
 * conjugation tables, dialectal notes (British vs American), and AI tutor prompts
 * for all 159 CEFR topics (A1–C2).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, 'englishTopicPackagesData.json');

let packages = {};
try {
  packages = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
} catch (e) {
  console.error('Failed to load englishTopicPackagesData.json:', e);
}

function ensureVisualSvg(pkg) {
  if (pkg.visualSvg) return pkg.visualSvg;
  const levelCol = pkg.level === 'A1' ? '#10b981' : pkg.level === 'A2' ? '#06b6d4' : pkg.level === 'B1' ? '#3b82f6' : pkg.level === 'B2' ? '#8b5cf6' : '#ec4899';
  return `<svg viewBox="0 0 700 160" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl shadow-lg font-sans">
    <rect width="700" height="160" rx="14" fill="#0f172a" />
    <rect x="20" y="20" width="660" height="120" rx="10" fill="#1e293b" stroke="${levelCol}" stroke-width="2"/>
    <text x="350" y="55" fill="${levelCol}" font-size="16" font-weight="bold" text-anchor="middle">ENGLISH ${pkg.category ? pkg.category.toUpperCase() : 'GRAMMAR'}: ${(pkg.topicName || '').toUpperCase()}</text>
    <text x="350" y="85" fill="#f8fafc" font-size="14" font-weight="bold" text-anchor="middle">Level: ${pkg.level} • ${pkg.russianTitle || pkg.topicName}</text>
    <text x="350" y="115" fill="#94a3b8" font-size="12" text-anchor="middle">Практикуйте употребление правила в упражнениях и задавайте вопросы AI-репетитору</text>
  </svg>`;
}

export const ENGLISH_TOPIC_THEORIES = Object.freeze(packages);

export function getGrammarTheoryGuide(topicId, topicName) {
  if (!topicId && !topicName) return null;
  const numId = Number(topicId);
  
  let pkg = null;
  if (numId && ENGLISH_TOPIC_THEORIES[numId]) {
    pkg = { ...ENGLISH_TOPIC_THEORIES[numId] };
  } else if (topicName) {
    const lowerName = String(topicName).toLowerCase().trim();
    const match = Object.values(ENGLISH_TOPIC_THEORIES).find(
      p => (p.topicName && p.topicName.toLowerCase().trim() === lowerName) ||
           (p.russianTitle && p.russianTitle.toLowerCase().trim() === lowerName)
    );
    if (match) pkg = { ...match };
  }

  if (pkg) {
    pkg.visualSvg = ensureVisualSvg(pkg);
  }
  return pkg;
}

export function getAllEnglishTopicPackages() {
  return Object.values(ENGLISH_TOPIC_THEORIES);
}
