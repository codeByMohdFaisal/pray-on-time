package expo.modules.azanalarm

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class TimetableWorker(c: Context, parameters: WorkerParameters) : Worker(c, parameters) {
  override fun doWork(): Result {
    val c = applicationContext
    val before = synchronized(Scheduler.lock) { Scheduler.state(c) } ?: return Result.success()
    val base = before.optString("baseUrl")
    if (base.isBlank()) return Result.success()
    val id = before.getJSONObject("masjid").getString("id")
    var conn: HttpURLConnection? = null
    try {
      conn = URL("$base/masjids/$id/schedule").openConnection() as HttpURLConnection
      conn.connectTimeout = 10_000
      conn.readTimeout = 10_000
      conn.instanceFollowRedirects = false
      require(conn.responseCode == 200)
      val raw = conn.inputStream.use { input ->
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
          val count = input.read(buffer)
          if (count < 0) break
          output.write(buffer, 0, count)
          require(output.size() <= 262144)
        }
        val bytes = output.toByteArray()
        require(bytes.size <= 262144)
        bytes.toString(Charsets.UTF_8)
      }
      val update = JSONObject(raw)
      synchronized(Scheduler.lock) {
        val current = Scheduler.state(c) ?: return Result.success()
        if (current.getJSONObject("masjid").getString("id") != id || current.optString("baseUrl") != base) return Result.success()
        require(update.getJSONObject("masjid").getString("id") == id)
        require(update.getJSONObject("masjid").getInt("revision") >= current.getJSONObject("masjid").getInt("revision"))
        update.put("mode", current.getString("mode")).put("baseUrl", base)
        Scheduler.validate(update)
        // Avoid stopping an in-progress azan when nothing actually changed.
        if (update.getJSONObject("masjid").getInt("revision") != current.getJSONObject("masjid").getInt("revision")) {
          Scheduler.configure(c, update.toString())
        }
        Scheduler.prefs(c).edit().putLong("lastSync", System.currentTimeMillis()).remove("syncError").apply()
      }
      return Result.success()
    } catch (_: Exception) {
      Scheduler.prefs(c).edit().putString("syncError", "Could not sync. Using downloaded timings.").apply()
      return Result.retry()
    } finally { conn?.disconnect() }
  }
}
