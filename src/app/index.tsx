import React, { useEffect, useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Link } from "expo-router";
import { usePilot } from "../state";
import { clock, dateInZone, nextPrayer, PRAYERS, scheduleOn } from "../domain";
import { Button, Card, colors, Note, Page, styles, Title } from "../ui";

export default function Home() {
  const p = usePilot();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  const today = dateInZone(now, p.state.masjid.timezone);
  const schedule = scheduleOn(p.state, today);
  const next = nextPrayer(p.state, now);
  const minutes = next
    ? Math.max(1, Math.ceil((next.at - now.getTime()) / 60000))
    : 0;
  const remaining =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  return (
    <Page>
      <Title
        eyebrow="A MOMENT TO RECONNECT"
        subtitle="Follow the five daily azan times at your chosen masjid."
      >
        Stay close to{"\n"}your masjid.
      </Title>
      {!p.state.baseUrl && (
        <Note>
          DEMONSTRATION · These are sample masjids and sample timings. Connect a
          pilot server before real use.
        </Note>
      )}
      <View style={{ gap: 8 }}>
        <Text style={styles.label}>YOUR MASJID</Text>
        <View style={local.picker}>
          <Picker
            accessibilityLabel="Select your masjid"
            enabled={!p.busy}
            selectedValue={p.state.masjid.id}
            onValueChange={(id) => void p.act(() => p.select(String(id)))}
            style={{ color: colors.ink }}
          >
            {p.masjids.map((m) => (
              <Picker.Item
                key={m.id}
                value={m.id}
                label={`${m.name} · ${m.area}`}
              />
            ))}
          </Picker>
        </View>
      </View>
      <View style={local.hero}>
        <View style={styles.row}>
          <Text style={local.heroLabel}>
            NEXT AZAN{next && next.date !== today ? ` · ${next.date}` : ""}
          </Text>
          <Text style={local.moon}>☾</Text>
        </View>
        <Text style={local.prayer}>{next?.prayer ?? "Timings needed"}</Text>
        <View style={[styles.row, { alignItems: "flex-end" }]}>
          <Text style={local.time}>{next ? clock(next.time) : "—"}</Text>
          {next && <Text style={local.countdown}>in {remaining}</Text>}
        </View>
        <View style={local.heroRule} />
        <Text style={local.heroSmall}>
          {p.state.mode === "off"
            ? "Alerts are off · Enable them in Settings"
            : p.status.exactAllowed && p.status.notificationsAllowed
              ? `${p.state.mode === "audio" ? "Azan audio" : "Notification"} selected · Uses downloaded timings offline`
              : "Alerts need attention · Check permissions in Settings"}
        </Text>
      </View>
      <Card>
        <View style={styles.row}>
          <Text style={styles.section}>Today’s azan times</Text>
          <Text style={styles.label}>
            {new Intl.DateTimeFormat("en-IN", {
              timeZone: p.state.masjid.timezone,
              day: "numeric",
              month: "short",
            }).format(now)}
          </Text>
        </View>
        {schedule ? (
          PRAYERS.map((prayer, i) => (
            <View
              key={prayer}
              style={[
                local.prayerRow,
                i < 4 && local.rule,
                next?.prayer === prayer && next.date === today && local.active,
              ]}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 13 }}
              >
                <Text style={local.number}>
                  {String(i + 1).padStart(2, "0")}
                </Text>
                <Text
                  style={[
                    local.prayerName,
                    next?.prayer === prayer && { color: colors.green },
                  ]}
                >
                  {prayer}
                </Text>
              </View>
              <Text style={local.prayerClock}>
                {clock(schedule.times[prayer])}
              </Text>
            </View>
          ))
        ) : (
          <Note>
            No confirmed timetable covers today. No azan is scheduled for
            missing dates. Ask the masjid volunteer to update it.
          </Note>
        )}
        <Text style={local.small}>
          Masjid timezone: {p.state.masjid.timezone}
          {schedule ? ` · Valid through ${schedule.validUntil}` : ""}
        </Text>
      </Card>
      <View style={{ gap: 12 }}>
        <View style={styles.row}>
          <Text style={[styles.body, { flex: 1, fontSize: 12 }]}>
            {p.state.baseUrl
              ? `Downloaded revision ${p.state.masjid.revision} · ${p.syncedAt || p.status.lastSync ? "Last checked " + new Date(p.syncedAt || p.status.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Saved on this phone"}`
              : "Sample timetable · Unverified"}
          </Text>
          <Link
            href="/settings"
            style={{ color: colors.green, fontWeight: "600", fontSize: 13 }}
          >
            Alert settings →
          </Link>
        </View>
        {!!p.state.baseUrl && (
          <Button
            label={p.busy ? "Checking…" : "Refresh timings"}
            secondary
            disabled={p.busy}
            onPress={() => void p.act(p.sync)}
          />
        )}
      </View>
    </Page>
  );
}
const local = StyleSheet.create({
  picker: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "#FFF",
    minHeight: 54,
  },
  hero: { backgroundColor: "#174F40", borderRadius: 24, padding: 24, gap: 8 },
  heroLabel: {
    color: "#BFDBC9",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.6,
  },
  moon: { fontSize: 33, color: "#E9CF97", lineHeight: 36 },
  prayer: { color: "#FFF", fontSize: 24, fontWeight: "500" },
  time: { color: "#FFF", fontSize: 37, fontWeight: "600", letterSpacing: -1 },
  countdown: { color: "#D6E8D9", fontSize: 13, marginBottom: 6 },
  heroRule: { height: 1, backgroundColor: "#3B6B58", marginVertical: 8 },
  heroSmall: { color: "#C4DDCD", fontSize: 11, lineHeight: 18 },
  prayerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 5,
    gap: 8,
  },
  rule: { borderBottomWidth: 1, borderBottomColor: "#EDF0E9" },
  active: { backgroundColor: "#F1F6F0", borderRadius: 10 },
  number: { color: "#9AA59B", fontSize: 11 },
  prayerName: { color: colors.ink, fontWeight: "500", fontSize: 15 },
  prayerClock: {
    color: colors.ink,
    fontWeight: "600",
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  small: { fontSize: 10, lineHeight: 17, color: colors.muted },
});
