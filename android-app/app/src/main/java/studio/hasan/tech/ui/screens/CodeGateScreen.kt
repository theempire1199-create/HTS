package studio.hasan.tech.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.FragmentActivity
import androidx.navigation.NavController
import studio.hasan.tech.bio.BiometricGate
import studio.hasan.tech.data.AuthStore
import studio.hasan.tech.notify.HtsNotify
import studio.hasan.tech.ui.nav.Routes
import studio.hasan.tech.ui.theme.HtsBg
import studio.hasan.tech.ui.theme.HtsError
import studio.hasan.tech.ui.theme.HtsInk
import studio.hasan.tech.ui.theme.HtsMuted
import studio.hasan.tech.ui.theme.HtsPurple

/** Code gate for already-logged-in users. Auto biometric first, code fallback. */
@Composable
fun CodeGateScreen(nav: NavController) {
    val ctx = LocalContext.current
    val activity = ctx as? FragmentActivity
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }
    var strikes by remember { mutableIntStateOf(0) }
    var showSensor by remember { mutableStateOf(false) }

    fun goMain() {
        nav.navigate(Routes.MAIN) { popUpTo(Routes.CODE) { inclusive = true } }
    }

    fun fireBiometric() {
        val act = activity ?: return
        BiometricGate.prompt(
            activity = act,
            onSuccess = {
                HtsNotify.push(ctx, "HASAN TECH STUDIO", "Unlocked with fingerprint.")
                toast(ctx, "Welcome back!")
                goMain()
            },
            onFailedAttempt = {
                strikes += 1
                if (strikes >= 3) {
                    showSensor = false
                    toast(ctx, "Use your code instead.")
                }
            },
            onErrorExit = {
                // Silent cancel/deny — code card is already there.
            },
        )
    }

    LaunchedEffect(Unit) {
        showSensor = BiometricGate.canUse(ctx)
        if (showSensor) fireBiometric()
    }

    Column(
        modifier = Modifier.fillMaxSize().background(HtsBg).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(28.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                Modifier.padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Enter Code", fontSize = 22.sp, fontWeight = FontWeight.Black, color = HtsInk)
                Text(
                    "Fill your 6-digit access code",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = HtsMuted,
                )
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    repeat(6) { i ->
                        Box(
                            Modifier
                                .size(13.dp)
                                .clip(CircleShape)
                                .background(if (i < code.length) HtsPurple else Color.White)
                                .border(2.dp, HtsPurple, CircleShape),
                        )
                    }
                }
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { raw ->
                        val clean = raw.filter { it.isDigit() }.take(6)
                        code = clean
                        error = false
                        if (clean.length == 6) {
                            if (clean == AuthStore.ACCESS_PASSCODE) {
                                HtsNotify.push(ctx, "HASAN TECH STUDIO", "Unlocked with access code.")
                                code = ""
                                toast(ctx, "Welcome back!")
                                goMain()
                            } else {
                                error = true
                                toast(ctx, "Wrong code, try again.")
                                code = ""
                            }
                        }
                    },
                    placeholder = { Text("••••••") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (error) {
                    Spacer(Modifier.height(8.dp))
                    Text("Wrong code, try again.", color = HtsError, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
                if (showSensor) {
                    Spacer(Modifier.height(16.dp))
                    SensorButton(onClick = { fireBiometric() })
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "fingerprint unlock",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = HtsMuted,
                    )
                }
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = {
                    nav.navigate(Routes.LOGIN) { popUpTo(Routes.CODE) { inclusive = true } }
                }) {
                    Text("try another way", color = HtsPurple, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun SensorButton(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(62.dp)
            .clip(CircleShape)
            .background(HtsPurple)
            .border(1.5.dp, Color.White, CircleShape)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(32.dp)) {
            drawCircle(color = Color.White, radius = size.minDimension / 2.6f)
            drawCircle(color = HtsPurple, radius = size.minDimension / 3.4f)
        }
    }
}
