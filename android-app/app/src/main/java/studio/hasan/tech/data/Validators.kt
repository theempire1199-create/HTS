package studio.hasan.tech.data

/** Same rules as the web app (index.ts). Keep both in sync. */

fun normalizeContact(value: String): String =
    value.trim().replace(Regex("[\\s\\-().]"), "")

fun isValidEmail(email: String): Boolean {
    val v = email.trim()
    if (v.isEmpty() || v.length > 254 || ' ' in v || ".." in v) return false
    if (v.count { it == '@' } != 1) return false
    val local = v.substringBefore('@')
    val domain = v.substringAfter('@')
    if (local.isEmpty() || domain.isEmpty() || local.length > 64 || domain.length > 253) return false
    if (local.startsWith('.') || local.endsWith('.')) return false
    if (!local.matches(Regex("[A-Za-z0-9._%+-]+"))) return false
    if (!domain.contains('.') || domain.startsWith('.') || domain.endsWith('.')) return false
    if (domain.startsWith('-') || domain.endsWith('-')) return false
    if (!domain.matches(Regex("[A-Za-z0-9.-]+"))) return false
    val labels = domain.split('.')
    if (labels.any { it.isEmpty() || it.startsWith('-') || it.endsWith('-') }) return false
    if (!labels.last().matches(Regex("[A-Za-z]{2,}"))) return false
    return true
}

fun isValidContact(contact: String): Boolean {
    val n = normalizeContact(contact)
    if (!n.matches(Regex("\\+?[0-9]{7,15}"))) return false
    val digits = if (n.startsWith('+')) n.drop(1) else n
    if (digits.isNotEmpty() && digits.all { it == digits[0] }) return false
    if (!n.startsWith('+') && digits.length == 10 && !digits.matches(Regex("[6-9][0-9]{9}"))) return false
    if (n.startsWith("+91") && digits.length == 12 && !digits.matches(Regex("91[6-9][0-9]{9}"))) return false
    return true
}

fun isValidIdentifier(value: String): Boolean = isValidEmail(value) || isValidContact(value)
