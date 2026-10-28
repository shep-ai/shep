/**
 * Where the control-center bearer token lives, as a name every layer may use:
 * the web daemon reads it, and the settings page and agent card tell external
 * agents where to find it — never what it is.
 */

/** Filename of the token inside SHEP_HOME. */
export const WEB_AUTH_TOKEN_FILENAME = 'web-auth-token';
