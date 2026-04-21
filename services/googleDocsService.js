'use strict';

const axios = require('axios');

const DRIVE_URL = 'https://www.googleapis.com/drive/v3/files';
const DOCS_URL  = 'https://docs.googleapis.com/v1/documents';

async function listRecentDocs(accessToken) {
  const { data } = await axios.get(DRIVE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      q:        "mimeType='application/vnd.google-apps.document' and trashed=false",
      orderBy:  'viewedByMeTime desc',
      pageSize: 7,
      fields:   'files(id,name,webViewLink,modifiedTime)',
    },
    timeout: 10_000,
  });
  return data.files || [];
}

// Append a list of {title, url} hyperlinks to the end of a Google Doc.
// Each link is inserted as clickable hyperlink text via batchUpdate.
async function appendToDoc(accessToken, docId, links) {
  // Step 1 — get the document to find its current end index
  const { data: doc } = await axios.get(`${DOCS_URL}/${encodeURIComponent(docId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10_000,
  });

  const content  = doc.body.content;
  const lastElem = content[content.length - 1];
  // The document body always ends with a trailing newline character at lastElem.endIndex - 1.
  // We insert immediately before it so our text appears at the end of the readable content.
  let insertAt = lastElem.endIndex - 1;

  // Step 2 — build the sequence of batchUpdate requests
  const requests = [];

  const now = new Date().toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const header = '\n\nลิงก์สื่อ The Standard — ' + now + '\n\n';

  requests.push({ insertText: { location: { index: insertAt }, text: header } });
  insertAt += header.length;

  for (let i = 0; i < links.length; i++) {
    const prefix = (i + 1) + '. ';
    const title  = links[i].title;
    const url    = links[i].url;
    const line   = prefix + title + '\n';

    // Insert the line text
    requests.push({ insertText: { location: { index: insertAt }, text: line } });

    // Style the title portion as a blue underlined hyperlink
    const titleStart = insertAt + prefix.length;
    const titleEnd   = titleStart + title.length;

    requests.push({
      updateTextStyle: {
        range: { startIndex: titleStart, endIndex: titleEnd },
        textStyle: {
          link: { url },
          underline: true,
          foregroundColor: {
            color: { rgbColor: { red: 0.07, green: 0.36, blue: 0.72 } },
          },
        },
        fields: 'link,underline,foregroundColor',
      },
    });

    insertAt += line.length;
  }

  // Step 3 — execute all requests in a single batchUpdate
  const { data } = await axios.post(
    `${DOCS_URL}/${encodeURIComponent(docId)}:batchUpdate`,
    { requests },
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15_000 }
  );
  return data;
}

module.exports = { listRecentDocs, appendToDoc };
