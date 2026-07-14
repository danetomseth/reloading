import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Image } from 'react-native';
import { supabase } from '../lib/supabase';
import { C } from '../lib/theme';

export default function Login() {
  const [mode,     setMode]     = useState<'signin' | 'signup'>('signin');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [busy,     setBusy]     = useState(false);
  const [msg,      setMsg]      = useState<string | null>(null);
  const [err,      setErr]      = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setMsg(null);
    const em = email.trim();
    if (!em || !password) { setErr('Enter your email and password.'); return; }
    if (mode === 'signup' && password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: em, password });
        if (error) { setErr(error.message); }
        else if (!data.session) {
          // email confirmation is enabled on the project
          setMode('signin');
          setMsg('Account created. Check your email to confirm, then sign in.');
        }
        // if data.session exists, the root layout redirects into the app automatically
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password });
        if (error) setErr(error.message);
      }
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Image source={require('../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>LRS Tracker</Text>
        <Text style={styles.subtitle}>{mode === 'signin' ? 'Sign in to your account' : 'Create an account'}</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={C.muted}
          secureTextEntry
          autoCapitalize="none"
          textContentType={mode === 'signin' ? 'password' : 'newPassword'}
        />

        {err && <Text style={styles.err}>{err}</Text>}
        {msg && <Text style={styles.msg}>{msg}</Text>}

        <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy}>
          {busy
            ? <ActivityIndicator color={C.white} />
            : <Text style={styles.btnText}>{mode === 'signin' ? 'Sign In' : 'Sign Up'}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setErr(null); setMsg(null); }}>
          <Text style={styles.switch}>
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: C.bg },
  inner:    { flex: 1, justifyContent: 'center', padding: 28 },
  logo:     { width: 96, height: 96, alignSelf: 'center', marginBottom: 12 },
  title:    { color: C.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: C.textSoft, fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 28 },
  input: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8,
    color: C.text, fontSize: 15, padding: 13, marginBottom: 12,
  },
  err:  { color: C.red, fontSize: 13, marginBottom: 10 },
  msg:  { color: C.green, fontSize: 13, marginBottom: 10 },
  btn:  { backgroundColor: C.accent, borderRadius: 8, padding: 15, alignItems: 'center', marginTop: 4 },
  btnText: { color: C.white, fontWeight: '700', fontSize: 15 },
  switch: { color: C.accent, fontSize: 13, textAlign: 'center', marginTop: 18 },
});
