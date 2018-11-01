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