export function buildOnceEachChoices(entries, getVariants, random = Math.random) {
  const uniqueEntries = Array.from(new Map(entries.map((entry) => [entry.id, entry])).values());
  return uniqueEntries.flatMap((entry) => {
    const variants = getVariants(entry) || [];
    if (variants.length === 0) return [];
    const index = Math.floor(random() * variants.length);
    return [{ entry, variant: variants[index] || variants[0] }];
  });
}
