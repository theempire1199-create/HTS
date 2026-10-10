/** Centralized magic strings and limits for HTS auth, storage, and UX. */

export const AUTH_DB_KEY = 'hts_auth_db_v4'
export const CURRENT_USER_KEY = 'hts_current_user_v4'
export const AUTH_SCHEMA_KEY = 'hts_auth_schema'
export const AUTH_SCHEMA_VERSION = '4'

export const LEGACY_AUTH_DB_KEY = 'hts_auth_db_v3'
export const LEGACY_CURRENT_USER_KEY = 'hts_current_user_v3'

export const LOGIN_DETAILS_KEY = 'hts_login_details_v1'
export const SIGNUP_DETAILS_KEY = 'hts_signup_details_v1'

/** Storage keys that must be removed during schema migrations / cleanup. */
export const LEGACY_KEYS_TO_CLEAN: readonly string[] = [
  LEGACY_AUTH_DB_KEY,
  LEGACY_CURRENT_USER_KEY,
] as const

export const NOTIFY_PREF_KEY = 'hts_notify_v1'
export const FP_CRED_KEY = 'hts_fp_cred_v1'

export const FP_MAX_ATTEMPTS = 3

export const STORAGE_UNAVAILABLE_MESSAGE =
  'Local storage unavailable. Some features may be limited.'

export const SECURING_DATA_LABEL = 'Securing data...'
