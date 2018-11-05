import { fmt } from "./util";

export interface Responder {
    getResponses(message: string): string[]
}

export class RegExpResponder implements Responder {
    static build(pattern: string, flags: string, response: string): RegExpResponder {
        const regexp = new RegExp(pattern, flags);
        return new RegExpResponder(regexp, response);
    }

    constructor(private regexp: RegExp, private response: string) { }

    getResponses(message: string) {
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