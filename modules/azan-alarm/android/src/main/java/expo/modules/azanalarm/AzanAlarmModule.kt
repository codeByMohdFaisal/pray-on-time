package expo.modules.azanalarm

import android.app.NotificationManager
import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class AzanAlarmModule : Module() {
  private fun context() = requireNotNull(appContext.reactContext)
  override fun definition() = ModuleDefinition {
    Name("AzanAlarm")
    Function("status") {
      val c = context()
      mapOf("exactAllowed" to Scheduler.exact(c),
        "notificationsAllowed" to c.getSystemService(NotificationManager::class.java).areNotificationsEnabled(),
        "audioReady" to Scheduler.audio(c).isFile,
        "lastSync" to Scheduler.prefs(c).getLong("lastSync", 0),
        "syncError" to Scheduler.prefs(c).getString("syncError", ""))
    }
    Function("getState") { Scheduler.prefs(context()).getString("state", null) }
    Function("configure") { state: String -> Scheduler.configure(context(), state) }
    Function("openExactSettings") {
      val c = context()
      if (android.os.Build.VERSION.SDK_INT >= 31) c.startActivity(
        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${c.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AsyncFunction("importAudio") { uri: String ->
      val c = context()
      val temporary = File(c.filesDir, "azan-import-temp")
      try {
        c.contentResolver.openInputStream(Uri.parse(uri)).use { source ->
          requireNotNull(source) { "Cannot read this recording" }
          temporary.outputStream().use { output ->
            val buffer = ByteArray(8192)
            var total = 0
            while (true) {
              val count = source.read(buffer)
              if (count < 0) break
              total += count
              require(total <= 30 * 1024 * 1024) { "Choose an audio file smaller than 30 MB" }
              output.write(buffer, 0, count)
            }
          }
        }
        val reader = MediaMetadataRetriever()
        try {
          reader.setDataSource(temporary.absolutePath)
          val duration = reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0
          require(duration in 1..600_000) { "Choose a playable recording under 10 minutes" }
        } finally { reader.release() }
        require(temporary.renameTo(Scheduler.audio(c))) { "Could not save recording" }
      } finally { temporary.delete() }
    }
    Function("test") { mode: String -> Scheduler.test(context(), mode) }
    Function("stopAudio") { context().stopService(Intent(context(), AzanAudioService::class.java)) }
  }
}
