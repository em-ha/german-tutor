/**
 * Echo-chamber detection — spots when a learner keeps reaching for the same
 * narrow set of words, so Quatschi can weave richer alternatives into replies.
 *
 * Ported from server/speech-engine.mts. Isomorphic by design: under the Gemini
 * Live architecture this runs client-side against the accumulated session
 * transcript, since there is no longer a server in the conversation loop.
 */

/** High-frequency grammatical glue to ignore — not the "same words" problem. */
const STOP_WORDS: Record<string, Set<string>> = {
  German: new Set([
    "ich","du","er","sie","es","wir","ihr","sie","mich","dich","sich","uns","euch",
    "mir","dir","ihm","ihr","ihnen","der","die","das","den","dem","des","ein","eine",
    "einen","einem","einer","eines","und","oder","aber","denn","weil","wenn","dass",
    "ob","wie","als","auch","noch","schon","nur","mal","ja","nein","nicht","kein",
    "keine","ist","bin","bist","sind","war","hat","habe","haben","hatte","wird",
    "kann","muss","will","soll","darf","auf","in","an","zu","von","mit","bei","nach",
    "aus","für","über","unter","vor","hinter","neben","zwischen","um","durch","ohne",
    "gegen","sehr","so","dann","da","hier","dort","jetzt","heute","immer","noch",
    "schon","immer","nie","viel","mehr","gut","gern","bitte","danke","ja","nein",
  ]),
  Spanish: new Set([
    "yo","tú","él","ella","usted","nosotros","vosotros","ellos","ellas","me","te",
    "se","nos","os","le","les","lo","la","los","las","un","una","unos","unas","el",
    "la","los","las","y","o","pero","porque","que","si","como","cuando","también",
    "ya","no","más","muy","bien","mal","así","aquí","allí","hoy","ahora","siempre",
    "nunca","todo","nada","algo","alguien","nadie","es","soy","eres","somos","son",
    "era","fue","estar","ser","tener","hacer","ir","de","en","a","con","por","para",
    "sin","sobre","entre","hasta","desde","durante","según","hacia","gracias","sí",
  ]),
  English: new Set([
    "i","me","my","myself","we","our","us","you","your","he","him","his","she","her",
    "they","them","their","it","its","this","that","these","those","a","an","the","and",
    "but","or","so","yet","nor","for","as","at","by","in","of","on","to","up","with",
    "not","no","nor","too","very","just","also","now","then","here","there","when",
    "where","how","all","both","each","few","more","most","some","such","than","that",
    "was","were","be","been","being","have","has","had","do","does","did","will","would",
    "could","should","may","might","shall","can","am","is","are","get","got","go","said",
    "yeah","okay","well","like","know","think","good","great","really","yes","right",
  ]),
};

/**
 * Returns content words appearing at least `minCount` times across the user's
 * transcript history, indicating over-reliance on a narrow vocabulary.
 */
export function getFrequentWords(
  transcripts: string[],
  language: string,
  minCount = 3
): string[] {
  const stopWords = STOP_WORDS[language] ?? STOP_WORDS.English;
  const freq = new Map<string, number>();

  for (const text of transcripts) {
    // Lowercase + strip punctuation, split on whitespace
    const words = text.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/);
    for (const word of words) {
      if (word.length < 3) continue;        // skip very short tokens
      if (stopWords.has(word)) continue;    // skip grammar words
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])           // most frequent first
    .slice(0, 5)                            // top 5 at most
    .map(([word]) => word);
}
