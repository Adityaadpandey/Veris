export type OnboardBeat = {
  kicker: string;
  title: string;
  body: string;
};

export const ONBOARD_BEATS: OnboardBeat[] = [
  {
    kicker: '01 / THE PROBLEM',
    title: 'Your photograph deserves a birth certificate.',
    body: 'Anyone can generate an image. Almost nobody can prove where one came from until the proof starts inside the camera.',
  },
  {
    kicker: '02 / THE MODULE',
    title: 'Signed at the shutter. Not after.',
    body: 'The Hotshoe sits in your camera’s cold shoe, hashes each frame as it is written, and signs it with a key that never leaves the device.',
  },
  {
    kicker: '03 / THE RECORD',
    title: 'Provenance you can hand to an editor.',
    body: 'Every seal lands on-chain as a claim you own — camera, time, place, hash, licence. Verifiable by anyone, forgeable by no one.',
  },
];
