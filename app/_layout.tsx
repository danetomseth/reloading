import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { C } from '../lib/theme';

SplashScreen.preventAutoHideAsync();

// remembers that this device has signed in before, so we don't bounce the user
// to the (network-only) login screen when they're offline with an expired token
const SEEN_KEY = 'lrs.hasSignedIn';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [everSignedIn, setEverSignedIn] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    let settled = false;
    const markSeen = () => { setEverSignedIn(true); AsyncStorage.setItem(SEEN_KEY, '1'); };
    const finish = (s: Session | null) => {
      if (settled) return;
      settled = true;
      setSession(s);
      if (s) markSeen();
      setReady(true);
    };

    // Decide whether this device has ever authenticated — without needing the network.
    // Trust either our own flag OR the presence of a persisted Supabase session token,
    // so an offline launch with an expired token is never bounced to login.
    (async () => {
      try {
        const [flag, keys] = await Promise.all([
          AsyncStorage.getItem(SEEN_KEY),
          AsyncStorage.getAllKeys(),
        ]);
        const hasStoredSession = keys.some(k => k.includes('auth-token'));
        if (flag === '1' || hasStoredSession) {
          setEverSignedIn(prev => (prev === null ? true : prev));
          if (hasStoredSession && flag !== '1') AsyncStorage.setItem(SEEN_KEY, '1');
        } else {
          setEverSignedIn(prev => (prev === null ? false : prev));
        }
      } catch {
        setEverSignedIn(prev => (prev === null ? false : prev));
      }
    })();

    // getSession() reads local storage but may try a network token refresh;
    // offline that can stall, so cap the wait and launch from cache regardless.
    supabase.auth.getSession().then(({ data }) => finish(data.session)).catch(() => finish(null));
    const timer = setTimeout(() => { setEverSignedIn(prev => (prev === null ? false : prev)); finish(null); }, 3000);

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s) markSeen();
      if (event === 'SIGNED_OUT') { setEverSignedIn(false); AsyncStorage.removeItem(SEEN_KEY); }
    });
    return () => { clearTimeout(timer); sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (ready && everSignedIn !== null) SplashScreen.hideAsync();
  }, [ready, everSignedIn]);

  useEffect(() => {
    if (!ready || everSignedIn === null) return;
    const onLogin = segments[0] === 'login';
    // only force login if there's no session AND this device has never signed in
    if (!session && !everSignedIn && !onLogin) router.replace('/login');
    else if (session && onLogin) router.replace('/');
  }, [ready, session, everSignedIn, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.surface },
          headerTintColor: C.text,
          headerTitleStyle: { fontWeight: '800', fontSize: 18 },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
