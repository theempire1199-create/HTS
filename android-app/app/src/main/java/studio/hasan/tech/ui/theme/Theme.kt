package studio.hasan.tech.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val HtsColors = lightColorScheme(
    primary = HtsPurple,
    onPrimary = androidx.compose.ui.graphics.Color.White,
    secondary = HtsPurpleLight,
    background = HtsBg,
    onBackground = HtsInk,
    surface = androidx.compose.ui.graphics.Color.White,
    onSurface = HtsInk,
    error = HtsError,
)

@Composable
fun HtsTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = HtsColors, content = content)
}
