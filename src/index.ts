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
import { Responder } from './Responder';
const slack = new SlackClient(SLACK_OAUTH_ACCESS_TOKEN);

import http from 'http';
import express from 'express';
import bodyParser from 'body-parser';

import * as db from './db';

// static responders loaded from db
let responders: Responder[];

async function loadResponders() {
    responders = await db.getResponders('priority', 'ASC');
}

function getResponses(text: string) {
    let responses: string[] = []

    for (const responder of responders) {
        const newResponses = responder.getResponses(text);
        responses = responses.concat(newResponses);
    }

    return responses;
}

function getForm(values: db.CreateOrEditResponderParams, action: string, buttonText: string, method = 'post') {
    const { description = '', flags = '', pattern = '', response = '', title = '', priority } = values;

    return `
    <form action="${action}" method="${method}">
        <label>
            Title
            <br/>
            <input name="title" type="text" value="${title}" required />
        </label>
        <br/>
        <label>
            Description
            <br/>
            <textarea name="description" required>${description}</textarea>
        </label>
        <br/>
        <label>
            Pattern (see <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions">RegExp</a>)
            <br/>
            <input name="pattern" type="text" placeholder="ex: ((?:PD|DAT)\\-\\d+)" value="${pattern}" required />
        </label>
        <br/>
        <label>
            Flags (see <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Advanced_searching_with_flags">flags</a>)
            <br/>
            <input name="flags" type="text" placeholder="ex: gi" value="${flags}" />
        </label>
        <br/>
        <label>
            Response (see <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_parenthesized_substring_matches">matches</a>)
            <br/>
            <input name="response" type="text" placeholder="ex: got match $1" value="${response}" required />
        </label>
        <br/>
        <label>
            Priority (order of execution)
            <br/>
            <input name="priority" type="number" value="${priority}" required />
        </label>
        <br/>
        <button type="submit">${buttonText}</button>
    </form>
    `;
}

const app = express();

app.use('/slack/events', slackEvents.expressMiddleware());

// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on('message', async (event: Message) => {
    if (event.user) {
        console.log(`Received a message event: user ${event.user} in channel ${event.channel} says ${event.text}`);
        console.dir(event);
        try {
            // make sure we have responders
            if (!responders) {
                await loadResponders();
            }

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

app.use(bodyParser.urlencoded({ extended: false }));

app.get('/responder/delete/:id', async (req, res) => {
    const id = req.params.id;

    const responder = await db.get(id);

    if (!responder) {
        res.sendStatus(404);
        return;
    }

    const { description, pattern, flags, response, title, priority } = responder;

    res.send(`
    <h1>Delete Responder ${id}?</h1>
    <dl>
        ${Object
            .keys(responder)
            .map((k: keyof db.ResponderEntry) => `
            <dt>${k}</dt>
            <dd>${responder[k]}</dd>
            `)}
        <dt>ID</dt>
        <dd>${id}</dd>

        <dt>Title</dt>
        <dd>${title}</dd>

        <dt>Description</dt>
        <dd>${description}</dd>

        <dt>Pattern</dt>
        <dd>${pattern}</dd>

        <dt>Flags</dt>
        <dd>${flags}</dd>

        <dt>Response</dt>
        <dd>${response}</dd>

        <dt>Priority</dt>
        <dd>${priority}</dd>
    </dl>

    <form method="post">
        <button type="submit">Confirm</button>
    </form>
    <a href="/">Cancel</a>
    `);
});

app.post('/responder/delete/:id', async (req, res) => {
    const id = req.params.id;
    console.log(`deleting responder: ${id}`)

    await db.del(id);

    // update responders
    await loadResponders();

    res.redirect('/');
});

app.get('/responder/:id', async (req, res) => {
    const id = req.params.id;

    const responder = await db.get(id);

    if (!responder) {
        res.sendStatus(404);
        return;
    }

    res.send(`
    <h1>
        Edit Responder ${id}
        <small>(<a href="/">return to list</a>)</small>
    </h1>
    ${getForm(responder, id, 'Update')}
    `);
});

app.post('/responder/:id', async (req, res) => {
    const id = req.params.id;
    console.log(`updating responder: ${id}`);
    console.dir(req.body);

    const { pattern, flags = '', response, priority } = req.body;
    await db.createOrUpdate({
        id,
        flags,
        pattern,
        response,
        priority
    }, 'server');

    // update responders
    await loadResponders();

    res.redirect('/');
});

app.post('/responder', async (req, res) => {
    console.log('creating responder');
    console.dir(req.body);

    const { description, flags = '', pattern, priority, response, title } = req.body;

    await db.createOrUpdate({
        description,
        flags,
        pattern,
        priority,
        response,
        title
    }, 'server');

    // update responders
    await loadResponders();

    res.redirect('/');
});

app.use(/\/favicon\.?(jpe?g|png|ico|gif)?$/i, (req, res) => {
    res.sendStatus(204);
});

app.get('/', async (req, res) => {
    if (req.url !== '/') {
        res.sendStatus(404);
        return;
    }

    const responders = await db.getAll();

    res.send(`
    <style>
        table {
            border-collapse: collapse;
            border: 1px solid #f5f5f5;
            background: #f5f5f5;
        }
        th, td {
            padding: 5px 10px;
        }
        tbody > tr:nth-of-type(odd) {
            background: #ffffff;
        }
    </style>
    <h1>Slack Smart Responses</h1>
    <p>Slack Smart Responses is up and running.</p>

    <h2>Create Responder</h2>
    ${getForm({}, "responder", "Create")}

    <h2>Responders</h2>
    <table id="responders-table">
        <thead>
            <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Pattern</th>
                <th>Flags</th>
                <th>Response</th>
                <th>Priority</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${responders.map(r => `
            <tr>
                <td>${r.id}</td>
                <td>${r.title}</td>
                <td>${r.pattern}</td>
                <td>${r.flags}</td>
                <td>${r.response}</td>
                <td>${r.priority}</td>
                <td>
                    <a href="responder/${r.id}">Edit</a>
                    <a class="delete" href="responder/delete/${r.id}">Delete</button>
                </td>
            </tr>`)}
            ${responders.length < 1 ? '<tr><td colspan="7">No Responders</td></tr>' : ''}
        </tbody>
    </table>
    `);
});

// Start a basic HTTP server
http.createServer(app).listen(PORT, async () => {
    console.log(`server listening on port ${PORT}`);

    // load our initial responders
    await loadResponders();
});