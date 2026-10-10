package studio.hasan.tech

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import studio.hasan.tech.ui.nav.Routes
import studio.hasan.tech.ui.screens.AdminScreen
import studio.hasan.tech.ui.screens.CodeGateScreen
import studio.hasan.tech.ui.screens.LoginScreen
import studio.hasan.tech.ui.screens.MainScreen
import studio.hasan.tech.ui.screens.SignupScreen
import studio.hasan.tech.ui.screens.SplashScreen
import studio.hasan.tech.ui.theme.HtsTheme

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            HtsTheme {
                val nav = rememberNavController()
                NavHost(navController = nav, startDestination = Routes.SPLASH) {
                    composable(Routes.SPLASH) { SplashScreen(nav) }
                    composable(Routes.LOGIN) { LoginScreen(nav) }
                    composable(Routes.SIGNUP) { SignupScreen(nav) }
                    composable(Routes.CODE) { CodeGateScreen(nav) }
                    composable(Routes.MAIN) { MainScreen() }
                    composable(Routes.ADMIN) { AdminScreen(nav) }
                }
            }
        }
    }
}
