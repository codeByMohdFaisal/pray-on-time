package expo.modules.azanalarm

import android.app.NotificationManager
import android.content.*

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(c: Context, intent: Intent) = synchronized(Scheduler.lock) {
    val index = intent.getIntExtra("index", -1)
    if (index !in 0..4 && index != 99) return@synchronized
    val s = Scheduler.state(c)
    if (index != 99) {
      if (s == null || s.getString("mode") == "off") return@synchronized
      val m = s.getJSONObject("masjid")
      if (m.getString("id") != intent.getStringExtra("masjidId") || m.getInt("revision") != intent.getIntExtra("revision", -1)) return@synchronized
      Scheduler.next(c, index)
    }
    // Never play a stale azan after a long OS delivery delay.
    val delay = System.currentTimeMillis() - intent.getLongExtra("at", 0)
    if (delay < -1000 || delay > 120_000) return@synchronized
    val mode = if (index == 99) intent.getStringExtra("testMode") else s!!.getString("mode")
    val title = if (index == 99) "Test azan alert" else "${Scheduler.prayers[index]} azan"
    val text = if (index == 99) "Offline alarm test" else s!!.getJSONObject("masjid").getString("name")
    val manager = c.getSystemService(NotificationManager::class.java)
    // Audio playback is opt-in and requires visible notifications as well.
    if (!manager.areNotificationsEnabled()) return@synchronized
    if (mode == "audio" && Scheduler.audio(c).isFile) {
      val service = Intent(c, AzanAudioService::class.java).putExtra("title", title).putExtra("text", text)
      try { c.startForegroundService(service) }
      catch (_: Exception) { manager.notify(index + 100, Scheduler.notification(c, title, "$text · Open app to check audio")) }
    } else manager.notify(index + 100, Scheduler.notification(c, title, text))
  }
}

class RestoreReceiver : BroadcastReceiver() {
  override fun onReceive(c: Context, intent: Intent) {
    // Boot restores schedules only. It never starts media playback.
    try { Scheduler.reschedule(c) } catch (_: Exception) { /* UI exposes permission status. */ }
  }
}
