// Approval card + sheet (PRD-1 §8.3.2). C8: Approve stays disabled until the amount has rendered,
// and only a tap on it approves.
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button, Card, Label, Muted, Sheet, useColors } from '../../ui/native';
import { decideApproval } from './store';
import type { Approval } from './types';

export const money = (cents: number, currency = 'USD') =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 ? 2 : 0,
  });
const amountOf = (a: Approval) =>
  a.amountCents != null ? money(a.amountCents, a.currency ?? 'USD') : 'No charge';
const DONE: Record<string, string> = {
  approved: 'You approved this',
  declined: 'You said not now',
  expired: 'This request expired',
};

export default function ApprovalSheet({ approval: a }: { approval: Approval }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [amountShown, setAmountShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setOpen(false);
    setAmountShown(false);
  };
  const decide = async (d: 'approve' | 'decline') => {
    setBusy(true);
    if (d === 'approve')
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const done = await decideApproval(a.approvalId, d);
    setBusy(false);
    if (done) close();
  };
  const pending = a.status === 'pending';
  return (
    <Card style={{ borderWidth: 1, borderColor: c.divider, padding: 12, gap: 8 }}>
      <Label style={{ fontWeight: '700' }}>{a.title}</Label>
      <Muted>
        {amountOf(a)}
        {a.payee ? ` · ${a.payee}` : ''}
        {a.simulated ? ' · Demo payment' : ''}
      </Muted>
      {pending ? (
        <Button
          title={a.kind === 'payment' ? 'Review payment' : 'Review'}
          accessibilityLabel={`Review: ${a.title}`}
          onPress={() => setOpen(true)}
        />
      ) : (
        <Muted>{DONE[a.status] ?? a.status}</Muted>
      )}
      <Sheet visible={open} title="Muse needs your OK" onClose={close}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
            {a.title}
          </Label>
          <Label>{a.detail}</Label>
          <View
            accessible
            accessibilityLabel={`Amount ${amountOf(a)}${a.payee ? `, to ${a.payee}` : ''}`}
            onLayout={() => setAmountShown(true)}
            style={{ backgroundColor: c.input, borderRadius: 8, padding: 12, gap: 2 }}
          >
            <Label style={{ fontSize: 28, lineHeight: 34, fontWeight: '800' }}>{amountOf(a)}</Label>
            {!!a.payee && <Muted>{`To ${a.payee}`}</Muted>}
            {a.simulated && (
              <Label style={{ fontWeight: '600' }}>Demo payment · no real money moves</Label>
            )}
          </View>
          {!!a.fallback && <Muted>{a.fallback}</Muted>}
          <Button
            title={a.amountCents != null ? `Approve ${amountOf(a)}` : 'Approve'}
            disabled={!amountShown || busy || !pending}
            onPress={() => void decide('approve')}
          />
          <Button
            // Decline says what happens (UX guide 1.1): a declined payment falls back to paying there.
            title={
              a.kind !== 'payment' ? 'Decline' : a.fallback ? 'Pay at the venue' : "Don't pay ahead"
            }
            secondary
            disabled={busy || !pending}
            onPress={() => void decide('decline')}
          />
        </ScrollView>
      </Sheet>
    </Card>
  );
}
