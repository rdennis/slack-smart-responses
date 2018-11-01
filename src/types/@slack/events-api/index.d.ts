
declare module '@slack/events-api' {
    import { EventEmitter } from 'events';
    import { RequestHandler } from 'express';

    interface Message {
        type: string,
        channel: string,
        user: string,
        text: string,
        ts: string,
        event_ts: string,
        channel_type: string
    }

    function createEventAdapter(
        signingSecret: string,
        options?: {
            includeBody?: boolean,
            includeHeaders?: boolean,
            waitForResponse?: boolean
        }): SlackEventAdapter;

    interface SlackEventAdapter extends EventEmitter {
        start(port: number): Promise<void>
    }
}