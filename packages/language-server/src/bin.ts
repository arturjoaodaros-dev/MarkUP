import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { startServer } from './server.ts';

// Transport (--stdio, --node-ipc, --socket=…) is chosen from the command line.
startServer(createConnection(ProposedFeatures.all));
