import { config as envLoad } from 'dotenv';
envLoad();

import { getEnvVal, number, fmt } from './util';

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

interface Responder {
    getResponse(message: string): string[]
}

class RegExpResponder implements Responder {
    static build(pattern: string, flags: string, response: string): RegExpResponder {
        const regexp = new RegExp(pattern, flags);
        return new RegExpResponder(regexp, response);
    }

    constructor(private regexp: RegExp, private response: string) { }

    getResponse(message: string) {
        const responses = [];
        let match;

        do {
            match = this.regexp.exec(message);

            if (match) {
                const response = fmt(this.response, ...match);
                responses.push(response);
            }
        } while (match);

        return responses;
    }
}

// todo get these from some config?
const responders: Responder[] = [
    RegExpResponder.build(
        '\\b((?:PD|DAT|ES)\\-\\d+)\\b',
        'gi',
        '<https://jira.doctorlogic.com/browse/$1|$1>'
    )
];

function getResponses(text: string) {
    let responses: string[] = []

    for (const responder of responders) {
        const response = responder.getResponse(text);
        responses.concat(response);
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
            console.log('responses');
            console.dir(responses);

            if (responses.length) {
                const text = responses.join('\n');
                console.log(`responding with text: "${text}"`);
                await slack.chat.postMessage({
                    channel: event.channel,
                    text,
                    thread_ts: event.ts !== event.thread_ts ? event.thread_ts : undefined
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