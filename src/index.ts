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
import { Responder, RegExpResponder } from './Responder';
const slack = new SlackClient(SLACK_OAUTH_ACCESS_TOKEN);

// todo get these from some config?
let responders: Responder[] = [
    RegExpResponder.build(
        '\\b((?:PD|DAT|ES)\\-\\d+)\\b',
        'gi',
        '$1: https://jira.doctorlogic.com/browse/$1'
    )
];

function getResponses(text: string) {
    let responses: string[] = []

    for (const responder of responders) {
        const newResponses = responder.getResponses(text);
        responses = responses.concat(newResponses);
    }

    return responses;
}

// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on('message', async (event: Message) => {
    // only allow users to make karma changes
    if (event.user) {
        console.log(`Received a message event: user ${event.user} in channel ${event.channel} says ${event.text}`);
        console.dir(event);
        try {
            const responses = getResponses(event.text);

            if (responses.length) {
                console.log('responses');
                console.dir(responses);

                const text = responses.join('\n');
                console.log(`responding with text: "${text}"`);
                await slack.chat.postMessage({
                    channel: event.channel,
                    text,
                    thread_ts: event.ts !== event.thread_ts ? event.thread_ts : undefined
                });
            } else {
                console.log('ignoring message, no responses found');
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
slackEvents.start(PORT).then(async () => {
    console.log(`server listening on port ${PORT}`);
});