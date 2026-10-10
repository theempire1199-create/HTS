package studio.hasan.tech.data

import android.content.Context
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/** Public user — salts/hashes never leave the store. */
data class PublicUser(
    val id: String,
    val name: String,
    val email: String,
    val contact: String,
    val createdAt: Long,
    val lastLoginAt: Long,
    val loginCount: Int,
)

data class LoginEvent(val userId: String, val timestamp: Long)

/**
 * Local auth database. Same shape + rules as the web AuthDB:
 * PBKDF2-HMAC-SHA256, 210k iterations, 256-bit, 16-byte salt.
 */
class AuthStore(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    companion object {
        const val ACCESS_PASSCODE = "119911"
        private const val PREFS = "hts_prefs"
        private const val KEY_USERS = "hts_users_v1"
        private const val KEY_LOGINS = "hts_logins_v1"
        private const val KEY_SESSION = "hts_current_user_v1"
        private const val KEY_NOTIFY = "hts_notify_on"
        private const val ITERATIONS = 210_000
    }

    // ---------- storage helpers (never crash) ----------

    private fun usersObject(): JSONObject =
        try {
            JSONObject(prefs.getString(KEY_USERS, "{}") ?: "{}")
        } catch (_: Exception) {
            JSONObject()
        }

    private fun saveUsers(obj: JSONObject) {
        try {
            prefs.edit().putString(KEY_USERS, obj.toString()).apply()
        } catch (_: Exception) {
        }
    }

    private fun loginsArray(): JSONArray =
        try {
            JSONArray(prefs.getString(KEY_LOGINS, "[]") ?: "[]")
        } catch (_: Exception) {
            JSONArray()
        }

    private fun saveLogins(arr: JSONArray) {
        try {
            val capped = JSONArray()
            val start = maxOf(0, arr.length() - 100)
            for (i in start until arr.length()) capped.put(arr.get(i))
            prefs.edit().putString(KEY_LOGINS, capped.toString()).apply()
        } catch (_: Exception) {
        }
    }

    private fun toPublic(obj: JSONObject): PublicUser = PublicUser(
        id = obj.getString("id"),
        name = obj.getString("name"),
        email = obj.getString("email"),
        contact = obj.getString("contact"),
        createdAt = obj.getLong("createdAt"),
        lastLoginAt = obj.optLong("lastLoginAt", 0L),
        loginCount = obj.optInt("loginCount", 0),
    )

    // ---------- lookup ----------

    fun findUser(identifier: String): PublicUser? {
        val key = identifier.trim().lowercase()
        val users = usersObject()
        if (users.has(key)) {
            return try {
                toPublic(users.getJSONObject(key))
            } catch (_: Exception) {
                null
            }
        }
        val contactKey = normalizeContact(identifier).lowercase()
        val names = users.keys()
        while (names.hasNext()) {
            val k = names.next()
            try {
                val obj = users.getJSONObject(k)
                if (normalizeContact(obj.getString("contact")).lowercase() == contactKey) {
                    return toPublic(obj)
                }
            } catch (_: Exception) {
            }
        }
        return null
    }

    fun hasAccount(identifier: String): Boolean = findUser(identifier) != null

    fun listUsers(): List<PublicUser> {
        val out = mutableListOf<PublicUser>()
        val users = usersObject()
        val names = users.keys()
        while (names.hasNext()) {
            try {
                out.add(toPublic(users.getJSONObject(names.next())))
            } catch (_: Exception) {
            }
        }
        return out
    }

    fun listLogins(): List<LoginEvent> {
        val out = mutableListOf<LoginEvent>()
        val arr = loginsArray()
        for (i in 0 until arr.length()) {
            try {
                val e = arr.getJSONObject(i)
                out.add(LoginEvent(e.getString("userId"), e.getLong("timestamp")))
            } catch (_: Exception) {
            }
        }
        return out.sortedByDescending { it.timestamp }
    }

    // ---------- writes ----------

    fun createUser(name: String, email: String, contact: String, password: String): Result<PublicUser> =
        runCatching {
            val cleanName = name.trim()
            val cleanContact = contact.trim()
            val cleanEmail = email.trim()
            require(cleanName.length >= 3) { "Enter full name." }
            require(isValidContact(cleanContact)) { "Enter a valid contact number (7-15 digits)." }
            require(isValidEmail(cleanEmail)) { "Enter a valid email ID (e.g. name@example.com)." }
            require(password.length >= 6) { "Secret must be at least 6 characters." }
            val emailKey = cleanEmail.lowercase()
            require(!hasAccount(emailKey) && !hasAccount(cleanContact)) {
                "An account with this email or contact number already exists."
            }
            val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
            val hash = hashPassword(password, salt)
            val now = System.currentTimeMillis()
            val obj = JSONObject()
                .put("id", emailKey)
                .put("name", cleanName)
                .put("email", emailKey)
                .put("contact", cleanContact)
                .put("salt", encode(salt))
                .put("hash", encode(hash))
                .put("createdAt", now)
                .put("lastLoginAt", 0L)
                .put("loginCount", 0)
            val users = usersObject()
            users.put(emailKey, obj)
            saveUsers(users)
            toPublic(obj)
        }

    fun login(identifier: String, password: String): Result<PublicUser> = runCatching {
        val users = usersObject()
        val record = findRecord(identifier, users)
            ?: throw IllegalArgumentException("Email, contact number, or password is incorrect.")
        val salt = decode(record.getString("salt"))
        val expected = decode(record.getString("hash"))
        val actual = hashPassword(password, salt)
        require(MessageDigest.isEqual(actual, expected)) {
            "Email, contact number, or password is incorrect."
        }
        val now = System.currentTimeMillis()
        record.put("lastLoginAt", now)
        record.put("loginCount", record.optInt("loginCount", 0) + 1)
        saveUsers(users)
        val arr = loginsArray()
        arr.put(JSONObject().put("userId", record.getString("id")).put("timestamp", now))
        saveLogins(arr)
        try {
            prefs.edit().putString(KEY_SESSION, record.getString("id")).apply()
        } catch (_: Exception) {
        }
        toPublic(record)
    }

    private fun findRecord(identifier: String, users: JSONObject): JSONObject? {
        val key = identifier.trim().lowercase()
        if (users.has(key)) {
            return try {
                users.getJSONObject(key)
            } catch (_: Exception) {
                null
            }
        }
        val contactKey = normalizeContact(identifier).lowercase()
        val names = users.keys()
        while (names.hasNext()) {
            val k = names.next()
            try {
                val obj = users.getJSONObject(k)
                if (normalizeContact(obj.getString("contact")).lowercase() == contactKey) return obj
            } catch (_: Exception) {
            }
        }
        return null
    }

    fun currentUser(): PublicUser? {
        val id = try {
            prefs.getString(KEY_SESSION, null)
        } catch (_: Exception) {
            null
        }
        return id?.let { findUser(it) }
    }

    fun logout() {
        try {
            prefs.edit().remove(KEY_SESSION).apply()
        } catch (_: Exception) {
        }
    }

    // ---------- notify pref ----------

    fun isNotifyOn(): Boolean = try {
        prefs.getBoolean(KEY_NOTIFY, false)
    } catch (_: Exception) {
        false
    }

    fun setNotifyOn(on: Boolean) {
        try {
            prefs.edit().putBoolean(KEY_NOTIFY, on).apply()
        } catch (_: Exception) {
        }
    }

    // ---------- crypto ----------

    private fun hashPassword(password: String, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(password.toCharArray(), salt, ITERATIONS, 256)
        try {
            val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            return factory.generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }

    private fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)

    private fun decode(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)
}
