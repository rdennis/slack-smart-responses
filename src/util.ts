import { Message } from "@slack/events-api";

export function number(value: string, defaultVal: number) {
    let num = Number(value);
    return isNaN(num) ? defaultVal : num;
}

export function string(value: string, defaultVal: string) {
    return typeof value !== 'undefined' ? value : defaultVal;
}

export function bool(value: string, defaultVal: boolean) {
    if (typeof value === 'undefined') {
        return defaultVal;
    }

    value = (value || '').trim().toLocaleLowerCase();

    return value === 'true';
}

export function getEnvVal(key: string): string
export function getEnvVal<T>(key: string, converter: (str: string, defaultVal: T) => T, defaultVal?: T): T
export function getEnvVal<T>(key: string, converter?: (str: string, defaultVal: T) => T, defaultVal?: T): T | string {
    let strValue = process.env[key];

    if (typeof converter !== 'undefined') {
        return converter(strValue, defaultVal);
    }

    return strValue;
}

const fmtRegExp = /$\d+/g;
/**
 * Formats a string using `$n` placeholders (like regex).
 * @example fmt('My $0 function is $1!', 'format', 'awesome')
 * @param str The string containing placeholders
 * @param args The replacement values
 */
export function fmt(str: string, ...args: any[]): string {
    // if no replacements given, bail
    if (!args || args.length < 1) {
        return str;
    }

    // replace everything like $0 (that we got a replacement for)
    return str.replace(fmtRegExp, (_, capture) => {
        // make sure our capture is a valid int
        // the regex should do that, but let's be explicit
        const index = parseInt(capture, 10);

        // make sure index is in within args and not NaN
        // logical operators with NaN return false
        return args.length > index ? args[index] : _;
    });
}