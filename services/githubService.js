'use strict';

const axios = require('axios');

const REPO  = process.env.GITHUB_REPO  || 'narasitk77/tsd-media-search';
const TOKEN = process.env.GITHUB_TOKEN || '';

async function getRecentCommits(limit) {
  if (!TOKEN) return null; // null = token not configured
  try {
    const r = await axios.get(`https://api.github.com/repos/${REPO}/commits`, {
      params: { per_page: limit || 20 },
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'mimir-websearch',
      },
      timeout: 6000,
    });
    return r.data.map(c => ({
      sha:     c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0],
      author:  c.commit.author.name,
      date:    c.commit.author.date,
      url:     c.html_url,
    }));
  } catch (e) {
    console.error('[githubService]', e.message);
    return [];
  }
}

module.exports = { getRecentCommits };
