package studio.hasan.tech.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import studio.hasan.tech.MainActivity
import studio.hasan.tech.R
import studio.hasan.tech.data.AuthStore

/** Local event notifications. No server — single-user, like the web app. */
object HtsNotify {

    const val CHANNEL_ID = "hts-events"

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                manager.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "HTS Alerts", NotificationManager.IMPORTANCE_DEFAULT),
                )
            }
        } catch (_: Exception) {
        }
    }

    fun push(context: Context, title: String, body: String) {
        try {
            if (!AuthStore(context).isNotifyOn()) return
            ensureChannel(context)
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pending = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_hts)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setVibrate(longArrayOf(100, 50, 100))
                .build()
            val id = (System.currentTimeMillis() and 0x7fffffff).toInt()
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: Exception) {
            // Notifications must never break app flow.
        }
    }
}
