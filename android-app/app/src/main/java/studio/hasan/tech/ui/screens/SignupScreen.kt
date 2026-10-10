package studio.hasan.tech.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import studio.hasan.tech.data.AuthStore
import studio.hasan.tech.data.isValidContact
import studio.hasan.tech.data.isValidEmail
import studio.hasan.tech.notify.HtsNotify
import studio.hasan.tech.ui.nav.Routes
import studio.hasan.tech.ui.theme.HtsBg
import studio.hasan.tech.ui.theme.HtsError
import studio.hasan.tech.ui.theme.HtsInk
import studio.hasan.tech.ui.theme.HtsMuted
import studio.hasan.tech.ui.theme.HtsPurple

private val STEP_TITLES = listOf(
    "Tell me your name",
    "Tell me your contact number",
    "Write your email ID",
    "Choose your secret",
    "Confirm your secret",
    "One last promise",
)

/** Single-card 6-step signup wizard. Only title + field change per step. */
@Composable
fun SignupScreen(nav: NavController) {
    val ctx = LocalContext.current
    val store = remember { AuthStore(ctx) }
    var step by remember { mutableStateOf(0) }
    var name by remember { mutableStateOf("") }
    var contact by remember {
        mutableStateOf(
            SignupPrefill.identifier?.takeUnless { it.contains('@') } ?: "",
        )
    }
    var email by remember {
        mutableStateOf(
            SignupPrefill.identifier?.takeIf { it.contains('@') } ?: "",
        )
    }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var terms by remember { mutableStateOf(false) }
    var showPw by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun validate(s: Int): Boolean {
        error = when (s) {
            0 -> if (name.trim().length < 3) "Tell me your full name." else null
            1 -> if (!isValidContact(contact)) "Enter a valid contact number." else null
            2 -> if (!isValidEmail(email)) "Enter a valid email ID." else null
            3 -> if (password.length < 6) "Secret must be at least 6 characters." else null
            4 -> if (confirm != password) "Your secrets do not match." else null
            else -> if (!terms) "Please agree before joining." else null
        }
        return error == null
    }

    Column(
        modifier = Modifier.fillMaxSize().background(HtsBg).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            "The best way to predict the future is to invent it.",
            fontSize = 18.sp,
            fontWeight = FontWeight.ExtraBold,
            color = HtsPurple,
        )
        Spacer(Modifier.height(16.dp))
        Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(28.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(24.dp)) {
                Text(STEP_TITLES[step], fontSize = 20.sp, fontWeight = FontWeight.Black, color = HtsInk)
                Spacer(Modifier.height(16.dp))
                when (step) {
                    0 -> OutlinedTextField(
                        value = name,
                        onValueChange = { name = it; error = null },
                        label = { Text("Your full name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    1 -> OutlinedTextField(
                        value = contact,
                        onValueChange = { contact = it; error = null },
                        label = { Text("Contact number") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    2 -> OutlinedTextField(
                        value = email,
                        onValueChange = { email = it; error = null },
                        label = { Text("you@example.com") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    3 -> OutlinedTextField(
                        value = password,
                        onValueChange = { password = it; error = null },
                        label = { Text("At least 6 characters") },
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
                    4 -> OutlinedTextField(
                        value = confirm,
                        onValueChange = { confirm = it; error = null },
                        label = { Text("Repeat your secret") },
                        singleLine = true,
                        visualTransformation = if (showPw) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    5 -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = terms, onCheckedChange = { terms = it; error = null })
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "I agree to the terms and conditions and privacy policy.",
                            fontSize = 12.sp,
                            color = HtsMuted,
                        )
                    }
                }
                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(error!!, color = HtsError, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(20.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (step > 0) {
                        TextButton(onClick = { step -= 1; error = null }) {
                            Text("←", fontSize = 22.sp, color = HtsPurple)
                        }
                    } else {
                        Spacer(Modifier.width(48.dp))
                    }
                    if (step < 5) {
                        Button(
                            onClick = { if (validate(step)) step += 1 },
                            colors = ButtonDefaults.buttonColors(containerColor = HtsPurple),
                        ) {
                            Text("→", fontSize = 22.sp)
                        }
                    } else {
                        Button(
                            onClick = {
                                if (!validate(5)) return@Button
                                val result = store.createUser(name, email, contact, password)
                                result.onSuccess { user ->
                                    SignupPrefill.identifier = null
                                    buzz(ctx)
                                    HtsNotify.push(ctx, "HASAN TECH STUDIO", "Account created for ${user.name} — please login.")
                                    toast(ctx, "${user.name}, signed up! Please login now.")
                                    nav.navigate(Routes.LOGIN) {
                                        popUpTo(Routes.SIGNUP) { inclusive = true }
                                    }
                                }.onFailure { e ->
                                    error = e.message ?: "Signup failed."
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = HtsPurple),
                        ) {
                            Text("JOIN →", fontWeight = FontWeight.Black)
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(6) { i ->
                Box(
                    Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(if (i <= step) HtsPurple else HtsPurple.copy(alpha = 0.2f)),
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        Text("${step + 1} / 6", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = HtsMuted)
        TextButton(onClick = { nav.navigate(Routes.LOGIN) }) {
            Text("← Back to Login", color = HtsPurple)
        }
    }
}
