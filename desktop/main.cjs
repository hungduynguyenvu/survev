const {
    app,
    BrowserWindow,
    session,
} = require("electron");

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = 3000;

const LOCAL_URL = `http://${HOST}:${PORT}/`;

const API_HOST = "api.survev.io";
const API_ORIGIN = `https://${API_HOST}`;

const PARTITION = "persist:survev-desktop";

let server = null;
let win = null;
let appSession = null;

let authInProgress = false;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",

    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",

    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",

    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",

    ".mp4": "video/mp4",
    ".webm": "video/webm",
};

function getDistDir() {
    if (app.isPackaged) {
        return path.join(
            path.dirname(process.execPath),
            "client",
        );
    }

    return path.resolve(
        __dirname,
        "..",
        "client",
        "dist",
    );
}

function getStaticFilePath(requestUrl) {
    const distDir = getDistDir();

    const url = new URL(
        requestUrl || "/",
        LOCAL_URL,
    );

    let pathname;

    try {
        pathname = decodeURIComponent(url.pathname);
    } catch {
        return null;
    }

    if (pathname === "/") {
        pathname = "/index.html";
    }

    if (pathname === "/stats") {
        pathname = "/stats/";
    }

    let filePath = path.resolve(
        distDir,
        "." + pathname,
    );

    if (
        filePath !== distDir
        && !filePath.startsWith(distDir + path.sep)
    ) {
        return null;
    }

    if (
        fs.existsSync(filePath)
        && fs.statSync(filePath).isDirectory()
    ) {
        filePath = path.join(
            filePath,
            "index.html",
        );
    }

    return filePath;
}

function serveStatic(req, res) {
    const filePath = getStaticFilePath(req.url);

    if (
        !filePath
        || !fs.existsSync(filePath)
        || !fs.statSync(filePath).isFile()
    ) {
        res.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8",
        });

        res.end("Not found");
        return;
    }

    const extension =
        path.extname(filePath).toLowerCase();

    res.writeHead(200, {
        "Content-Type":
            MIME_TYPES[extension]
            || "application/octet-stream",

        "Cache-Control": "no-cache",
    });

    fs.createReadStream(filePath).pipe(res);
}

/*
 * The OAuth login itself must happen directly on api.survev.io.
 *
 * We merely redirect the browser there.
 */
function redirectToOfficialAuth(req, res) {
    res.writeHead(302, {
        Location: `${API_ORIGIN}${req.url}`,
        "Cache-Control": "no-store",
    });

    res.end();
}

/*
 * Normal /api requests are forwarded to the official API.
 *
 * Since the browser is talking to localhost, its LOCAL "session"
 * cookie will arrive here. We forward that exact cookie header to
 * the official API.
 */
function proxyApiRequest(req, res) {
    const headers = {
        ...req.headers,
        host: API_HOST,
    };

    const options = {
        hostname: API_HOST,
        port: 443,
        method: req.method,
        path: req.url,
        headers,
    };

    const proxyReq = https.request(
        options,
        (proxyRes) => {
            const responseHeaders = {
                ...proxyRes.headers,
            };

            /*
             * Authenticated API calls can refresh/delete the session
             * cookie.
             *
             * Make those cookies valid for localhost:
             *
             *   Domain=survev.io → removed
             *   Secure           → removed
             *
             * The token/value itself is NOT changed.
             */
            if (responseHeaders["set-cookie"]) {
                responseHeaders["set-cookie"] =
                    responseHeaders["set-cookie"].map(
                        (cookie) => {
                            return cookie
                                .replace(
                                    /;\s*Domain=[^;]+/gi,
                                    "",
                                )
                                .replace(
                                    /;\s*Secure/gi,
                                    "",
                                );
                        },
                    );
            }

            /*
             * We're same-origin from the renderer's perspective,
             * so upstream CORS headers are unnecessary.
             */
            delete responseHeaders[
                "access-control-allow-origin"
            ];

            delete responseHeaders[
                "access-control-allow-credentials"
            ];

            res.writeHead(
                proxyRes.statusCode || 502,
                responseHeaders,
            );

            proxyRes.pipe(res);
        },
    );

    proxyReq.on("error", (error) => {
        console.error(
            "Survev API proxy error:",
            error.message,
        );

        if (!res.headersSent) {
            res.writeHead(502, {
                "Content-Type":
                    "text/plain; charset=utf-8",
            });
        }

        res.end("API proxy error");
    });

    req.pipe(proxyReq);
}

function isAuthStartPath(url) {
    return (
        url === "/api/auth/google"
        || url === "/api/auth/google/"
        || url === "/api/auth/discord"
        || url === "/api/auth/discord/"
    );
}

function startServer() {
    return new Promise((resolve, reject) => {
        server = http.createServer(
            (req, res) => {
                const requestUrl =
                    req.url || "/";

                /*
                 * OAuth START:
                 *
                 * Redirect the BrowserWindow to the REAL API.
                 * Do not proxy these requests.
                 */
                if (
                    isAuthStartPath(
                        new URL(
                            requestUrl,
                            LOCAL_URL,
                        ).pathname,
                    )
                ) {
                    authInProgress = true;

                    redirectToOfficialAuth(
                        req,
                        res,
                    );

                    return;
                }

                /*
                 * Everything else under /api is normal API traffic.
                 */
                if (
                    requestUrl.startsWith(
                        "/api/",
                    )
                ) {
                    proxyApiRequest(req, res);
                    return;
                }

                serveStatic(req, res);
            },
        );

        server.once("error", reject);

        server.listen(
            PORT,
            HOST,
            resolve,
        );
    });
}

/*
 * OAuth creates the genuine Survev session cookie on the
 * official domain.
 *
 * Electron's main process can read that cookie from its own cookie
 * jar. We copy the SAME value to the localhost origin so that our
 * local API proxy can forward it.
 *
 * Never print this value to the console.
 */
async function bridgeOfficialSessionToLocal() {
    const cookies =
        await appSession.cookies.get({
            name: "session",
        });

    const officialSession =
        cookies.find((cookie) => {
            const domain =
                cookie.domain.replace(
                    /^\./,
                    "",
                );

            return (
                domain === "survev.io"
                || domain.endsWith(
                    ".survev.io",
                )
            );
        });

    if (!officialSession) {
        console.error(
            "OAuth completed, but no Survev session cookie was found.",
        );

        return false;
    }

    const localCookie = {
        url: LOCAL_URL,
        name: "session",
        value: officialSession.value,

        path: "/",

        httpOnly: true,
        secure: false,

        sameSite: "lax",
    };

    /*
     * Preserve the server's real expiry so login survives restarts.
     */
    if (officialSession.expirationDate) {
        localCookie.expirationDate =
            officialSession.expirationDate;
    }

    await appSession.cookies.set(
        localCookie,
    );

    /*
     * The client checks this ordinary cookie during Account.init().
     * Without it, Account.init() deliberately does not call login().
     */
    await appSession.cookies.set({
        url: LOCAL_URL,

        name: "app-data",
        value: "1",

        path: "/",

        httpOnly: false,
        secure: false,

        sameSite: "lax",

        expirationDate:
            Date.now() / 1000
            + 60 * 60 * 24 * 30,
    });

    await appSession.cookies.flushStore();

    console.log(
        "Survev login transferred to desktop client.",
    );

    return true;
}

async function createWindow() {
    await startServer();

    appSession = session.fromPartition(
        PARTITION,
        {
            cache: true,
        },
    );

    win = new BrowserWindow({
        width: 1920,
        height: 1080,

        fullscreen: true,
        autoHideMenuBar: true,

        webPreferences: {
            partition: PARTITION,

            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    /*
     * The real OAuth flow runs normally:
     *
     * api.survev.io
     * → Google/Discord
     * → api.survev.io callback
     *
     * We only catch the FINAL 302 to survev.io.
     */
    win.webContents.on(
        "will-redirect",
        (
            event,
            urlString,
        ) => {
            if (!authInProgress) {
                return;
            }

            let url;

            try {
                url = new URL(urlString);
            } catch {
                return;
            }

            if (
                url.hostname !== "survev.io"
                && url.hostname
                    !== "www.survev.io"
            ) {
                return;
            }

            /*
             * Stop the renderer from loading the official frontend.
             */
            event.preventDefault();

            authInProgress = false;

            /*
             * The OAuth callback has already run at this point,
             * so its genuine session cookie is now in Chromium's
             * cookie jar.
             */
            bridgeOfficialSessionToLocal()
                .then((success) => {
                    if (!success) {
                        console.error(
                            "Could not transfer login.",
                        );
                    }

                    return win.loadURL(
                        LOCAL_URL,
                    );
                })
                .catch((error) => {
                    console.error(
                        "Login bridge failed:",
                        error.message,
                    );

                    win.loadURL(
                        LOCAL_URL,
                    );
                });
        },
    );

    await win.loadURL(LOCAL_URL);
}

app.whenReady().then(createWindow);

app.on(
    "window-all-closed",
    () => {
        if (
            process.platform !== "darwin"
        ) {
            app.quit();
        }
    },
);

app.on(
    "before-quit",
    () => {
        if (appSession) {
            appSession.cookies
                .flushStore()
                .catch(() => {});

            appSession
                .flushStorageData();
        }

        if (server) {
            server.close();
            server = null;
        }
    },
);