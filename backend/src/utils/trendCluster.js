/**
 * Grouping the trending list into the events behind it.
 *
 * Google reports searches as people typed them, so one football story can arrive
 * as four lines - the player, the club, "player injury", "player transfer news" -
 * and an editor reading forty lines sees four stories where the newsroom has one.
 * Clustering says plainly which lines share their words, so the desk can cover the
 * event once instead of chasing each spelling of it.
 *
 * The rule is deliberately dumb and therefore arguable: two topics belong together
 * when the shorter of their word sets is at least half contained in the other, and
 * they share at least one real word. Nothing here knows what a footballer is; it
 * only knows which words Google actually printed.
 */

// Words that carry no event. "news", "latest" and "update" appear on searches for
// everything, so a match on them alone is not a match.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'at', 'for', 'from', 'in', 'into', 'is', 'it', 'of', 'on',
  'or', 'the', 'to', 'with', 'what', 'when', 'where', 'who', 'why', 'how',
  'news', 'latest', 'update', 'updates', 'today', 'live', 'video', 'photos',
  'score', 'scores', 'result', 'results',
]);

// A word that appears in more than this share of the list is not identifying an
// event, it is the day's common noun - "rwanda" during an election week, say.
const COMMON_WORD_SHARE = 0.4;

// Beyond this many lines together the "cluster" is clearly one shared word, not
// one event, so the merge stops and the lines stay listed apart.
const MAX_CLUSTER = 6;

/** The words a comparison is made of: Google's spelling, minus the filler. */
function words(topic) {
  return String(topic || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/**
 * How much of the shorter list is inside the longer one.
 *
 * Containment rather than Jaccard on purpose: "outlook" and "outlook login
 * password reset" are the same thing to a reader even though the word sets
 * barely overlap once the long one is counted whole.
 */
function overlap(a, b) {
  const shared = a.filter((word) => b.includes(word));
  const smaller = Math.min(a.length, b.length);
  if (!smaller) return { shared: [], ratio: 0 };
  return { shared, ratio: shared.length / smaller };
}

/**
 * Returns one entry per group, in the order the topics came in.
 *
 * `shared` holds the words that joined the lines, so the desk can disagree with
 * a grouping by looking at it instead of by trusting it. A list of one topic is
 * its own group and is still returned - the caller does not have to guess what
 * did not cluster.
 */
function clusterTopics(topics) {
  const list = (topics || []).filter((item) => item && String(item.topic || '').trim());
  if (list.length < 2) {
    return list.map((item, index) => ({ key: `t${index}`, label: String(item.topic), members: [String(item.topic)], shared: [] }));
  }

  const tokenised = list.map((item) => words(item.topic));
  const total = list.length;
  const counts = new Map();
  tokenised.forEach((set) => new Set(set).forEach((word) => counts.set(word, (counts.get(word) || 0) + 1)));
  const common = new Set([...counts].filter(([, seen]) => seen / total > COMMON_WORD_SHARE).map(([word]) => word));

  // Pairs worth merging, strongest word-match first, so a tight group forms
  // before a loose one can pull it apart.
  const pairs = [];
  const distinctive = (set) => set.filter((word) => !common.has(word));
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const left = distinctive(tokenised[i]);
      const right = distinctive(tokenised[j]);
      // Only compare the identifying words when both lines have their own. If
      // either is left with nothing but the day's shared noun - "Rwanda" in an
      // election week - both are read whole and the match must carry two words,
      // because one shared noun is the country, not an event.
      const own = left.length > 0 && right.length > 0;
      const match = overlap(own ? left : tokenised[i], own ? right : tokenised[j]);
      if (match.ratio >= 0.5 && match.shared.length >= (own ? 1 : 2)) {
        pairs.push({ i, j, shared: match.shared, ratio: match.ratio });
      }
    }
  }
  pairs.sort((a, b) => (b.shared.length - a.shared.length) || (b.ratio - a.ratio));

  const parent = list.map((_, index) => index);
  const size = list.map(() => 1);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const joined = new Map();
  pairs.forEach(({ i, j, shared }) => {
    const a = find(i);
    const b = find(j);
    if (a === b) return;
    if (size[a] + size[b] > MAX_CLUSTER) return;
    parent[b] = a;
    size[a] += size[b];
    const previous = [...(joined.get(a) || []), ...(joined.get(b) || [])];
    joined.set(a, [...new Set([...previous, ...shared])]);
  });

  const groups = new Map();
  list.forEach((item, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(String(item.topic));
  });

  // Walked in feed order, so the groups come out in the order the topics did
  // and the desk still reads Google's list, just in fewer pieces.
  return [...groups.entries()].map(([root, members]) => ({
    key: `g${root}`,
    label: members[0],
    members,
    shared: joined.get(root) || [],
  }));
}

module.exports = { clusterTopics, words, STOPWORDS, MAX_CLUSTER, COMMON_WORD_SHARE };
