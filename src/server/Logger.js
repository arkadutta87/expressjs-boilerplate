import Winston from 'winston';
import Path from 'path';

export default (logDirectory) => {
    Winston.emitErrs = true;

    const logger = new Winston.Logger({
        transports: [
            new Winston.transports.File({
                name: 'access_all',
                level: 'info',
                filename: Path.join(logDirectory, 'access_all.log'),
                handleExceptions: true,
                json: true,
                colorize: false
            }),

            new Winston.transports.File({
                name: 'access_error',
                level: 'error',
                filename: Path.join(logDirectory, 'access_error.log'),
                handleExceptions: true,
                json: true,
                colorize: false
            }),

            new Winston.transports.Console({
                name: 'console',
                level: 'trace',
                handleExceptions: true,
                json: false,
                colorize: true
            })
        ],

        exitOnError: false
    });

    Winston.loggers.add('API_ERRORS', {
        console: {
            level: 'error',
            colorize: true,
            label: 'API_ERROR'
        },
        file: {
            filename: Path.join(logDirectory, 'api_error.log')
        }
    });

    return logger;
};