export function normalizeClubName(value: string | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/(?:^|\s)e\.?\s*v\.?$/i, "")
    .replace(/ß/g, "ss")
    .replace(/\brot[\s-]*weiss\b/gi, "rw")
    .replace(/\btischtennisverein\b/gi, "ttv")
    .replace(/[^a-z0-9]/gi, "")
    .trim()
    .toLowerCase();
}

export function closestClubId(
  normalizedName: string,
  clubs: Map<string, string>,
) {
  let best: { distance: number; id: string } | null = null;
  for (const [candidate, id] of clubs) {
    const distance = editDistance(normalizedName, candidate);
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { distance, id };
    }
  }
  return best?.id;
}

function editDistance(left: string, right: string) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const next = Math.min(
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + 1,
        diagonal + cost,
      );
      diagonal = previous[rightIndex]!;
      previous[rightIndex] = next;
    }
  }
  return previous[right.length]!;
}
