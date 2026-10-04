/**
 * The only integrations this prototype exposes. Nothing outside this list is
 * ever offered in the UI or handed to the agent.
 *
 * `tools` is a deliberate shortlist per toolkit. Composio ships 50 to 245 tools
 * for these apps, which is far more than a single prompt can carry, and its
 * default page is alphabetical (so GMAIL_SEND_EMAIL would not even be included).
 * Adding a capability means adding a slug here.
 */
export const SUPPORTED_TOOLKITS = [
  {
    slug: 'gmail',
    name: 'Gmail',
    description: 'Send email, draft messages and read your inbox.',
    tools: [
      'GMAIL_SEND_EMAIL',
      'GMAIL_CREATE_EMAIL_DRAFT',
      'GMAIL_FETCH_EMAILS',
      'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
      'GMAIL_LIST_LABELS',
      'GMAIL_GET_PROFILE',
    ],
  },
  {
    slug: 'googlecalendar',
    name: 'Google Calendar',
    description: 'Create, update and look up calendar events.',
    tools: [
      'GOOGLECALENDAR_CREATE_EVENT',
      'GOOGLECALENDAR_UPDATE_EVENT',
      'GOOGLECALENDAR_DELETE_EVENT',
      'GOOGLECALENDAR_EVENTS_LIST',
      'GOOGLECALENDAR_LIST_CALENDARS',
      'GOOGLECALENDAR_GET_CURRENT_DATE_TIME',
    ],
  },
  {
    slug: 'notion',
    name: 'Notion',
    description: 'Create pages, append content and search your workspace.',
    tools: [
      'NOTION_CREATE_NOTION_PAGE',
      'NOTION_ADD_PAGE_CONTENT',
      'NOTION_SEARCH_NOTION_PAGE',
      'NOTION_INSERT_ROW_DATABASE',
      'NOTION_FETCH_DATABASE',
      'NOTION_GET_PAGE_MARKDOWN',
    ],
  },
  {
    slug: 'asana',
    name: 'Asana',
    description: 'Create and update tasks in your projects.',
    tools: [
      'ASANA_CREATE_A_TASK',
      'ASANA_UPDATE_A_TASK',
      'ASANA_GET_A_TASK',
      'ASANA_SEARCH_TASKS_IN_WORKSPACE',
      'ASANA_GET_MULTIPLE_WORKSPACES',
      'ASANA_GET_WORKSPACE_PROJECTS',
      'ASANA_GET_CURRENT_USER',
    ],
  },
  {
    slug: 'hubspot',
    name: 'HubSpot',
    description: 'Create and update contacts, companies and deals.',
    tools: [
      'HUBSPOT_CREATE_CONTACT',
      'HUBSPOT_UPDATE_CONTACT',
      'HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA',
      'HUBSPOT_LIST_CONTACTS',
      'HUBSPOT_CREATE_COMPANY',
      'HUBSPOT_CREATE_DEAL',
      'HUBSPOT_CREATE_NOTE',
    ],
  },
  {
    slug: 'youtube',
    name: 'YouTube',
    description: 'Search videos, read channel stats and manage playlists.',
    tools: [
      'YOUTUBE_SEARCH_YOU_TUBE',
      'YOUTUBE_GET_VIDEO_DETAILS_BATCH',
      'YOUTUBE_LIST_CHANNEL_VIDEOS',
      'YOUTUBE_GET_CHANNEL_STATISTICS',
      'YOUTUBE_LIST_USER_PLAYLISTS',
      'YOUTUBE_CREATE_PLAYLIST',
      'YOUTUBE_ADD_VIDEO_TO_PLAYLIST',
    ],
  },
] as const;

export type SupportedToolkit = (typeof SUPPORTED_TOOLKITS)[number];
export type ToolkitSlug = SupportedToolkit['slug'];

export const TOOLKIT_SLUGS = SUPPORTED_TOOLKITS.map((toolkit) => toolkit.slug);

export function isSupportedToolkit(slug: string): slug is ToolkitSlug {
  return TOOLKIT_SLUGS.some((supported) => supported === slug);
}

export function getToolkit(slug: ToolkitSlug): SupportedToolkit {
  const toolkit = SUPPORTED_TOOLKITS.find((item) => item.slug === slug);
  if (!toolkit) {
    throw new Error(`Unsupported toolkit: ${slug}`);
  }
  return toolkit;
}

/** Tool slugs for a set of toolkits, which is all the agent is ever allowed to see. */
export function toolSlugsFor(slugs: ToolkitSlug[]): string[] {
  return slugs.flatMap((slug) => [...getToolkit(slug).tools]);
}
