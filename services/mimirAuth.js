'use strict';

/**
 * Server-side Cognito SRP authentication for Mimir
 * Authenticates once then caches the token, auto-refreshes before expiry.
 */

const config = require('../config/mimir');

// Lazy-load amazon-cognito-identity-js (CJS compat shim)
let cognitoLib = null;
async function getCognitoLib() {
  if (!cognitoLib) {
    // The package is ESM-only in v6+; use dynamic import
    cognitoLib = await import('amazon-cognito-identity-js');
  }
  return cognitoLib;
}

// ── Token cache ──────────────────────────────────────────────
let cachedToken    = null;
let tokenExpiresAt = 0;

/**
 * Returns a valid Cognito ID token, authenticating/refreshing as needed.
 * @returns {Promise<string>}
 */
async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }
  const token = await authenticate();
  cachedToken    = token;
  tokenExpiresAt = now + config.tokenTtlMs;
  return token;
}

/**
 * Perform Cognito SRP authentication and resolve with the ID token string.
 * @returns {Promise<string>}
 */
function authenticate() {
  return new Promise(async (resolve, reject) => {
    // Polyfill fetch for Node (Cognito SDK needs it)
    if (!global.fetch) {
      const { default: nodeFetch } = await import('node-fetch');
      global.fetch = nodeFetch;
    }

    const { CognitoUserPool, CognitoUser, AuthenticationDetails } = await getCognitoLib();

    const userPool = new CognitoUserPool({
      UserPoolId: config.userPoolId,
      ClientId:   config.clientId,
    });

    const cognitoUser = new CognitoUser({
      Username: config.username,
      Pool:     userPool,
    });

    const authDetails = new AuthenticationDetails({
      Username: config.username,
      Password: config.password,
    });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess(result) {
        resolve(result.getIdToken().getJwtToken());
      },
      onFailure(err) {
        reject(new Error(`Mimir auth failed: ${err.message || err}`));
      },
      newPasswordRequired() {
        reject(new Error('Mimir account requires a password change — please log in to Mimir and update the password.'));
      },
    });
  });
}

/**
 * Returns the correct Mimir auth header object.
 * @returns {Promise<{ 'x-mimir-cognito-id-token': string }>}
 */
async function getAuthHeader() {
  const token = await getToken();
  return { 'x-mimir-cognito-id-token': token };
}

module.exports = { getToken, getAuthHeader };
