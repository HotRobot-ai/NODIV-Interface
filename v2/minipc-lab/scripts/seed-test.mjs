import {labConfig} from '../server/config.mjs';import {seedTestDatabase} from '../server/seed.mjs';const c=labConfig();console.log(seedTestDatabase(c.dbPath,c.eventId));
