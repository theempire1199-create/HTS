package studio.hasan.tech.ui.screens

import android.content.Context
import android.os.Vibrator
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import kotlinx.coroutines.delay
import studio.hasan.tech.data.AuthStore
import studio.hasan.tech.ui.nav.Routes
import studio.hasan.tech.ui.theme.HtsBg
import studio.hasan.tech.ui.theme.HtsMuted
import studio.hasan.tech.ui.theme.HtsPurple

/** Shared tiny helpers (one definition, used by all screens). */
fun buzz(ctx: Context) {
    try {
        val vib = ctx.getSystemService(Vibrator::class.java) ?: return
        vib.vibrate(
            android.os.VibrationEffect.createOneShot(
                30,
                android.os.VibrationEffect.DEFAULT_AMPLITUDE,
            ),
        )
    } catch (_: Exception) {
    }
}

fun toast(ctx: Context, msg: String) {
    Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()
}

/** 10-second splash. Tap skips. Session -> code gate, else login. */
@Composable
fun SplashScreen(nav: NavController) {
    val ctx = LocalContext.current
    val store = remember { AuthStore(ctx) }
    var gone by remember { mutableStateOf(false) }
    fun go() {
        if (gone) return
        gone = true
        buzz(ctx)
        if (store.currentUser() != null) {
            nav.navigate(Routes.CODE) { popUpTo(Routes.SPLASH) { inclusive = true } }
        } else {
            nav.navigate(Routes.LOGIN) { popUpTo(Routes.SPLASH) { inclusive = true } }
        }
    }
    LaunchedEffect(Unit) {
        delay(10_000)
        go()
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(HtsBg)
            .clickable { go() },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("HTS.OS", fontSize = 52.sp, fontWeight = FontWeight.Black, color = HtsPurple)
            Spacer(Modifier.height(14.dp))
            Box(Modifier.width(220.dp).height(3.dp).background(HtsPurple))
            Spacer(Modifier.height(14.dp))
            Text(
                "the independent tech......",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = HtsMuted,
            )
            Spacer(Modifier.height(48.dp))
            Text("developed by-", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = HtsMuted)
            Text("HASAN TECH STUDIO", fontSize = 14.sp, fontWeight = FontWeight.Black, color = HtsPurple)
        }
    }
}
