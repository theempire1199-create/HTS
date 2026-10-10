package studio.hasan.tech.ui.screens

import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.navigation.NavController
import studio.hasan.tech.data.AuthStore
import studio.hasan.tech.data.isValidIdentifier
import studio.hasan.tech.notify.HtsNotify
import studio.hasan.tech.ui.nav.Routes
import studio.hasan.tech.ui.theme.HtsBg
import studio.hasan.tech.ui.theme.HtsError
import studio.hasan.tech.ui.theme.HtsInk
import studio.hasan.tech.ui.theme.HtsPurple
import studio.hasan.tech.ui.theme.HtsPurpleLight

/** Prefill for the signup wizard when login meets an unknown identifier. */
object SignupPrefill {
    var identifier: String? = null
}

@Composable
fun LoginScreen(nav: NavController) {
    val ctx = LocalContext.current
    val store = remember { AuthStore(ctx) }
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPw by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val notifLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        store.setNotifyOn(granted)
        if (granted) HtsNotify.push(ctx, "HASAN TECH STUDIO", "Mast alerts are live.")
    }

    fun askNotifOnce() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            store.setNotifyOn(true)
            return
        }
        if (store.isNotifyOn()) return
        if (ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            store.setNotifyOn(true)
            return
        }
        notifLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(HtsBg)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("HASAN TECH STUDIO", fontSize = 22.sp, fontWeight = FontWeight.Black, color = HtsPurple)
        Spacer(Modifier.height(4.dp))
        Text("INITIALIZE ACCESS", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = HtsInk)
        Spacer(Modifier.height(20.dp))
        OutlinedTextField(
            value = identifier,
            onValueChange = { identifier = it; error = null },
            label = { Text("Email ID or Contact Number") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it; error = null },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = if (showPw) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            trailingIcon = {
                TextButton(onClick = { showPw = !showPw }) {
                    Text(if (showPw) "Hide" else "Show", color = HtsPurple)
                }
            },
            modifier = Modifier.fillMaxWidth(),
        )
        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(error!!, color = HtsError, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = {
                val id = identifier.trim()
                if (!isValidIdentifier(id)) {
                    error = "Enter a valid email or contact number."
                    return@Button
                }
                if (password.length < 6) {
                    error = "Password must be at least 6 characters."
                    return@Button
                }
                if (!store.hasAccount(id)) {
                    SignupPrefill.identifier = id
                    nav.navigate(Routes.SIGNUP)
                    return@Button
                }
                val result = store.login(id, password)
                result.onSuccess { user ->
                    buzz(ctx)
                    askNotifOnce()
                    HtsNotify.push(ctx, "HASAN TECH STUDIO", "Welcome back, ${user.name} — you are logged in.")
                    toast(ctx, "Welcome back, ${user.name}!")
                    nav.navigate(Routes.MAIN) { popUpTo(Routes.LOGIN) { inclusive = true } }
                }.onFailure { e ->
                    error = e.message ?: "Login failed."
                }
            },
            colors = ButtonDefaults.buttonColors(
                containerColor = HtsPurple,
                contentColor = androidx.compose.ui.graphics.Color.White,
            ),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("ENTER", fontWeight = FontWeight.Black)
        }
        Spacer(Modifier.height(4.dp))
        TextButton(onClick = { nav.navigate(Routes.ADMIN) }) {
            Text("Admin", color = HtsPurpleLight)
        }
        Spacer(Modifier.height(8.dp))
        Text("powered by HASAN TECHNOLOGY PVT LTD", fontSize = 10.sp, color = HtsInk)
    }
}
