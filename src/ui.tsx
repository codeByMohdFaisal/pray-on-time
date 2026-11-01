import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePilot } from './state';

export const colors = { ink: '#17382F', muted: '#687970', green: '#17674F', light: '#EAF2EC', paper: '#F7F8F3', border: '#DFE6DD', amber: '#805B18', white: '#FFFFFF' };
export function Page({ children }: { children: React.ReactNode }) {
  const { ready, busy, error } = usePilot();
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.brand}><View style={styles.mark}><Text style={styles.markText}>☾</Text></View><Text style={styles.brandName}>PrayOnTime</Text>{busy && <ActivityIndicator color={colors.green} />}</View>
      {!ready ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.green} /> : children}
      {!!error && <View accessibilityRole="alert" style={styles.error}><Text style={{ color: '#913C2C' }}>{error}</Text></View>}
      <Text style={styles.footer}>Your masjid. Your timings.</Text>
    </ScrollView>
  </SafeAreaView>;
}
export function Title({ eyebrow, children, subtitle }: { eyebrow: string; children: React.ReactNode; subtitle?: string }) {
  return <View style={{ gap: 8, marginBottom: 24 }}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{children}</Text>{subtitle && <Text style={styles.body}>{subtitle}</Text>}</View>;
}
export function Card({ children }: { children: React.ReactNode }) { return <View style={styles.card}>{children}</View>; }
export function Button({ label, onPress, secondary = false, disabled = false }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}><Text style={[styles.buttonText, secondary && { color: colors.green }]}>{label}</Text></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 7 }}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#8B958F" {...props} style={[styles.input, props.style]} /></View>;
}
export function Note({ children }: { children: React.ReactNode }) { return <View style={styles.note}><Text style={styles.noteText}>{children}</Text></View>; }
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  page: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 24, paddingBottom: 36, gap: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  mark: { height: 35, width: 35, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#F1D6A0', fontSize: 28, lineHeight: 34 },
  brandName: { fontSize: 17, fontWeight: '700', color: colors.ink, flex: 1 },
  pilot: { fontWeight: '400', fontSize: 12, color: colors.muted },
  eyebrow: { color: colors.green, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  title: { fontSize: 32, lineHeight: 39, fontWeight: '700', color: colors.ink, letterSpacing: -1 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  card: { backgroundColor: colors.white, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 15 },
  section: { fontSize: 17, fontWeight: '700', color: colors.ink },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted },
  input: { minHeight: 49, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, color: colors.ink, backgroundColor: colors.white, fontSize: 15 },
  button: { backgroundColor: colors.green, borderRadius: 13, paddingHorizontal: 16, minHeight: 49, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: colors.light },
  buttonText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  note: { backgroundColor: '#F7EEDB', borderRadius: 14, padding: 14 },
  noteText: { fontSize: 12, lineHeight: 19, color: colors.amber },
  error: { backgroundColor: '#FBECE7', padding: 16, borderRadius: 14 },
  footer: { color: '#859187', fontSize: 11, textAlign: 'center', paddingTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
