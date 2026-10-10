package studio.hasan.tech.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import studio.hasan.tech.ui.theme.HtsBg

/** Empty fresh main screen — same as the web app. Nothing renders here. */
@Composable
fun MainScreen() {
    Box(Modifier.fillMaxSize().background(HtsBg))
}
