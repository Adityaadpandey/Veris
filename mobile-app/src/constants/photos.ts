import type { ImageSourcePropType } from 'react-native';

import type { CompanionCaptureData } from '@/components/companion-capture-card';
import { Tones } from '@/constants/theme';

export type PhotoStatus = 'SEALED' | 'LICENSED' | 'PENDING' | 'UNVERIFIED';
export type PhotoDevice = 'clip' | 'hotshoe';

export type Photo = {
  /** A bundled asset id (`require(...)`) for seed photos, or `{ uri }` for a real captured/picked frame. */
  img: ImageSourcePropType;
  /** Which hardware signed this frame. All seed data predates the Clip and was shot on a DSLR clipped into a Hotshoe (see `cam` below) — only a real in-app capture (`use-photos.tsx`'s `buildCapturedPhoto`) is ever `'clip'`. */
  device: PhotoDevice;
  /** Native width/height ratio of `img` — drives the claim page's dynamic hero height. */
  aspect: number;
  tone: readonly [string, string, string];
  code: string;
  date: string;
  place: string;
  status: PhotoStatus;
  res: string;
  cam: string;
  lens: string;
  iso: string;
  sh: string;
  ap: string;
  gps: string;
  cap: string;
  tid: string;
  cont: string;
  tx: string;
  ed: string;
  roy: string;
  lic: string;
  caption: string;
  tags: string;
  /** Fabricated companion_capture-shaped data, same shape `GET /check-claim` returns for a real claim — see docs/superpowers/specs/2026-09-15-companion-capture-design.md. `null` for frames with no phone-side counterpart (gallery imports, or a pairing that never landed). */
  companion: CompanionCaptureData | null;
};

/** Builds a fabricated companion_capture-shaped object for the mock/demo flow, reusing the seed photo's own asset as a stand-in for the phone's frame (there's no separate "phone camera" asset per seed photo). */
function mockCompanion(
  img: ImageSourcePropType,
  {
    score,
    visual,
    content,
    changeType,
    deltaSeconds,
    chainRef,
    regionBbox = null,
  }: {
    score: number;
    visual: number;
    content: number;
    changeType: 'recompression' | 'crop' | 'global_adjustment' | 'localized_edit';
    deltaSeconds: number;
    chainRef: string;
    regionBbox?: { x: number; y: number; width: number; height: number } | null;
  }
): CompanionCaptureData {
  return {
    mobile_image_url: img,
    mobile_captured_at: null,
    mobile_ai_hint: { likely_ai_generated: false, note: 'No visual artifacts detected.' },
    consistency: { score, visual, content },
    forensic: { ssim: content, change_type: changeType, region_bbox: regionBbox },
    timestamp_delta_seconds: deltaSeconds,
    mock_chain_ref: chainRef,
    paired_at: null,
  };
}

const PHOTOS_BASE: Omit<Photo, 'tone'>[] = [
  {
    img: require('@/assets/hotshoe/p1.jpg'),
    aspect: 0.5619,
    code: 'FRM_0428',
    date: '12 APR 2026',
    place: 'KAZIRANGA NP / 26.58N',
    status: 'SEALED',
    res: '6048 × 4024 · CR3',
    cam: 'Canon EOS 5D IV',
    device: 'hotshoe',
    lens: '35mm f/1.4L',
    iso: 'ISO 800',
    sh: '1/250 s',
    ap: 'f/2.0',
    gps: '26.5775, 93.1712',
    cap: '14:12:31 IST',
    tid: '#4128',
    cont: '0x9f2c…41ab',
    tx: '0x7ab3…c0e1',
    ed: '1 of 1',
    roy: '7.5%',
    lic: 'EDITORIAL',
    caption: 'Quokka, low sun',
    tags: 'quokka marsupial kaziranga assam india grass afternoon wildlife',
    companion: mockCompanion(require('@/assets/hotshoe/p1.jpg'), {
      score: 0.93, visual: 0.95, content: 0.91, changeType: 'recompression', deltaSeconds: 1.2,
      chainRef: '0xaeae95ed7b4be92e978aa61331af4d812f934cd94ee149982785151b5e71a6cf',
    }),
  },
  {
    img: require('@/assets/hotshoe/p2.jpg'),
    aspect: 0.6659,
    code: 'FRM_0431',
    date: '12 APR 2026',
    place: 'COORG / 12.42N',
    status: 'SEALED',
    res: '6048 × 4024 · CR3',
    cam: 'Canon EOS 5D IV',
    device: 'hotshoe',
    lens: '50mm f/1.2',
    iso: 'ISO 1600',
    sh: '1/125 s',
    ap: 'f/1.8',
    gps: '12.4244, 75.7382',
    cap: '08:26:04 IST',
    tid: '#4131',
    cont: '0x9f2c…41ab',
    tx: '0x18cd…9f42',
    ed: '1 of 1',
    roy: '7.5%',
    lic: 'UNLISTED',
    caption: 'Piglet at the basin',
    tags: 'piglet pig micropig coorg karnataka india basin indoor farm animal',
    companion: mockCompanion(require('@/assets/hotshoe/p2.jpg'), {
      score: 0.88, visual: 0.86, content: 0.9, changeType: 'crop', deltaSeconds: 2.8,
      chainRef: '0x6ab85f464f5cac28e84c37f54dbba84dd5764eb8f5101a61c0d665284f817bcf',
    }),
  },
  {
    img: require('@/assets/hotshoe/p3.jpg'),
    aspect: 0.5629,
    code: 'FRM_0402',
    date: '29 MAR 2026',
    place: 'LADAKH / 34.15N',
    status: 'LICENSED',
    res: '6048 × 4024 · CR3',
    cam: 'Canon EOS 5D IV',
    device: 'hotshoe',
    lens: '70-200mm f/4',
    iso: 'ISO 200',
    sh: '1/1000 s',
    ap: 'f/8.0',
    gps: '34.1526, 77.5771',
    cap: '16:41:55 IST',
    tid: '#4102',
    cont: '0x9f2c…41ab',
    tx: '0x22ee…7b30',
    ed: '1 of 3',
    roy: '10%',
    lic: 'COMMERCIAL',
    caption: 'Chinstrap on new ice',
    tags: 'penguin chinstrap ladakh india ice snow polar wildlife',
    companion: mockCompanion(require('@/assets/hotshoe/p3.jpg'), {
      score: 0.91, visual: 0.92, content: 0.9, changeType: 'recompression', deltaSeconds: 0.9,
      chainRef: '0x3fe73b5e40d68d5a04c10f02b282d96fe25fb88b32afe56f7125159a9d1e58e5',
    }),
  },
  {
    img: require('@/assets/hotshoe/p4.jpg'),
    aspect: 0.6667,
    code: 'FRM_0397',
    date: '22 MAR 2026',
    place: 'MUNNAR / 10.09N',
    status: 'SEALED',
    res: '6048 × 4024 · CR3',
    cam: 'Canon EOS 5D IV',
    device: 'hotshoe',
    lens: '85mm f/1.8',
    iso: 'ISO 100',
    sh: '1/500 s',
    ap: 'f/5.6',
    gps: '10.0889, 77.0595',
    cap: '06:58:12 IST',
    tid: '#4097',
    cont: '0x9f2c…41ab',
    tx: '0x54aa…10bd',
    ed: '1 of 1',
    roy: '7.5%',
    lic: 'EDITORIAL',
    caption: 'Fawn and a monarch',
    tags: 'fawn deer monarch butterfly munnar kerala india meadow wildlife',
    companion: mockCompanion(require('@/assets/hotshoe/p4.jpg'), {
      score: 0.85, visual: 0.83, content: 0.87, changeType: 'global_adjustment', deltaSeconds: 3.4,
      chainRef: '0x80e234c13d4a20cef6ce04db13dd4b7b82ff853734ca825c447456248006b247',
    }),
  },
  {
    img: require('@/assets/hotshoe/p5.jpg'),
    aspect: 0.824,
    code: 'FRM_0388',
    date: '14 MAR 2026',
    place: 'SPITI VALLEY / 32.24N',
    status: 'PENDING',
    res: '6048 × 4024 · CR3',
    cam: 'Canon EOS 5D IV',
    device: 'hotshoe',
    lens: '35mm f/1.4L',
    iso: 'ISO 3200',
    sh: '1/60 s',
    ap: 'f/1.2',
    gps: '32.2461, 78.0092',
    cap: '09:34:18 IST',
    tid: '—',
    cont: '—',
    tx: 'AWAITING SYNC',
    ed: '—',
    roy: '—',
    lic: '—',
    caption: 'Lamb through the rail',
    tags: 'lamb sheep spiti himachal india hay barn fence farm animal',
    companion: null,
  },
  {
    img: require('@/assets/hotshoe/p6.jpg'),
    aspect: 0.7497,
    code: 'FRM_0361',
    date: '02 MAR 2026',
    place: 'NILGIRIS / 11.41N',
    status: 'SEALED',
    res: '6048 × 4024 · CR3',
    cam: 'Canon EOS 5D IV',
    device: 'hotshoe',
    lens: '50mm f/1.2',
    iso: 'ISO 400',
    sh: '1/320 s',
    ap: 'f/4.0',
    gps: '11.4064, 76.6932',
    cap: '17:22:40 IST',
    tid: '#4061',
    cont: '0x9f2c…41ab',
    tx: '0x9b71…33fe',
    ed: '1 of 1',
    roy: '7.5%',
    lic: 'EDITORIAL',
    caption: 'Alpaca, hard backlight',
    tags: 'alpaca llama nilgiris tamil nadu india backlight farm animal',
    companion: mockCompanion(require('@/assets/hotshoe/p6.jpg'), {
      score: 0.94, visual: 0.96, content: 0.92, changeType: 'recompression', deltaSeconds: 1.0,
      chainRef: '0x01b07eb3778295a6ef97710e4fbf0582c008af3b2d194ff828eda1ff9d81a9e1',
    }),
  },
  {
    img: require('@/assets/hotshoe/p7.jpg'),
    aspect: 0.7503,
    code: 'FRM_0344',
    date: '19 FEB 2026',
    place: 'PUSHKAR / 26.49N',
    status: 'LICENSED',
    res: '6048 × 4024 · CR3',
    cam: 'Canon EOS 5D IV',
    device: 'hotshoe',
    lens: '28mm f/2',
    iso: 'ISO 320',
    sh: '1/400 s',
    ap: 'f/2.8',
    gps: '26.4899, 74.5511',
    cap: '11:04:39 IST',
    tid: '#4044',
    cont: '0x9f2c…41ab',
    tx: '0x60df…a812',
    ed: '2 of 5',
    roy: '10%',
    lic: 'COMMERCIAL',
    caption: 'Cow in borrowed shades',
    tags: 'cow cattle pushkar rajasthan india sunglasses field farm animal humour',
    companion: mockCompanion(require('@/assets/hotshoe/p7.jpg'), {
      score: 0.79, visual: 0.74, content: 0.84, changeType: 'localized_edit', deltaSeconds: 4.1,
      chainRef: '0xb3af376329ba9f58d5d049f0c51334a97207147dbd348da65787f68ac80218c7',
      regionBbox: { x: 0.1, y: 0.15, width: 0.3, height: 0.25 },
    }),
  },
  {
    img: require('@/assets/hotshoe/p8.jpg'),
    aspect: 0.7595,
    code: 'FRM_0330',
    date: '05 FEB 2026',
    place: 'VALLEY OF FLOWERS / 30.73N',
    status: 'SEALED',
    res: '6048 × 4024 · CR3',
    cam: 'Canon EOS 5D IV',
    device: 'hotshoe',
    lens: '20mm f/1.8',
    iso: 'ISO 640',
    sh: '1/200 s',
    ap: 'f/3.5',
    gps: '30.7280, 79.6042',
    cap: '18:05:11 IST',
    tid: '#4030',
    cont: '0x9f2c…41ab',
    tx: '0x0fb2…dd47',
    ed: '1 of 1',
    roy: '7.5%',
    lic: 'EDITORIAL',
    caption: 'Retriever in wildflowers',
    tags: 'dog retriever golden valley of flowers uttarakhand india wildflowers daisy pet',
    companion: mockCompanion(require('@/assets/hotshoe/p8.jpg'), {
      score: 0.9, visual: 0.89, content: 0.91, changeType: 'crop', deltaSeconds: 1.6,
      chainRef: '0x150c4078475e928bf8d8853dfb7c3370aa615c96ce46f945e88bbce4521c710b',
    }),
  },
];

export const PHOTOS: Photo[] = PHOTOS_BASE.map((p, i) => ({ ...p, tone: Tones[i % Tones.length] }));

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Parses a `Photo.date` string ("12 APR 2026") into a comparable timestamp. */
export function parsePhotoDate(date: string): number {
  const [day, mon, year] = date.split(' ');
  return new Date(Number(year), MONTHS.indexOf(mon), Number(day)).getTime();
}
