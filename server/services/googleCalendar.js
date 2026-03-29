'use strict';

const { google } = require('googleapis');

let connectionSettings = null;

async function getAccessToken() {
  if (
    connectionSettings &&
    connectionSettings.settings?.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const replIdentity = process.env.REPL_IDENTITY;
  const webReplRenewal = process.env.WEB_REPL_RENEWAL;
  const xReplitToken = replIdentity
    ? 'repl ' + replIdentity
    : webReplRenewal
      ? 'depl ' + webReplRenewal
      : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Google Calendar: Replit connector tokens not available');
  }

  const data = await fetch(
    'https://' +
      hostname +
      '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    { headers: { Accept: 'application/json', 'X-Replit-Token': xReplitToken } }
  ).then((r) => r.json());

  connectionSettings = data.items?.[0];
  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

async function getCalendarClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Create a Google Calendar event for a task.
 * @param {object} task - task row from DB (title, description, due_at)
 * @param {string} calendarId - Google Calendar ID, defaults to 'primary'
 * @returns {string|null} - Google Calendar event HTML link or null on failure
 */
async function createCalendarEvent(task, calendarId = 'primary') {
  if (!task.due_at) return null;

  const start = new Date(task.due_at);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour default

  const event = {
    summary: task.title,
    description: task.description || '',
    start: { dateTime: start.toISOString(), timeZone: 'America/New_York' },
    end: { dateTime: end.toISOString(), timeZone: 'America/New_York' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 30 }
      ]
    }
  };

  try {
    const cal = await getCalendarClient();
    const result = await cal.events.insert({ calendarId, resource: event });
    return result.data.htmlLink || null;
  } catch (err) {
    console.warn('[GoogleCalendar] Failed to create event:', err.message);
    return null;
  }
}

/**
 * List upcoming events from the calendar (next 7 days).
 */
async function listUpcomingEvents(calendarId = 'primary', maxResults = 10) {
  const cal = await getCalendarClient();
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const res = await cal.events.list({
    calendarId,
    timeMin: now.toISOString(),
    timeMax: week.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime'
  });
  return res.data.items || [];
}

/**
 * List all calendars for this user so they can pick the right one.
 */
async function listCalendars() {
  const cal = await getCalendarClient();
  const res = await cal.calendarList.list();
  return res.data.items || [];
}

module.exports = { createCalendarEvent, listUpcomingEvents, listCalendars };
