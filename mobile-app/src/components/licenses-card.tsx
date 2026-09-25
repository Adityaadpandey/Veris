import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrutalBlock } from '@/components/brutal-block';
import {
  ARC_EXPLORER_API,
  ARC_EXPLORER_URL,
  CLAIM_SERVER_URL,
  LICENSED_TOPIC,
  LICENSE_CONTRACT_ADDRESS,
} from '@/constants/config';
import { Palette, Radius } from '@/constants/theme';
import { body, mono } from '@/constants/typography';
import { useConnection } from '@/hooks/use-connection';

const PRICE_USDC = 5;

type License = { licensee: string; photographer: string; expiresAt: number; boughtAt: string; txHash: string };

const addrOf = (topic: string) => ('0x' + topic.slice(-40)).toLowerCase();
const day = (d: string | number) => new Date(typeof d === 'number' ? d * 1000 : d).toLocaleDateString();
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Every Licensed event for one photo, newest first. Same indexer read as the web claim page. */
async function fetchLicenses(tokenId: string): Promise<License[]> {
  const want = BigInt(tokenId);
  const out: License[] = [];
  let query = '';
  // ponytail: scans up to 10 pages (500 events across the whole contract); switch to a per-token query if volume grows
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${ARC_EXPLORER_API}/addresses/${LICENSE_CONTRACT_ADDRESS}/logs${query}`);
    const data = await res.json();
    for (const l of data.items ?? []) {
      if (l.topics?.[0] !== LICENSED_TOPIC || BigInt(l.topics[1]) !== want) continue;
      out.push({
        licensee: addrOf(l.topics[2]),
        photographer: addrOf(l.topics[3]),
        expiresAt: Number(BigInt(l.data)),
        boughtAt: l.block_timestamp,
        txHash: l.transaction_hash,
      });
    }
    if (!data.next_page_params) break;
    query = '?' + new URLSearchParams(data.next_page_params).toString();
  }
  return out;
}

/** Who licensed this photo and who got paid, read straight from Arc. Read-only: buying happens on the web claim page. */
export function LicensesCard({ claimId }: { claimId: string }) {
  const { address } = useConnection();
  const [rows, setRows] = useState<License[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hasArcToken, setHasArcToken] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await (await fetch(`${CLAIM_SERVER_URL}/api/provenance/${claimId}`)).json();
        const arc = p?.provenance?.chains?.find((c: { chain: string }) => c.chain === 'arc');
        if (!arc?.tokenId) {
          if (!cancelled) setHasArcToken(false);
          return;
        }
        const list = await fetchLicenses(String(arc.tokenId));
        if (!cancelled) setRows(list);
      } catch {
        if (!cancelled) {
          setRows([]);
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claimId]);

  if (!hasArcToken) return null;

  const me = address?.toLowerCase();
  const now = Date.now() / 1000;
  const list = rows ?? [];
  const myEnd = Math.max(0, ...list.filter((r) => r.licensee === me).map((r) => r.expiresAt));
  const earned = list.filter((r) => r.photographer === me).length * PRICE_USDC;

  return (
    <View style={styles.wrap}>
      <Text style={mono(10, { spacing: 0.18, color: 'rgba(16,14,12,.5)' })}>LICENSES</Text>
      <BrutalBlock backgroundColor={Palette.cream} borderColor={Palette.ink} offset={3} radius={Radius.md} style={styles.block} contentStyle={styles.card}>
        {rows === null ? (
          <Text style={mono(10, { color: 'rgba(16,14,12,.5)' })}>Reading Arc…</Text>
        ) : (
          <>
            {myEnd > now && (
              <Text style={[body(12.5, { weight: 'semibold', color: Palette.green }), styles.note]}>
                You hold an active license until {day(myEnd)}.
              </Text>
            )}
            {myEnd > 0 && myEnd <= now && (
              <Text style={[body(12, { color: Palette.orange }), styles.note]}>
                Your license expired {day(myEnd)}. Buy again on the web claim page to renew.
              </Text>
            )}
            {earned > 0 && (
              <Text style={[body(12.5, { weight: 'semibold', color: Palette.ink }), styles.note]}>
                You earned {earned} USDC from this photo, paid straight to your wallet.
              </Text>
            )}
            {failed && <Text style={mono(10, { color: Palette.orange })}>Couldn't reach the Arc indexer. Pull to refresh later.</Text>}
            {!failed && list.length === 0 && (
              <Text style={mono(10, { color: 'rgba(16,14,12,.5)' })}>
                No licenses yet. Licensing costs {PRICE_USDC} USDC for 30 days and goes to the photographer.
              </Text>
            )}
            {list.map((r) => {
              const active = r.expiresAt > now;
              return (
                <Pressable key={r.txHash} onPress={() => Linking.openURL(`${ARC_EXPLORER_URL}/tx/${r.txHash}`)} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={mono(11, { color: Palette.ink })}>
                      {shortAddr(r.licensee)}
                      {r.licensee === me ? ' (you)' : ''}
                    </Text>
                    <Text style={mono(9.5, { color: 'rgba(16,14,12,.5)' })}>
                      bought {day(r.boughtAt)} · ends {day(r.expiresAt)}
                    </Text>
                  </View>
                  <Text style={mono(9.5, { weight: 'semibold', color: active ? Palette.green : 'rgba(16,14,12,.45)' })}>
                    {active ? 'ACTIVE' : 'EXPIRED'}
                  </Text>
                </Pressable>
              );
            })}
          </>
        )}
      </BrutalBlock>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 22 },
  block: { marginTop: 8 },
  card: { padding: 14, gap: 4 },
  note: { marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(16,14,12,.14)',
  },
});
