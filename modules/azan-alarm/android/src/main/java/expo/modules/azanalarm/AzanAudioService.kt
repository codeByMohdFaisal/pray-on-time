package expo.modules.azanalarm

import android.app.Service
import android.content.Intent
import android.media.*
import android.os.*

class AzanAudioService : Service() {
  private var player: MediaPlayer? = null
  private var focus: AudioFocusRequest? = null
  private val timeout = Handler(Looper.getMainLooper())
  override fun onBind(intent: Intent?) = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == "STOP" || intent == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    Scheduler.channels(this)
    startForeground(700, Scheduler.notification(this, intent.getStringExtra("title") ?: "Azan", intent.getStringExtra("text") ?: "", true))
    player?.release()
    val manager = getSystemService(AudioManager::class.java)
    focus?.let { manager.abandonAudioFocusRequest(it) }
    val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      .setAudioAttributes(attributes).setOnAudioFocusChangeListener { change ->
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) stopSelf()
      }.build()
    focus = request
    if (manager.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      player = MediaPlayer().apply {
        setAudioAttributes(attributes)
        setWakeMode(this@AzanAudioService, PowerManager.PARTIAL_WAKE_LOCK)
        setDataSource(Scheduler.audio(this@AzanAudioService).absolutePath)
        setOnCompletionListener { stopSelf() }
        setOnErrorListener { _, _, _ -> stopSelf(); true }
        setOnPreparedListener { it.start() }
        prepareAsync()
      }
      timeout.removeCallbacksAndMessages(null)
      timeout.postDelayed({ stopSelf() }, 10 * 60 * 1000L)
    } catch (_: Exception) { stopSelf() }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    timeout.removeCallbacksAndMessages(null)
    player?.release()
    player = null
    focus?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
