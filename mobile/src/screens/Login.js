import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { formatLinkCode, normalizeLinkCode, parseLinkPayload } from '../../../app/supabase/functions/_shared/deviceLink.js';
import { supabase, WEB_URL } from '../supabaseClient.js';
import { haptic } from '../haptics.js';
import { font, useTheme } from '../theme.js';
import { Button, Headline, Notice, T } from '../ui.js';

// Sign in by pairing with the website: on the web, account menu → Connect your phone shows a
// QR code and an 8-character code. The phone scans or types it; the device-link function
// returns a one-time token that becomes the phone's own session. No password on the phone.

async function readFunctionError(error, fallback) {
  try { return (await error?.context?.json())?.error ?? fallback; } catch { return fallback; }
}

async function connectWithCode(raw) {
  const code = parseLinkPayload(raw);
  if (!code) throw new Error('Codes are 8 letters and numbers, like ABCD-EFGH.');
  const { data, error } = await supabase.functions.invoke('device-link', { body: { action: 'redeem', code } });
  if (error) throw new Error(await readFunctionError(error, 'That code didn’t work. Make a new one on the website.'));
  if (!data?.token_hash) throw new Error('That code didn’t work. Make a new one on the website.');
  let res = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  if (res.error) res = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' });
  if (res.error) throw new Error('The code was accepted but signing in failed. Make a new code and try again.');
}

// Show what's typed as XXXX-XXXX while keeping only valid characters.
const tidy = (v) => {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
};

export default function Login() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('code'); // 'code' | 'email'
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const connect = async (raw) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await connectWithCode(raw);
      haptic('success');
      // Success: the auth listener in App.js switches to the signed-in screens.
    } catch (e) {
      haptic('error');
      setError(e?.message ?? 'Couldn’t connect. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  // Opened from a pairing link (praxio://link?code=…, e.g. the website QR scanned with the
  // phone's own camera in an installed build): pair straight away.
  useEffect(() => {
    const handle = (url) => {
      if (typeof url !== 'string' || !/[?&]code=/.test(url)) return;
      const c = parseLinkPayload(url);
      if (!c) return;
      setMode('code');
      setCode(formatLinkCode(c));
      connect(url);
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub?.remove?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = Boolean(normalizeLinkCode(code));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 28 }} keyboardShouldPersistTaps="handled">
        <T kind="bold" size={24} style={{ letterSpacing: -1.4 }}>praxio<T kind="bold" size={24} color={t.c.accent}>.</T></T>

        {mode === 'code' ? (
          <>
            <View style={{ gap: 12 }}>
              <Headline lead="Connect your" accent="phone." size={44} />
              <T size={16} color={t.c.text2}>On the Praxio website, open your account menu and choose “Connect your phone”. Then scan the QR code or type the code here.</T>
            </View>

            <View style={{ gap: 14 }}>
              {Platform.OS !== 'web' && <Button title="Scan QR code" onPress={() => { setError(''); setScanning(true); }} disabled={busy} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} />
                <T size={13} color={t.c.text3}>{Platform.OS !== 'web' ? 'or type the code' : 'type the code'}</T>
                <View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} />
              </View>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(tidy(v))}
                placeholder="ABCD-EFGH"
                placeholderTextColor={t.c.text3}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={9}
                returnKeyType="go"
                onSubmitEditing={() => ready && connect(code)}
                accessibilityLabel="Connection code"
                editable={!busy}
                style={[{
                  minHeight: 64, borderRadius: 18, backgroundColor: t.c.surface2, color: t.c.text, fontSize: 28,
                  textAlign: 'center', letterSpacing: 4,
                }, font(t, 'semibold')]}
              />
              {error ? <Notice tone="bad">{error}</Notice> : null}
              <Button kind={Platform.OS !== 'web' ? 'ghost' : 'primary'} title="Connect →" onPress={() => connect(code)} disabled={!ready} busy={busy} />
            </View>

            <View style={{ gap: 4 }}>
              <Button kind="link" title="No account yet? Create one on the web" onPress={() => Linking.openURL(WEB_URL)} />
              <Button kind="link" title="Use email and password instead" onPress={() => { setError(''); setMode('email'); }} />
            </View>
          </>
        ) : (
          <EmailSignIn onBack={() => setMode('code')} />
        )}
      </ScrollView>

      <ScanModal
        visible={scanning}
        onClose={() => setScanning(false)}
        onCode={(raw) => { setScanning(false); const c = parseLinkPayload(raw); if (c) setCode(formatLinkCode(c)); connect(raw); }}
      />
    </KeyboardAvoidingView>
  );
}

function ScanModal({ visible, onClose, onCode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  const onScanned = ({ data }) => {
    if (handled.current) return;
    if (!parseLinkPayload(data)) return; // ignore unrelated QR codes and keep scanning
    handled.current = true;
    onCode(data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => { handled.current = false; }}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={visible ? onScanned : undefined}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 16, backgroundColor: t.c.bg }}>
            <Headline lead="Allow the" accent="camera." size={36} />
            <T color={t.c.text2}>
              {permission && !permission.canAskAgain
                ? 'Camera access is turned off for Praxio. Turn it on in your phone’s Settings, or close this and type the code instead.'
                : 'Praxio only uses the camera to read the QR code from the website.'}
            </T>
            {permission && !permission.canAskAgain
              ? <Button title="Open Settings" onPress={() => Linking.openSettings().catch(() => {})} />
              : <Button title="Allow camera" onPress={() => requestPermission().catch(() => {})} />}
          </View>
        )}
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 12, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T kind="medium" color="#FFFFFF" style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 }}>{permission?.granted ? 'Point at the QR code on the website' : ''}</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Close scanner" onPress={onClose}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <T size={20} color="#FFFFFF">✕</T>
          </Pressable>
        </View>
        {permission?.granted && (
          <View pointerEvents="none" style={{ position: 'absolute', alignSelf: 'center', top: '30%', width: 240, height: 240, borderRadius: 28, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' }} />
        )}
      </View>
    </Modal>
  );
}

function EmailSignIn({ onBack }) {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    setError('');
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e) setError(e.message === 'Invalid login credentials' ? 'That email and password don’t match a Praxio account.' : e.message);
    } catch {
      setError('Couldn’t reach Praxio. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const input = [{ minHeight: 54, borderRadius: 16, paddingHorizontal: 18, backgroundColor: t.c.surface2, color: t.c.text, fontSize: 16 }, font(t, 'regular')];

  return (
    <>
      <View style={{ gap: 12 }}>
        <Headline lead="Welcome" accent="back." size={44} />
        <T size={16} color={t.c.text2}>Sign in with the email and password you use on the website.</T>
      </View>
      <View style={{ gap: 14 }}>
        <View style={{ gap: 8 }}>
          <T size={14} color={t.c.text2}>Email</T>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address"
            textContentType="emailAddress" placeholder="you@example.com" placeholderTextColor={t.c.text3} style={input} accessibilityLabel="Email" />
        </View>
        <View style={{ gap: 8 }}>
          <T size={14} color={t.c.text2}>Password</T>
          <View>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry={!show} autoComplete="current-password" textContentType="password"
              placeholderTextColor={t.c.text3} style={[...input, { paddingRight: 80 }]} onSubmitEditing={signIn} returnKeyType="go" accessibilityLabel="Password" />
            <View style={{ position: 'absolute', right: 6, top: 2 }}>
              <Button kind="link" title={show ? 'Hide' : 'Show'} onPress={() => setShow(!show)} style={{ paddingHorizontal: 12 }} />
            </View>
          </View>
        </View>
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <Button title="Continue →" onPress={signIn} busy={busy} />
      </View>
      <View style={{ gap: 4 }}>
        <Button kind="link" title="Forgot your password?" onPress={() => Linking.openURL(WEB_URL)} />
        <Button kind="link" title="← Connect with a code instead" onPress={onBack} />
      </View>
    </>
  );
}
