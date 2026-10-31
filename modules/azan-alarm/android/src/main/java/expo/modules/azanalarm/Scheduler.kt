package expo.modules.azanalarm

import android.app.*
import android.content.*
import android.media.AudioAttributes
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.time.*
import androidx.work.*
import java.util.concurrent.TimeUnit

internal object Scheduler {
  val prayers = listOf("Fajr", "Dhuhr", "Asr", "Maghrib", "Isha")
  val lock = Any()
  const val NOTIFY_CHANNEL = "azan_reminders_v1"
  const val AUDIO_CHANNEL = "azan_playback_v1"
  fun prefs(c: Context) = c.getSharedPreferences("azan_state", Context.MODE_PRIVATE)
  fun state(c: Context): JSONObject? = prefs(c).getString("state", null)?.let { JSONObject(it) }
  fun audio(c: Context): File {
    val target = File(c.filesDir, "azan-recording")
    if (!target.isFile) synchronized(lock) {
      if (!target.isFile) c.assets.open("azan-default.ogg").use { source ->
        target.outputStream().use { output -> source.copyTo(output) }
      }
    }
    return target
  }
  fun exact(c: Context): Boolean = Build.VERSION.SDK_INT < 31 || c.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

  fun validate(s: JSONObject) {
    require(s.getString("mode") in listOf("off", "notification", "audio"))
    val m = s.getJSONObject("masjid")
    require(m.getString("id").matches(Regex("[a-z0-9-]+")))
    ZoneId.of(m.getString("timezone"))
    m.getInt("revision")
    val schedules = s.getJSONArray("schedules")
    require(schedules.length() <= 400)
    var previousEnd: LocalDate? = null
    for (i in 0 until schedules.length()) {
      val v = schedules.getJSONObject(i)
      val start = LocalDate.parse(v.getString("validFrom"))
      val end = LocalDate.parse(v.getString("validUntil"))
      require(!end.isBefore(start) && (previousEnd == null || start.isAfter(previousEnd)))
      previousEnd = end
      var previous: LocalTime? = null
      prayers.forEach { name ->
        val raw = v.getJSONObject("times").getString(name)
        require(raw.matches(Regex("(?:[01]\\d|2[0-3]):[0-5]\\d")))
        val t = LocalTime.parse(raw)
        require(previous == null || t.isAfter(previous))
        previous = t
      }
    }
  }

  fun configure(c: Context, raw: String) = synchronized(lock) {
    val s = JSONObject(raw)
    validate(s)
    require(s.getString("mode") != "audio" || audio(c).isFile) { "Import an azan recording first" }
    val origin = s.optString("baseUrl")
    if (origin.isNotEmpty()) {
      val uri = android.net.Uri.parse(origin)
      require(uri.scheme == "https" || (BuildConfig.DEBUG && uri.scheme == "http")) { "Use an HTTPS server" }
      require(!uri.host.isNullOrBlank() && uri.userInfo == null && uri.query == null && uri.fragment == null)
    }
    prefs(c).edit().putString("state", raw).apply()
    c.stopService(Intent(c, AzanAudioService::class.java))
    cancel(c, 99)
    reschedule(c)
    if (origin.isNotEmpty()) {
      val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
      val periodic = PeriodicWorkRequest.Builder(TimetableWorker::class.java, 15, TimeUnit.MINUTES)
        .setConstraints(constraints).build()
      WorkManager.getInstance(c).enqueueUniquePeriodicWork("masjid-sync", ExistingPeriodicWorkPolicy.KEEP, periodic)
    } else WorkManager.getInstance(c).cancelUniqueWork("masjid-sync")
    Unit
  }

  fun channels(c: Context) {
    val manager = c.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(NOTIFY_CHANNEL, "Azan reminders", NotificationManager.IMPORTANCE_HIGH))
    manager.createNotificationChannel(NotificationChannel(AUDIO_CHANNEL, "Azan audio controls", NotificationManager.IMPORTANCE_LOW).apply {
      setSound(null, null)
    })
  }

  private fun pending(c: Context, id: Int, intent: Intent): PendingIntent =
    PendingIntent.getBroadcast(c, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  private fun schedule(c: Context, time: Long, operation: PendingIntent) {
    val open = c.packageManager.getLaunchIntentForPackage(c.packageName)!!
    val show = PendingIntent.getActivity(c, 77, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    // User-requested prayer alarms use the alarm-clock path. Allow-while-idle
    // alarms can otherwise be throttled when the phone enters deep Doze.
    c.getSystemService(AlarmManager::class.java).setAlarmClock(AlarmManager.AlarmClockInfo(time, show), operation)
  }

  fun cancel(c: Context, id: Int) {
    val intent = Intent(c, AlarmReceiver::class.java).setAction("azan.$id")
    val pi = pending(c, id, intent)
    c.getSystemService(AlarmManager::class.java).cancel(pi)
    pi.cancel()
  }

  fun reschedule(c: Context) = synchronized(lock) {
    channels(c)
    prayers.indices.forEach { next(c, it) }
  }

  fun next(c: Context, index: Int) {
    cancel(c, index)
    val s = state(c) ?: return
    if (s.getString("mode") == "off" || !exact(c)) return
    val m = s.getJSONObject("masjid")
    val zone = ZoneId.of(m.getString("timezone"))
    val now = Instant.now().plusSeconds(1)
    val today = now.atZone(zone).toLocalDate()
    val schedules = s.getJSONArray("schedules")
    var target: Instant? = null
    for (i in 0 until schedules.length()) {
      val v = schedules.getJSONObject(i)
      val from = LocalDate.parse(v.getString("validFrom"))
      val until = LocalDate.parse(v.getString("validUntil"))
      var day = if (from.isAfter(today)) from else today
      val at = LocalTime.parse(v.getJSONObject("times").getString(prayers[index]))
      if (!day.atTime(at).atZone(zone).toInstant().isAfter(now)) day = day.plusDays(1)
      if (!day.isAfter(until)) {
        target = day.atTime(at).atZone(zone).toInstant()
        break
      }
    }
    val time = target?.toEpochMilli() ?: return
    val intent = Intent(c, AlarmReceiver::class.java).setAction("azan.$index")
      .putExtra("index", index).putExtra("masjidId", m.getString("id"))
      .putExtra("revision", m.getInt("revision")).putExtra("at", time)
    schedule(c, time, pending(c, index, intent))
  }

  fun test(c: Context, mode: String) {
    require(mode in listOf("audio", "notification"))
    require(exact(c)) { "Enable Alarms & reminders first" }
    require(mode != "audio" || audio(c).isFile) { "Import an azan recording first" }
    channels(c)
    val time = System.currentTimeMillis() + 15_000
    val intent = Intent(c, AlarmReceiver::class.java).setAction("azan.99")
      .putExtra("index", 99).putExtra("testMode", mode).putExtra("at", time)
    schedule(c, time, pending(c, 99, intent))
  }

  fun notification(c: Context, title: String, text: String, audio: Boolean = false): Notification {
    val open = c.packageManager.getLaunchIntentForPackage(c.packageName)!!
    val builder = Notification.Builder(c, if (audio) AUDIO_CHANNEL else NOTIFY_CHANNEL)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(title).setContentText(text)
      .setContentIntent(PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
      .setAutoCancel(!audio).setOngoing(audio)
    if (audio) {
      val stop = Intent(c, AzanAudioService::class.java).setAction("STOP")
      builder.addAction(Notification.Action.Builder(null, "Stop azan",
        PendingIntent.getService(c, 88, stop, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)).build())
    }
    return builder.build()
  }
}
