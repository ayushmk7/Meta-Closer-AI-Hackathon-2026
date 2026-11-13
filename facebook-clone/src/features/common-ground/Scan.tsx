// Verify in person, native: my code as a QR (View grid, pure JS) + scan theirs with the camera.
// Typed entry (ScanPage) stays for a denied camera or the simulator.
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import qrcode from 'qrcode-generator';
import { Button, Card, Label, Muted } from '../../ui/native';
import { ScanPage } from './Scan.web';

const QR_SIZE = 200;

export function QrCode({ value }: { value: string }) {
  const rows = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) => qr.isDark(r, c)),
    );
  }, [value]);
  const cell = Math.floor(QR_SIZE / rows.length);
  return (
    // Always black on white with a quiet zone, also in dark mode, so cameras can read it.
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="QR code of your code"
      style={{ backgroundColor: '#fff', padding: cell * 4, borderRadius: 8 }}
    >
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((dark, c) => (
            <View
              key={c}
              style={{ width: cell, height: cell, backgroundColor: dark ? '#000' : '#fff' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function Camera({ submit }: { submit(code: string): void }) {
  const [permission, request] = useCameraPermissions();
  const [open, setOpen] = useState(false);
  const last = useRef(''); // the camera reports the same code many times a second
  const start = async () => setOpen(!!permission?.granted || (await request()).granted);
  return (
    <Card style={{ padding: 16, gap: 10 }}>
      <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
        Scan their code
      </Label>
      {open ? (
        <CameraView
          accessibilityLabel="Camera, point it at their code"
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (data === last.current) return;
            last.current = data;
            submit(data);
          }}
          style={{ height: 280, borderRadius: 8, overflow: 'hidden' }}
        />
      ) : (
        <Button title="Open camera" icon="camera-outline" onPress={() => void start()} />
      )}
      {permission && !permission.granted && !permission.canAskAgain && (
        <Muted>Camera is off for this app. Type their code below instead.</Muted>
      )}
    </Card>
  );
}

export default function ScanScreen() {
  return (
    <ScanPage
      qr={(code) => <QrCode value={code} />}
      camera={(submit) => <Camera submit={submit} />}
    />
  );
}
