'use strict';

module.exports = {
  baseUrl:           process.env.MIMIR_BASE_URL                || '',
  userPoolId:        process.env.MIMIR_COGNITO_USER_POOL_ID    || '',
  clientId:          process.env.MIMIR_COGNITO_CLIENT_ID       || '',
  oidcTokenEndpoint: process.env.MIMIR_COGNITO_OIDC_TOKEN_ENDPOINT || '',
  username:          process.env.MIMIR_USERNAME                || '',
  password:          process.env.MIMIR_PASSWORD                || '',
  defaultPageSize:   24,
  requestTimeout:    15000,
  // Token cache: refresh 5 min before expiry (Cognito tokens last 1 hr)
  tokenTtlMs:        55 * 60 * 1000,
};
