import _ from 'lodash';

import {Command} from 'cli-boilerplate/lib/CliBuilder';

import server from './Server';

export default function (config, name, description) {
    new Command(name || 'server')
      .description(description || 'Runs server')
      .option('-p, --port [PORT]', 'Sets server port')
      .action(args => {
            if (args.port) {
                process.env.PORT = args.port;
            } else if (config.port) {
                process.env.PORT = config.port;
            }

            return server(config);
        },
        {watch: true, memorySize: config.memorySize, gcInterval: config.gcInterval});
}