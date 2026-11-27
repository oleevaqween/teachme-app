export const LOADING_PHRASES: readonly string[] = [
  'Diving into the deep...',
  'Connecting the dots...',
  'Pulling from the archives...',
  'Let me think on that...',
  'Searching for the best way to explain this...',
  'Consulting the knowledge base...',
  'Putting the pieces together...',
  'Unpacking this for you...',
  'Reading between the lines...',
  'On it, give me a sec...',
  'Synthesising the concepts...',
  'Gathering the right context...',
  'Cross-referencing the sources...',
  'Weighing the evidence...',
  'Formulating a clear answer...',
  'Thinking this through carefully...',
  'Tapping into what we know...',
  'Mapping this out for you...',
  'Digging into that question...',
  'Looking at this from every angle...',
  'Assembling the best response...',
  'Sifting through the knowledge...',
  'Scanning the community discussions...',
  'Checking what the experts say...',
  'Turning that question over in my mind...',
];

export function getRandomPhrase(): string {
  return LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
}
