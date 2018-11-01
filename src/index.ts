import { config as envLoad } from 'dotenv';
envLoad();

import { getEnvVal, number } from './util';

// ENV variables
const PORT = getEnvVal('PORT', number, 3000);
const SLACK_SIGNING_SECRET = getEnvVal('SLACK_SIGNING_SECRET');
const SLACK_OAUTH_ACCESS_TOKEN = getEnvVal('SLACK_OAUTH_ACCESS_TOKEN');

// Initialize using signing secret from env variables
import { createEventAdapter, Message } from '@slack/events-api';
const slackEvents = createEventAdapter(SLACK_SIGNING_SECRET, { includeBody: true });

// Initialize client with oauth token
import { WebClient as SlackClient } from '@slack/client';
const slack = new SlackClient(SLACK_OAUTH_ACCESS_TOKEN);

interface Mutator {
    regexp: RegExp
    replacement: string
}

// todo get these from some config?
const mutators: Mutator[] = [
    {
        regexp: /((?:PD|DAT|ES)-\d+)/gi,
        replacement: 'https://jira.doctorlogic.com/browse/$1'
    }
];

function runMutations(text: string) {
    for (const mutator of mutators) {
        text = text.replace(mutator.regexp, mutator.replacement);
    }

    return text;
}

// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on('message', async (event: Message) => {
    // only allow users to make karma changes
    if (event.user) {
        console.log(`Received a message event: user ${event.user} in channel ${event.channel} says ${event.text}`);
        try {
            const newText = runMutations(event.text);

            if (newText !== event.text) {
                slack.chat.update({
                    channel: event.channel,
                    text: newText,
                    ts: event.ts
                });
            }
        } catch (err) {
            console.error('An error occurred in the message event handler.');
            console.error(err);
        }
    }
});

// Handle errors (see `errorCodes` export)
slackEvents.on('error', console.error);

// Start a basic HTTP server
slackEvents.start(PORT).then(() => {
    console.log(`server listening on port ${PORT}`);
});