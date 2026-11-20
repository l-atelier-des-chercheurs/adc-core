var express = require("express");

var http = require("http");
var https = require("https");
var path = require("path"),
  compression = require("compression");
const helmet = require("helmet");
const slowDown = require("express-slow-down").default;

const sockets = require("./sockets"),
  api2 = require("./api2"),
  journal = require("./journal"),
  serverRTC = require("./serverRTC.js"),
  dev = require("./dev-log"),
  staticGuard = require("./static-guard"),
  { loadHttpsOptions } = require("./load-ssl");
// cors_for_ressources = require("./cors_for_ressources"),

module.exports = function () {
  dev.logverbose("Starting server 1");

  const app = express();

  // behind a reverse proxy (nginx…), req.ip is the visitor's, read from
  // X-Forwarded-For, but only from a proxy trusted here. By default, one on
  // this machine or on a private network ("loopback, uniquelocal"): nginx
  // in front of the app, or in front of its Docker container (172.x). A
  // visitor reaching the app straight from the internet can't forge it.
  // Without it, every visitor shares the proxy's IP: the API's slow down
  // (below) and the feedback limit apply to all of them together.
  // req.ip only counts for these limits, never for rights.
  // settings.json: "trust_proxy", any value Express takes ("loopback", an
  // IP or a subnet, a number of hops…), false to never trust it.
  // true would take the header from anyone, who could then pick their IP
  // (express-rate-limit says so in the logs): taken as 1, one proxy in front
  let trust_proxy = global.settings.trust_proxy;
  if (trust_proxy === undefined) trust_proxy = "loopback, uniquelocal";
  if (trust_proxy === true) trust_proxy = 1;
  app.set("trust proxy", trust_proxy);

  app.use(compression());

  app.use(
    helmet({
      // todo: set correct CSP
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
      // OSM tile servers require Referer for anonymous usage.
      referrerPolicy: { policy: "origin-when-cross-origin" },
      // X-Frame-Options can't allow specific domains, frame-ancestors below replaces it
      frameguard: false,
    })
  );

  const frame_ancestors = _getFrameAncestors();
  app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", `frame-ancestors ${frame_ancestors}`);
    next();
  });

  // Rate limiting middleware, slow down API requests after the limit is
  // reached: per visitor, as req.ip says (trust proxy, above)
  const apiSpeedLimiter = slowDown({
    windowMs: 1 * 60 * 1000,
    delayAfter: 60,
    delayMs: () => 100,
    maxDelayMs: 1000,
    // keyGenerator: (req) => {
    //   // Use the proper IP address extraction for IPv6 compatibility
    //   return req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    // },
  });
  // Apply rate limiting only to _api2 endpoints
  app.use("/_api2", apiSpeedLimiter);

  const https_options =
    global.settings.protocol === "https"
      ? loadHttpsOptions(global.settings, __dirname)
      : null;

  if (
    global.settings.protocol === "https" &&
    global.settings.redirect_port !== ""
  ) {
    // redirect from http (port 80) to https (port 443) for example
    http
      .createServer((req, res) => {
        res.writeHead(301, {
          Location: "https://" + req.headers["host"] + req.url,
        });
        res.end();
      })
      .listen(global.settings.redirect_port);
  }

  let server =
    global.settings.protocol === "https"
      ? https.createServer(https_options, app)
      : http.createServer(app);

  dev.logverbose("Starting server 2");
  sockets.init(server);

  dev.logverbose("Starting express-settings");

  app.set("port", global.appInfos.port); //Server's port number
  // the app's views folder (optional) overrides the core's index.pug / perf.pug
  app.set(
    "views",
    [global.appPaths.views, path.join(__dirname, "views")].filter(Boolean)
  );
  app.set("view engine", "pug"); //View engine is Pug

  // prevent access to internal/sensitive files that live in content root
  // (meta.txt, tokens.json, journal/, feedback/), however their path is
  // written (static-guard.js)
  app.use(function (req, res, next) {
    if (staticGuard.isInternalPath(req.path))
      res.status(403).send(`Access not allowed.`);
    // TODO: allow loading medias from domains that admin has allowed (set to ”domain1”, ”domain2”, ”domain3”, etc., or to "all")
    // else if (!(cors_for_ressources.allowed(req, res, next)))
    //   res.status(403).send(`Access not allowed.`);
    else next();
  });

  app.use(express.static(global.pathToUserContent));
  app.use(
    "/_client",
    express.static(global.appPaths.clientDist, {
      setHeaders: (res, filePath) => {
        // `build.js` is the ES module entry. It must not be cached "forever"
        // (we don't add `?v=` to it, because that breaks ESM singleton identity).
        if (filePath.endsWith(path.sep + "build.js")) {
          res.setHeader("Cache-Control", "no-cache");
          return;
        }
        // Vite emits hashed assets in /assets; those can be cached aggressively.
        if (filePath.includes(path.sep + "assets" + path.sep)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );

  // app.use(express.urlencoded({ extended: true }));
  // inflate: false — never decompress request bodies: the client never sends
  // compressed ones, and Node < 24.22.1 has an RCE in its Brotli decoder (CVE-2026-111497)
  app.use(express.json({ limit: "4mb", inflate: false })); // To parse the incoming requests with JSON payloads
  app.locals.pretty = true;

  journal.log({
    message: "Server up and running",
    from: "server",
  });

  serverRTC(server);

  journal.log({
    message: "Server RTC initialized",
    from: "server",
  });

  api2.init(app);

  dev.logverbose("API ready");

  server.listen(app.get("port"), () => {
    const message = `Server up and running. Go to ${global.settings.protocol}://${global.settings.host}:${global.appInfos.port}`;
    dev.log(message);
    journal.log({
      message,
      from: "server",
    });
  });
};

// builds the frame-ancestors value from settings.allowed_iframe_origins,
// for example ["https://example.com", "https://*.example.org"] or ["*"]
function _getFrameAncestors() {
  const allowed_origins = global.settings.allowed_iframe_origins;
  if (!Array.isArray(allowed_origins) || allowed_origins.length === 0)
    return "'self'";

  if (allowed_origins.includes("*")) return "*";

  const valid_origins = allowed_origins.filter((origin) => {
    // prevent injecting other CSP directives or keywords
    const is_valid =
      typeof origin === "string" && /^[^\s;,'"]+$/.test(origin);
    if (!is_valid)
      dev.error(`allowed_iframe_origins: ignoring invalid value ${origin}`);
    return is_valid;
  });

  return ["'self'", ...valid_origins].join(" ");
}
