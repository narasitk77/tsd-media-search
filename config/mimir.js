'use strict';

module.exports = {
  baseUrl:           process.env.MIMIR_BASE_URL           || 'https://apac.mjoll.no/api/v1',
  userPoolId:        process.env.MIMIR_COGNITO_USER_POOL_ID  || 'ap-southeast-1_ZN0Y2kAkT',
  clientId:          process.env.MIMIR_COGNITO_CLIENT_ID     || '7q5lblgier1mcdnme27ruorcj3',
  oidcTokenEndpoint: process.env.MIMIR_COGNITO_OIDC_TOKEN_ENDPOINT || 'https://user-pool-mimir-apac.auth.ap-southeast-1.amazoncognito.com/oauth2/token',
  username:          process.env.MIMIR_USERNAME            || '',
  password:          process.env.MIMIR_PASSWORD            || '',
  defaultPageSize:   24,
  requestTimeout:    15000,
  // Token cache: refresh 5 min before expiry (Cognito tokens last 1 hr)
  tokenTtlMs:        55 * 60 * 1000,
};
