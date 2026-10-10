package studio.hasan.tech.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Re-arm notification channel after reboot. Tiny + harmless. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            HtsNotify.ensureChannel(context)
        }
    }
}
