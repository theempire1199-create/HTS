package studio.hasan.tech.bio

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/** Device biometric gate. No enrollment storage needed — the OS verifies. */
object BiometricGate {

    fun canUse(context: Context): Boolean {
        return try {
            BiometricManager.from(context)
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
                BiometricManager.BIOMETRIC_SUCCESS
        } catch (_: Exception) {
            false
        }
    }

    fun prompt(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onFailedAttempt: () -> Unit,
        onErrorExit: () -> Unit,
    ) {
        val executor = ContextCompat.getMainExecutor(activity)
        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                onSuccess()
            }

            override fun onAuthenticationFailed() {
                onFailedAttempt()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                onErrorExit()
            }
        }
        val prompt = BiometricPrompt(activity, executor, callback)
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("HASAN TECH STUDIO")
            .setSubtitle("Touch the sensor to unlock")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setConfirmationRequired(false)
            .build()
        prompt.authenticate(info)
    }
}
