import chalk from 'chalk';

const BANNER_TEXT = '[JAEGER-MCP-SERVER]';
const BANNER_BG_COLOR = '#628816';
const BANNER_TEXT_COLOR = '#5ECAE0';

/** When true, no log output. Set to false if JAEGER_DEBUG=1 or DEBUG is set. */
const DISABLED =
    process.env.JAEGER_DEBUG !== '1' && process.env.DEBUG === undefined;

let debugEnabled =
    process.env.JAEGER_DEBUG === '1' || process.env.DEBUG !== undefined;

function _timeAsString(): string {
    const date: Date = new Date();
    return `${date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
        timeZoneName: 'short',
    })}`;
}

function _normalizeArgs(...args: unknown[]): unknown[] {
    if (isDebugEnabled()) {
        return args;
    } else {
        return (args || []).map((arg: unknown) => {
            if (!arg) {
                return '';
            }
            if (arg instanceof Error) {
                return `${arg.name}: ${arg.message}`;
            }
            if (
                typeof arg === 'object' &&
                arg !== null &&
                'name' in arg &&
                'message' in arg &&
                'stack' in arg
            ) {
                return `${(arg as Error).name}: ${(arg as Error).message}`;
            }
            return arg;
        });
    }
}

export function isDebugEnabled(): boolean {
    return debugEnabled;
}

export function setDebugEnabled(enabled: boolean): void {
    debugEnabled = enabled;
}

export function debug(...args: unknown[]): void {
    if (DISABLED) {
        return;
    }
    if (isDebugEnabled()) {
        console.debug(
            chalk.bgHex(BANNER_BG_COLOR).hex(BANNER_TEXT_COLOR)(BANNER_TEXT),
            _timeAsString(),
            '|',
            chalk.blue('DEBUG'),
            '-',
            ..._normalizeArgs(...args)
        );
    }
}

export function info(...args: unknown[]): void {
    if (DISABLED) {
        return;
    }
    console.info(
        chalk.bgHex(BANNER_BG_COLOR).hex(BANNER_TEXT_COLOR)(BANNER_TEXT),
        _timeAsString(),
        '|',
        chalk.green('INFO '),
        '-',
        ..._normalizeArgs(...args)
    );
}

export function warn(...args: unknown[]): void {
    if (DISABLED) {
        return;
    }
    console.warn(
        chalk.bgHex(BANNER_BG_COLOR).hex(BANNER_TEXT_COLOR)(BANNER_TEXT),
        _timeAsString(),
        '|',
        chalk.yellow('WARN '),
        '-',
        ..._normalizeArgs(...args)
    );
}

export function error(...args: unknown[]): void {
    if (DISABLED) {
        return;
    }
    console.error(
        chalk.bgHex(BANNER_BG_COLOR).hex(BANNER_TEXT_COLOR)(BANNER_TEXT),
        _timeAsString(),
        '|',
        chalk.red('ERROR'),
        '-',
        ..._normalizeArgs(...args)
    );
}

function _getCircularReplacer() {
    const seen = new WeakSet();
    return (key: string, value: unknown) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return;
            }
            seen.add(value);
        }
        return value;
    };
}

export function toJson(obj: unknown): string {
    return JSON.stringify(obj, _getCircularReplacer());
}
