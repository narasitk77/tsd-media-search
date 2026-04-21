'use strict';

const axios = require('axios');

const DRIVE_URL = 'https://www.googleapis.com/drive/v3/files';
const DOCS_URL  = 'https://docs.googleapis.com/v1/documents';

async function listRecentDocs(accessToken) {
  const { data } = await axios.get(DRIVE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      q:       "mimeType='application/vnd.google-apps.document' and trashed=false",
      orderBy: 'viewedByMeTime desc',
      pageSize: 15,
      fields:  'files(id,name,webViewLink,modifiedTime)',
    },
    timeout: 10_000,
  });
  return data.files || [];
}

async function appendToDoc(accessToken, docId, text) {
  const { data } = await axios.post(
    `${DOCS_URL}/${encodeURIComponent(docId)}:batchUpdate`,
    { requests: [{ insertText: { endOfSegmentLocation: { segmentId: '' }, text } }] },
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15_000 }
  );
  return data;
}

module.exports = { listRecentDocs, appendToDoc };
