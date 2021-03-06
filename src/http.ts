import express = require('express');
import qr = require('qr-image');
import {HTTP_PORT, debug} from './config';
import {Scuttlebot} from './scuttlebot';
import {Server} from 'http';
import {Pick2} from './utils';
import pull = require('pull-stream');
import makeServeViewer = require('./viewer/index');

interface QRSVG {
  size: number;
  path: string;
}

export interface Options {
  bot:
    Pick<Scuttlebot, 'id'> &
    Pick2<Scuttlebot, 'invite', 'create'>;
  port?: number;
}

function reportIfError(err: any) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
}

export type PullStream<T> = (end: boolean | any, cb: (err: any, data?: T) => void) => void;

function createInvite(sbot: any, n: number): PullStream<string> {
  return function readInvite(end: boolean | any, cb: (err: any, data?: string) => void) {
    if (end === true) {
      return;
    }
    if (end) {
      return cb(end);
    }
    sbot.invite.create(n, cb);
  };
}

/**
 * Sets up and runs an Express HTTP/HTML server.
 * @param {Options} opts
 */
export function setupExpressApp(opts: Readonly<Options>): Server {
  const port = opts.port || HTTP_PORT;

  const app = express();
  app.use(express.static(__dirname + '/public'));
  app.use(require('body-parser').urlencoded({ extended: true }));
  app.set('port', port);
  app.set('views', __dirname + '/../pages');
  app.set('view engine', 'ejs');

  type Route = '/' | '/invited' | '/invited/json' | '/view/*';

  const idQR: QRSVG = qr.svgObject(opts.bot.id);
  const serveViewer = makeServeViewer(opts.bot, {viewer: {base: '/view/'}});

  app.get('/' as Route, (req: express.Request, res: express.Response) => {
    res.render('index', {
      id: opts.bot.id,
      qrSize: idQR.size,
      qrPath: idQR.path,
    });
  });

  app.get('/invited' as Route, (req: express.Request, res: express.Response) => {
    pull(
      createInvite(opts.bot, 1),
      pull.take(1),
      pull.drain((invitation: string) => {
        const qrCode = qr.svgObject(invitation) as QRSVG;
        res.render('invited', {
          invitation: invitation,
          qrSize: qrCode.size,
          qrPath: qrCode.path,
        });
      }, reportIfError),
    );
  });

  app.get('/invited/json' as Route, (req: express.Request, res: express.Response) => {
    pull(
      createInvite(opts.bot, 1),
      pull.take(1),
      pull.drain((invitation: string) => {
        res.json({invitation});
      }, reportIfError),
    );
  });

  app.get('/view/*' as Route, serveViewer);

  return app.listen(app.get('port'), () => {
    debug('Express app is running on port %s', app.get('port'));
  });
}