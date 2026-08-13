/**
 * 4-tier assessment resolver matching backend contract invariants:
 * 1. clear_error: Red objective error section, hasClearError=true
 * 2. mechanical_only: Neutral section ("Опечатки и оформление"), hasClearError=false
 * 3. acceptable: Positive section ("Фраза корректна" + optionalSuggestions), hasClearError=false
 * 4. correct: Positive section ("Всё правильно"), hasClearError=false
 */
export function getSampleTierInfo(sample) {
  const analysis = sample?.analysis || {};
  const assessment = analysis.assessment;
  const hasClearError = analysis.hasClearError ?? (assessment === 'clear_error');
  const errors = Array.isArray(analysis.errors) ? analysis.errors : [];
  const mechanicalCorrections = Array.isArray(analysis.mechanicalCorrections) ? analysis.mechanicalCorrections : [];
  const optionalSuggestions = Array.isArray(analysis.optionalSuggestions) ? analysis.optionalSuggestions : [];
  const recommendedText = analysis.recommendedText || analysis.correctedText || sample?.originalText || '';

  let tier = 'correct';
  if (assessment) {
    tier = assessment;
  } else if (hasClearError || errors.some((e) => e.kind === 'grammar_error' || (!e.kind && e.topic))) {
    tier = 'clear_error';
  } else if (mechanicalCorrections.length > 0 || errors.some((e) => e.kind === 'mechanical')) {
    tier = 'mechanical_only';
  } else if (optionalSuggestions.length > 0 || errors.some((e) => e.kind === 'style')) {
    tier = 'acceptable';
  } else {
    tier = 'correct';
  }

  return {
    tier,
    hasClearError: tier === 'clear_error',
    recommendedText,
    correctedText: analysis.correctedText || recommendedText,
    errors,
    mechanicalCorrections,
    optionalSuggestions,
    summaryRu: analysis.summaryRu || '',
  };
}
