package studio.hasan.tech.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import studio.hasan.tech.data.AuthStore
import studio.hasan.tech.ui.theme.HtsBg
import studio.hasan.tech.ui.theme.HtsInk
import studio.hasan.tech.ui.theme.HtsMuted
import studio.hasan.tech.ui.theme.HtsPurple

private fun fmtTime(ts: Long): String =
    try {
        SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.getDefault()).format(Date(ts))
    } catch (_: Exception) {
        ts.toString()
    }

/** Local activity dashboard — same data as the web admin panel. */
@Composable
fun AdminScreen(nav: NavController) {
    val ctx = LocalContext.current
    val store = remember { AuthStore(ctx) }
    val users = remember { store.listUsers() }
    val logins = remember { store.listLogins() }
    var notifyOn by remember { mutableStateOf(store.isNotifyOn()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(HtsBg)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Text("HASAN TECH STUDIO", fontSize = 11.sp, fontWeight = FontWeight.Black, color = HtsPurple)
        Text("Admin Panel", fontSize = 30.sp, fontWeight = FontWeight.Black, color = HtsInk)
        Text("A lightweight identity activity dashboard", fontSize = 13.sp, color = HtsMuted)
        Spacer(Modifier.height(12.dp))
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("Joined: ${users.size}", fontWeight = FontWeight.Bold, color = HtsInk)
                Text("Login events: ${logins.size}", fontWeight = FontWeight.Bold, color = HtsInk)
                Text("Storage: LOCAL (this device only)", fontSize = 12.sp, color = HtsMuted)
            }
        }
        Spacer(Modifier.height(12.dp))
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("Notifications", fontWeight = FontWeight.Bold, color = HtsInk)
                Switch(
                    checked = notifyOn,
                    onCheckedChange = {
                        notifyOn = it
                        store.setNotifyOn(it)
                    },
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("Who joined (${users.size})", fontWeight = FontWeight.Black, color = HtsInk)
        users.forEach { user ->
            Spacer(Modifier.height(8.dp))
            Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.padding(14.dp).fillMaxWidth()) {
                    Text(user.name, fontWeight = FontWeight.Bold, color = HtsInk)
                    Text(user.email, fontSize = 12.sp, color = HtsMuted)
                    Text(user.contact, fontSize = 12.sp, color = HtsMuted)
                    Text("Joined ${fmtTime(user.createdAt)}", fontSize = 11.sp, color = HtsMuted)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("Login activity (${logins.size})", fontWeight = FontWeight.Black, color = HtsInk)
        logins.take(20).forEach { event ->
            Spacer(Modifier.height(6.dp))
            Text(
                "${event.userId} — ${fmtTime(event.timestamp)}",
                fontSize = 12.sp,
                color = HtsMuted,
            )
        }
        Spacer(Modifier.height(16.dp))
        TextButton(
            onClick = { nav.popBackStack() },
            modifier = Modifier.align(Alignment.CenterHorizontally),
        ) {
            Text("← Back", color = HtsPurple)
        }
    }
}
