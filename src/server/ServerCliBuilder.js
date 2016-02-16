import _ from 'lodash';

import {Command} from 'cli-boilerplate/lib/CliBuilder';

import server from './Server';

export default function (config) {
    new Command(`server`)
      .description(`Runs server`)
      .action(() => server(config), {watch: true, memorySize: config.memorySize, gcInterval: config.gcInterval});
}